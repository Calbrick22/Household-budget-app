/**
 * Persistence: the same Postgres tables and the same SQL as db.py, so this app
 * and the Streamlit app can run side by side against one database. Saves that
 * touch several rows run in one transaction.
 */
import { Pool, type PoolClient } from "pg";

export const VALID_TAGS = ["Joint", "Cal", "Dani"] as const;
export type Tag = (typeof VALID_TAGS)[number];
export const VALID_PEOPLE = ["Cal", "Dani"] as const;
import { PAID_FROM, type PaidFrom } from "./paid-from";
export type { PaidFrom };

const DEFAULT_SETTINGS: Record<string, string> = {
  allowance_per_person: "250",
  savings_rate: "0.15",
  joint_share: "0.45",
  easy_access_target: "5000",
};

// Seeded only into an empty bill_templates table, as in db.py.
const STARTER_BILLS: [string, number, Tag][] = [
  ["Mortgage", 1533.26, "Joint"], ["Water", 73.0, "Joint"], ["Utilities", 106.0, "Joint"],
  ["Council Tax", 152.0, "Joint"], ["Building & Contents Insurance", 45.42, "Joint"],
  ["Life Insurance", 73.35, "Cal"], ["WiFi", 33.0, "Joint"], ["Mobile Phone (Cal)", 11.0, "Cal"],
  ["Van", 380.0, "Joint"], ["Van Tax", 28.0, "Joint"], ["Van Insurance", 59.46, "Joint"],
  ["CMS", 514.0, "Cal"], ["Bodhi Pocket Money", 20.0, "Cal"], ["Spotify", 18.0, "Joint"],
  ["Pet Insurance", 15.08, "Joint"], ["Dad House Payment", 200.0, "Cal"],
  ["Mobile Phone (Dani)", 42.0, "Dani"], ["Car Tax (Dani)", 17.06, "Dani"],
  ["Dog Food", 60.0, "Joint"], ["Amazon Prime", 9.0, "Joint"],
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS months (
      id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      current_easy_access_balance NUMERIC NOT NULL DEFAULT 0,
      UNIQUE(year, month))`,
  `CREATE TABLE IF NOT EXISTS bill_templates (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, default_amount NUMERIC NOT NULL DEFAULT 0,
      tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')), active BOOLEAN NOT NULL DEFAULT TRUE)`,
  `CREATE TABLE IF NOT EXISTS bill_entries (
      id SERIAL PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      name TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0,
      tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')),
      template_id INTEGER REFERENCES bill_templates(id))`,
  `CREATE TABLE IF NOT EXISTS income_entries (
      id SERIAL PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      person TEXT NOT NULL CHECK (person IN ('Cal','Dani')), source TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0)`,
  // The settings a month was confirmed with (NULL on drafts).
  `ALTER TABLE months ADD COLUMN IF NOT EXISTS settings_allowance_per_person NUMERIC`,
  `ALTER TABLE months ADD COLUMN IF NOT EXISTS settings_savings_rate NUMERIC`,
  `ALTER TABLE months ADD COLUMN IF NOT EXISTS settings_easy_access_target NUMERIC`,
  // Recurring bills whose amount changes from month to month (the Amex, say):
  // the month check-in asks about these first. The Streamlit app ignores it.
  `ALTER TABLE bill_templates ADD COLUMN IF NOT EXISTS varies BOOLEAN NOT NULL DEFAULT FALSE`,
  // A joint bill paid outside the joint account: from Cal's or Dani's own
  // account, or from Cal's pay before it reaches him. NULL is the joint account.
  `ALTER TABLE bill_templates ADD COLUMN IF NOT EXISTS paid_from TEXT CHECK (paid_from IN ('Cal','Dani','CalPay'))`,
  `ALTER TABLE bill_entries ADD COLUMN IF NOT EXISTS paid_from TEXT CHECK (paid_from IN ('Cal','Dani','CalPay'))`,
  // Which model a confirmed month was worked out with: NULL is the original
  // waterfall, 'share' the joint-share model, with the share it used.
  `ALTER TABLE months ADD COLUMN IF NOT EXISTS settings_model TEXT CHECK (settings_model IN ('share'))`,
  `ALTER TABLE months ADD COLUMN IF NOT EXISTS settings_joint_share NUMERIC`,
];

const FREEZE_SETTINGS_SQL = `
  UPDATE months SET
    settings_allowance_per_person = (SELECT value::numeric FROM settings WHERE key = 'allowance_per_person'),
    settings_savings_rate = (SELECT value::numeric FROM settings WHERE key = 'savings_rate'),
    settings_easy_access_target = (SELECT value::numeric FROM settings WHERE key = 'easy_access_target')`;

// Finishing a month from now on freezes the joint-share model and its share too.
const FINISH_SQL = `
  UPDATE months SET
    confirmed = TRUE,
    settings_allowance_per_person = (SELECT value::numeric FROM settings WHERE key = 'allowance_per_person'),
    settings_savings_rate = (SELECT value::numeric FROM settings WHERE key = 'savings_rate'),
    settings_easy_access_target = (SELECT value::numeric FROM settings WHERE key = 'easy_access_target'),
    settings_model = 'share',
    settings_joint_share = (SELECT value::numeric FROM settings WHERE key = 'joint_share')
  WHERE id = $1`;

// One pool per server instance (kept across hot reloads in development).
const globalForPool = globalThis as unknown as { __hbPool?: Pool; __hbReady?: Promise<void> };

function pool(): Pool {
  if (!globalForPool.__hbPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPool.__hbPool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  }
  return globalForPool.__hbPool;
}

/** Create the tables if needed, seed defaults, and freeze any confirmed month
 *  that has no settings of its own yet - the same start-up work as db.py. */
function ready(): Promise<void> {
  if (!globalForPool.__hbReady) {
    globalForPool.__hbReady = (async () => {
      const c = await pool().connect();
      try {
        for (const statement of SCHEMA) await c.query(statement);
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
          await c.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [key, value]);
        }
        const { rows } = await c.query("SELECT count(*)::int AS n FROM bill_templates");
        if (rows[0].n === 0) {
          for (const [name, amount, tag] of STARTER_BILLS) {
            await c.query("INSERT INTO bill_templates (name, default_amount, tag, active) VALUES ($1, $2, $3, TRUE)", [name, amount, tag]);
          }
        }
        await c.query(FREEZE_SETTINGS_SQL + " WHERE confirmed AND settings_allowance_per_person IS NULL");
      } finally {
        c.release();
      }
    })().catch((err) => {
      globalForPool.__hbReady = undefined; // try again on the next request
      throw err;
    });
  }
  return globalForPool.__hbReady;
}

async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const { rows } = await pool().query(text, params);
  return rows as T[];
}

async function transaction<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await work(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function assertTag(tag: string): asserts tag is Tag {
  if (!(VALID_TAGS as readonly string[]).includes(tag)) throw new Error(`tag must be one of ${VALID_TAGS.join(", ")}`);
}

/** Only a joint bill can be paid from somewhere else; a personal bill is always
 *  paid from its owner's own account. */
function paidFromFor(tag: string, paidFrom: unknown): PaidFrom {
  if (tag !== "Joint" || paidFrom == null || paidFrom === "") return null;
  if (!(PAID_FROM as readonly string[]).includes(String(paidFrom))) throw new Error(`paid from must be one of ${PAID_FROM.join(", ")}`);
  return paidFrom as PaidFrom;
}

// ---------- settings ----------

export interface Settings {
  allowancePerPerson: number;
  /** The joint savings rate of the original waterfall model (months confirmed before December 2026). */
  savingsRate: number;
  easyAccessTarget: number;
  /** The share of each income that goes to joint costs (the joint-share model). */
  jointShare: number;
}

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    allowancePerPerson: Number(m.allowance_per_person),
    savingsRate: Number(m.savings_rate),
    easyAccessTarget: Number(m.easy_access_target),
    jointShare: Number(m.joint_share ?? DEFAULT_SETTINGS.joint_share),
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  await transaction(async (c) => {
    const upsert = "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
    await c.query(upsert, ["allowance_per_person", String(s.allowancePerPerson)]);
    await c.query(upsert, ["easy_access_target", String(s.easyAccessTarget)]);
    await c.query(upsert, ["joint_share", String(s.jointShare)]);
  });
}

// ---------- recurring bills ----------

export interface Template { id: number; name: string; defaultAmount: number; tag: Tag; varies: boolean; paidFrom: PaidFrom }

export async function getActiveTemplates(): Promise<Template[]> {
  const rows = await query<{ id: number; name: string; default_amount: string; tag: Tag; varies: boolean; paid_from: PaidFrom }>(
    "SELECT id, name, default_amount, tag, varies, paid_from FROM bill_templates WHERE active = TRUE ORDER BY name");
  return rows.map((r) => ({ id: r.id, name: r.name, defaultAmount: num(r.default_amount), tag: r.tag, varies: r.varies, paidFrom: r.paid_from }));
}

/** Save the recurring list: removals (soft), edits and additions in one go. */
export async function saveTemplates(rows: { id: number | null; name: string; defaultAmount: number; tag: string; varies: boolean; paidFrom: string | null }[], removedIds: number[]): Promise<void> {
  await transaction(async (c) => {
    for (const id of removedIds) await c.query("UPDATE bill_templates SET active = FALSE WHERE id = $1", [id]);
    for (const r of rows) {
      if (!r.name.trim()) continue;
      assertTag(r.tag);
      const paidFrom = paidFromFor(r.tag, r.paidFrom);
      if (r.id) {
        await c.query("UPDATE bill_templates SET name = $1, default_amount = $2, tag = $3, varies = $4, paid_from = $5 WHERE id = $6",
          [r.name, r.defaultAmount, r.tag, r.varies, paidFrom, r.id]);
      } else {
        await c.query("INSERT INTO bill_templates (name, default_amount, tag, active, varies, paid_from) VALUES ($1, $2, $3, TRUE, $4, $5)",
          [r.name, r.defaultAmount, r.tag, r.varies, paidFrom]);
      }
    }
  });
}

/** What each recurring bill came to in each month it appeared in, oldest first. */
export async function getBillHistory(): Promise<{ templateId: number; year: number; month: number; amount: number }[]> {
  const rows = await query<{ template_id: number; year: number; month: number; amount: string }>(
    `SELECT e.template_id, m.year, m.month, SUM(e.amount) AS amount
     FROM bill_entries e JOIN months m ON m.id = e.month_id
     WHERE e.template_id IS NOT NULL GROUP BY e.template_id, m.year, m.month ORDER BY m.year, m.month`);
  return rows.map((r) => ({ templateId: r.template_id, year: r.year, month: r.month, amount: num(r.amount) }));
}

/** One-off bills from the last six months, newest first, one per name. */
export async function getRecentOneOffs(): Promise<{ name: string; amount: number; tag: Tag }[]> {
  const rows = await query<{ name: string; amount: string; tag: Tag }>(
    `SELECT DISTINCT ON (lower(e.name)) e.name, e.amount, e.tag
     FROM bill_entries e JOIN months m ON m.id = e.month_id
     WHERE e.template_id IS NULL
       AND (m.year * 12 + m.month) > (SELECT max(year * 12 + month) FROM months) - 6
     ORDER BY lower(e.name), m.year DESC, m.month DESC`);
  return rows.map((r) => ({ name: r.name, amount: num(r.amount), tag: r.tag }));
}

// ---------- months ----------

export interface Month { id: number; year: number; month: number; confirmed: boolean; easyAccessBalance: number }

const toMonth = (r: Record<string, unknown>): Month => ({
  id: r.id as number, year: r.year as number, month: r.month as number,
  confirmed: r.confirmed as boolean, easyAccessBalance: num(r.current_easy_access_balance),
});

/** All months, oldest first. */
export async function getMonths(): Promise<Month[]> {
  const rows = await query("SELECT id, year, month, confirmed, current_easy_access_balance FROM months ORDER BY year, month");
  return rows.map(toMonth);
}

export async function getMonth(id: number): Promise<Month | null> {
  const rows = await query("SELECT id, year, month, confirmed, current_easy_access_balance FROM months WHERE id = $1", [id]);
  return rows[0] ? toMonth(rows[0]) : null;
}

/** A new month starts with every active recurring bill. */
export async function getOrCreateMonth(year: number, month: number): Promise<number> {
  return transaction(async (c) => {
    const existing = await c.query("SELECT id FROM months WHERE year = $1 AND month = $2", [year, month]);
    if (existing.rows[0]) return existing.rows[0].id as number;
    const { rows } = await c.query(
      "INSERT INTO months (year, month, confirmed, current_easy_access_balance) VALUES ($1, $2, FALSE, 0) RETURNING id", [year, month]);
    const id = rows[0].id as number;
    await c.query(
      `INSERT INTO bill_entries (month_id, name, amount, tag, template_id, paid_from)
       SELECT $1, name, default_amount, tag, id, paid_from FROM bill_templates WHERE active = TRUE`, [id]);
    return id;
  });
}

export async function deleteMonth(id: number): Promise<void> {
  await query("DELETE FROM months WHERE id = $1", [id]);
}

// ---------- one month's figures ----------

export interface BillEntry { id: number; name: string; amount: number; tag: Tag; templateId: number | null; paidFrom: PaidFrom }
export interface Financials {
  month: Month;
  /** Cal's take-home (what reached his account) and Dani's income. */
  calIncome: number; daniIncome: number;
  billsTotal: number; calBills: number; daniBills: number;
  /** Joint bills paid outside the joint account. */
  calFromPay: number; calFromAccount: number; daniFromAccount: number;
  /** The settings frozen when the month was confirmed; null on drafts. */
  frozenSettings: Settings | null;
  /** The model a confirmed month was worked out with; null on drafts. */
  frozenModel: "waterfall" | "share" | null;
}

export async function getFinancials(id: number): Promise<Financials | null> {
  const rows = await query(`
    SELECT m.id, m.year, m.month, m.confirmed, m.current_easy_access_balance,
      m.settings_allowance_per_person, m.settings_savings_rate, m.settings_easy_access_target,
      m.settings_model, m.settings_joint_share,
      COALESCE((SELECT SUM(amount) FROM income_entries WHERE month_id = m.id AND person = 'Cal'), 0) AS cal_income,
      COALESCE((SELECT SUM(amount) FROM income_entries WHERE month_id = m.id AND person = 'Dani'), 0) AS dani_income,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id), 0) AS bills_total,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id AND tag = 'Cal'), 0) AS cal_bills,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id AND tag = 'Dani'), 0) AS dani_bills,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id AND tag = 'Joint' AND paid_from = 'CalPay'), 0) AS cal_from_pay,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id AND tag = 'Joint' AND paid_from = 'Cal'), 0) AS cal_from_account,
      COALESCE((SELECT SUM(amount) FROM bill_entries WHERE month_id = m.id AND tag = 'Joint' AND paid_from = 'Dani'), 0) AS dani_from_account
    FROM months m WHERE m.id = $1`, [id]);
  const r = rows[0];
  if (!r) return null;
  const allowance = numOrNull(r.settings_allowance_per_person);
  return {
    month: toMonth(r),
    calIncome: num(r.cal_income), daniIncome: num(r.dani_income),
    billsTotal: num(r.bills_total), calBills: num(r.cal_bills), daniBills: num(r.dani_bills),
    calFromPay: num(r.cal_from_pay), calFromAccount: num(r.cal_from_account), daniFromAccount: num(r.dani_from_account),
    frozenSettings: allowance == null ? null : {
      allowancePerPerson: allowance,
      savingsRate: num(r.settings_savings_rate),
      easyAccessTarget: num(r.settings_easy_access_target),
      jointShare: num(r.settings_joint_share),
    },
    frozenModel: allowance == null ? null : r.settings_model === "share" ? "share" : "waterfall",
  };
}

/** Every month's figures in one round trip, oldest first. */
export async function getAllFinancials(): Promise<Financials[]> {
  const months = await getMonths();
  return (await Promise.all(months.map((m) => getFinancials(m.id)))).filter((f): f is Financials => f != null);
}

export async function getBillEntries(monthId: number): Promise<BillEntry[]> {
  const rows = await query<{ id: number; name: string; amount: string; tag: Tag; template_id: number | null; paid_from: PaidFrom }>(
    "SELECT id, name, amount, tag, template_id, paid_from FROM bill_entries WHERE month_id = $1 ORDER BY name", [monthId]);
  return rows.map((r) => ({ id: r.id, name: r.name, amount: num(r.amount), tag: r.tag, templateId: r.template_id, paidFrom: r.paid_from }));
}

export async function getIncome(monthId: number): Promise<Record<string, number>> {
  const rows = await query<{ person: string; source: string; amount: string }>(
    "SELECT person, source, amount FROM income_entries WHERE month_id = $1", [monthId]);
  return Object.fromEntries(rows.map((r) => [`${r.person}:${r.source}`, num(r.amount)]));
}

export interface MonthSave {
  monthId: number;
  bills: { id: number | null; name: string; amount: number; tag: string; paidFrom: string | null }[];
  removedIds: number[];
  /** Bill ids whose change should also update the recurring list. */
  carryForwardIds: number[];
  calSalary: number; calRaf: number; daniIncome: number;
  easyAccessBalance: number;
  /** Confirm the month (and freeze its settings) as part of the save. */
  finish: boolean;
}

/** Everything the month editor saves, in one transaction. */
export async function saveMonth(s: MonthSave): Promise<void> {
  await transaction(async (c) => {
    for (const id of s.removedIds) await c.query("DELETE FROM bill_entries WHERE id = $1 AND month_id = $2", [id, s.monthId]);
    for (const b of s.bills) {
      if (!b.name.trim()) continue;
      assertTag(b.tag);
      const paidFrom = paidFromFor(b.tag, b.paidFrom);
      if (b.id) {
        await c.query("UPDATE bill_entries SET name = $1, amount = $2, tag = $3, paid_from = $4 WHERE id = $5 AND month_id = $6",
          [b.name, b.amount, b.tag, paidFrom, b.id, s.monthId]);
        if (s.carryForwardIds.includes(b.id)) {
          await c.query(
            `UPDATE bill_templates SET name = $1, default_amount = $2, tag = $3, paid_from = $4
             WHERE id = (SELECT template_id FROM bill_entries WHERE id = $5)`, [b.name, b.amount, b.tag, paidFrom, b.id]);
        }
      } else {
        await c.query("INSERT INTO bill_entries (month_id, name, amount, tag, paid_from) VALUES ($1, $2, $3, $4, $5)", [s.monthId, b.name, b.amount, b.tag, paidFrom]);
      }
    }
    for (const [person, source, amount] of [["Cal", "Salary", s.calSalary], ["Cal", "RAF", s.calRaf], ["Dani", "Income", s.daniIncome]] as const) {
      const existing = await c.query("SELECT id FROM income_entries WHERE month_id = $1 AND person = $2 AND source = $3", [s.monthId, person, source]);
      if (existing.rows[0]) await c.query("UPDATE income_entries SET amount = $1 WHERE id = $2", [amount, existing.rows[0].id]);
      else await c.query("INSERT INTO income_entries (month_id, person, source, amount) VALUES ($1, $2, $3, $4)", [s.monthId, person, source, amount]);
    }
    await c.query("UPDATE months SET current_easy_access_balance = $1 WHERE id = $2", [s.easyAccessBalance, s.monthId]);
    if (s.finish) {
      await c.query(FINISH_SQL, [s.monthId]);
    }
  });
}
