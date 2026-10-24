// The cards of the month screen: Cal, Joint and Dani side by side, what each
// opens into, the working, the comparison and the settings used.
import type { WaterfallResult } from "@/lib/calculations";
import type { BillEntry, Settings } from "@/lib/db";
import { money, pct, ratePct } from "@/lib/format";
import { Avatar, Row } from "./money";
import { Roll, RollingBig } from "./rolling";
import { CopyAmount } from "./card-detail";
import { StackedBars } from "./charts";

/** One month's figures for the small history charts. */
export interface HistoryPoint {
  label: string; draft: boolean;
  calSavings: number; daniSavings: number; easy: number; long: number; balance: number;
}

export function PersonLane({ r, who }: { r: WaterfallResult; who: "Cal" | "Dani" }) {
  const cal = who === "Cal";
  const income = cal ? r.calIncome : r.daniIncome;
  const bills = cal ? r.calPersonalBills : r.daniPersonalBills;
  const toJoint = cal ? r.calToJoint : r.daniToJoint;
  const savings = cal ? r.calPersonalSavings : r.daniPersonalSavings;
  const totalOut = toJoint + r.allowancePerPerson + savings;
  const jointSub = toJoint < 0
    ? <span style={{ color: "var(--negative)" }}>would be {money(toJoint)}, see the note above</span>
    : "joint savings and bills";
  return (
    <section className="card lane" aria-label={`${who}'s account`}>
      <div className="lane-head"><Avatar who={who} /><h2>{who}&apos;s account</h2></div>
      <p className="lane-label">Transferred out, in this order</p>
      <RollingBig value={Math.max(totalOut, 0)} />
      <p className="calc">{money(income)} income − {money(bills)} personal bills</p>
      <ol className="moves">
        <li><Row label="Joint account" value={<Roll value={Math.max(toJoint, 0)} />} sub={jointSub} /></li>
        <li><Row label="Personal account" value={<Roll value={r.allowancePerPerson} />} sub="allowance" /></li>
        <li><Row label="Personal savings" value={<Roll value={savings} />} /></li>
      </ol>
      <div className="foot"><Row label="Left in account for personal bills" value={<Roll value={bills} />} cls="total" /></div>
    </section>
  );
}

export function JointLane({ r }: { r: WaterfallResult }) {
  return (
    <section className="card lane" aria-label="Joint account">
      <div className="lane-head"><Avatar who="Joint" /><h2>Joint account</h2></div>
      <p className="lane-label">Comes in from you both</p>
      <RollingBig value={r.calToJoint + r.daniToJoint} />
      <p className="calc">Cal {money(r.calToJoint)} + Dani {money(r.daniToJoint)}</p>
      <Row label="Joint bills" value={<Roll value={r.jointBillsTotal} />} />
      <Row label="Joint savings" value={<Roll value={r.jointSavings} />} sub={`${ratePct(r.savingsRate)} of the ${money(Math.max(r.remainder, 0))} left after bills and allowances`} />
      <Row label="To easy-access pot" value={<Roll value={r.toEasyAccess} />} cls="indent" />
      <Row label="To long-term pot" value={<Roll value={r.toLongTerm} />} cls="indent" />
      <div className="foot"><Row label="Paid out" value={<Roll value={r.jointBillsTotal + r.jointSavings} />} cls="total" /></div>
    </section>
  );
}

function BillList({ bills, empty }: { bills: BillEntry[]; empty: string }) {
  if (!bills.length) return <p className="empty small">{empty}</p>;
  return <>{bills.map((b) => <Row key={b.id} label={b.name} value={money(b.amount)} />)}</>;
}

/** Everything about one person's month: what to move and where, with each
 *  amount ready to copy into a banking app. */
export function PersonDetail({ r, who, income, bills, history }: {
  r: WaterfallResult; who: "Cal" | "Dani"; income: [string, number][]; bills: BillEntry[]; history: HistoryPoint[];
}) {
  const cal = who === "Cal";
  const toJoint = Math.max(cal ? r.calToJoint : r.daniToJoint, 0);
  const savings = cal ? r.calPersonalSavings : r.daniPersonalSavings;
  const own = cal ? r.calPersonalBills : r.daniPersonalBills;
  const transfers: [string, string, number][] = [
    ["Joint account", "joint savings and bills", toJoint],
    ["Personal account", "allowance", r.allowancePerPerson],
    ["Personal savings", `${pct(cal ? r.calContributionShare : r.daniContributionShare)} of the personal savings`, savings],
  ];
  return (
    <div className="detail-grid">
      <section className="detail-section">
        <h3>Transfers to make</h3>
        <ol className="transfers">
          {transfers.map(([name, sub, v]) => (
            <li key={name}>
              <span><b>{name}</b><span className="sub">{sub}</span></span>
              <span className="amt">{money(v)}</span>
              <CopyAmount value={v} what={`${name} amount`} />
            </li>
          ))}
        </ol>
        <Row label="Stays in the account for personal bills" value={money(own)} cls="total" />
      </section>
      <section className="detail-section">
        <h3>Income</h3>
        {income.map(([n, v]) => <Row key={n} label={n} value={money(v)} />)}
        <Row label="Total" value={money(cal ? r.calIncome : r.daniIncome)} cls="total" />
        <h3 className="detail-gap">Personal bills</h3>
        <BillList bills={bills} empty={`No personal bills for ${who} this month.`} />
        {bills.length > 0 && <Row label="Total" value={money(own)} cls="total" />}
      </section>
      <section className="detail-section span">
        <h3>Personal savings, month by month</h3>
        <p className="calc" style={{ margin: "2px 0 0" }}>The confirmed months up to this one{history.some((h) => h.draft) ? " (this month is still a draft)" : ""}.</p>
        <StackedBars labels={history.map((h) => h.label)} pounds height={180}
          series={[{ name: `${who}'s personal savings`, values: history.map((h) => (cal ? h.calSavings : h.daniSavings)), color: cal ? "var(--cal-mid)" : "var(--dani-mid)" }]} />
      </section>
    </div>
  );
}

export function JointDetail({ r, bills, history }: { r: WaterfallResult; bills: BillEntry[]; history: HistoryPoint[] }) {
  return (
    <div className="detail-grid">
      <section className="detail-section">
        <h3>Comes in</h3>
        <Row label="From Cal" value={money(r.calToJoint)} sub={`${pct(r.calContributionShare)} of the pot`} />
        <Row label="From Dani" value={money(r.daniToJoint)} sub={`${pct(r.daniContributionShare)} of the pot`} />
        <Row label="Total" value={money(r.calToJoint + r.daniToJoint)} cls="total" />
        <h3 className="detail-gap">Saved</h3>
        <Row label={`Joint savings (${ratePct(r.savingsRate)})`} value={money(r.jointSavings)} />
        <Row label="To easy-access pot" value={money(r.toEasyAccess)} cls="indent" />
        <Row label="To long-term pot" value={money(r.toLongTerm)} cls="indent" />
      </section>
      <section className="detail-section">
        <h3>Joint bills</h3>
        <BillList bills={bills} empty="No joint bills this month." />
        {bills.length > 0 && <Row label="Total" value={money(r.jointBillsTotal)} cls="total" />}
      </section>
      <section className="detail-section span">
        <h3>Joint savings, month by month</h3>
        <StackedBars labels={history.map((h) => h.label)} pounds height={180}
          series={[
            { name: "Easy-access", values: history.map((h) => h.easy), color: "var(--joint-mid)" },
            { name: "Long-term", values: history.map((h) => h.long), color: "var(--joint)" },
          ]} />
      </section>
    </div>
  );
}

/** Warnings that must stay in view: a shortfall, and a transfer that would go negative. */
export function MonthNotes({ r }: { r: WaterfallResult }) {
  const notes = ([["Cal", r.calToJoint, "his"], ["Dani", r.daniToJoint, "her"]] as const).filter(([, v]) => v < 0);
  if (!notes.length && !r.isShortfall) return null;
  return (
    <div style={{ marginTop: 12 }}>
      {r.isShortfall && (
        <p className="alert bad" role="alert">
          Shortfall this month: income doesn&apos;t cover bills and allowances by {money(-r.remainder)}. Nothing has been
          adjusted automatically - decide how to handle it and re-edit the month if needed.
        </p>
      )}
      {notes.map(([who, , pronoun]) => (
        <p key={who} className="alert bad" role="alert">
          {who}&apos;s allowance and savings add up to more than what&apos;s left after {pronoun} own bills this month -
          the joint transfer can&apos;t go negative, so the shortfall needs covering another way.
        </p>
      ))}
    </div>
  );
}

/** The waterfall step by step, in the model's own order (shown in the drill-down panel). */
export function WorkingSteps({ r }: { r: WaterfallResult }) {
  return (
    <>
      <div className="step">
        <p className="step-title">1. Income, less each person&apos;s own bills</p>
        <Row label="Cal" value={money(r.calRemainder)} sub={`${money(r.calIncome)} income − ${money(r.calPersonalBills)} personal bills`} />
        <Row label="Dani" value={money(r.daniRemainder)} sub={`${money(r.daniIncome)} income − ${money(r.daniPersonalBills)} personal bills`} />
        <Row label="Into the joint pot" value={money(r.pot)} cls="total" sub={`Cal ${pct(r.calContributionShare)} · Dani ${pct(r.daniContributionShare)}`} />
      </div>
      <div className="step">
        <p className="step-title">2. Paid from the pot</p>
        <Row label="Joint bills" value={`−${money(r.jointBillsTotal)}`} />
        <Row label={`Allowances (${money(r.allowancePerPerson)} × 2)`} value={`−${money(r.allowanceTotal)}`} />
        <Row label="Left after bills and allowances" value={money(r.remainder)} cls="total" />
      </div>
      {r.isShortfall && (
        <p className="alert bad" style={{ marginTop: 14 }}>
          Short by {money(-r.remainder)}: bills and allowances are more than the pot, so nothing is saved.
        </p>
      )}
      <div className="step">
        <p className="step-title">3. What&apos;s left is saved</p>
        <Row label={`Joint savings (${ratePct(r.savingsRate)})`} value={money(r.jointSavings)} />
        <Row label="Personal savings" value={money(r.personalSavingsTotal)} sub="the rest, split by what each of you put into the pot" />
        <Row label={`Cal (${pct(r.calContributionShare)})`} value={money(r.calPersonalSavings)} cls="indent" />
        <Row label={`Dani (${pct(r.daniContributionShare)})`} value={money(r.daniPersonalSavings)} cls="indent" />
      </div>
      <p className="calc" style={{ margin: "14px 0 0" }}>
        All bills this month: {money(r.billsTotal)} (Cal {money(r.calPersonalBills)}, Dani {money(r.daniPersonalBills)}, joint {money(r.jointBillsTotal)}).
      </p>
    </>
  );
}

export type Change = { name: string; now: number; diff: number; bad: boolean };

/** Each headline figure against the last confirmed month; a change is "bad"
 *  only in the direction that hurts (bills up, income or savings down). */
export function changes(r: WaterfallResult, prev: WaterfallResult): Change[] {
  const lines: [string, number, number, boolean | null][] = [
    ["Income", r.totalIncome, prev.totalIncome, false],
    ["All bills", r.billsTotal, prev.billsTotal, true],
    ["Allowances", r.allowanceTotal, prev.allowanceTotal, null],
    ["All savings", r.jointSavings + r.personalSavingsTotal, prev.jointSavings + prev.personalSavingsTotal, false],
    ["Joint savings", r.jointSavings, prev.jointSavings, false],
    ["Personal savings", r.personalSavingsTotal, prev.personalSavingsTotal, false],
    ["Into joint", r.calToJoint + r.daniToJoint, prev.calToJoint + prev.daniToJoint, null],
  ];
  return lines.map(([name, now, before, badIfUp]) => {
    const diff = Math.round((now - before) * 100) / 100;
    return { name, now, diff, bad: (badIfUp === true && diff > 0) || (badIfUp === false && diff < 0) };
  });
}

export function ChangeTable({ lines }: { lines: Change[] }) {
  return (
    <table className="table" style={{ marginTop: 4 }}>
      <thead><tr><th>Figure</th><th>This month</th><th>Change</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.name}>
            <td>{l.name}</td><td>{money(l.now)}</td>
            <td>{Math.abs(l.diff) < 0.005 ? <span className="chg">—</span>
              : <span className={`chg${l.bad ? " bad" : ""}`}>{l.diff > 0 ? "+" : "−"}{money(Math.abs(l.diff))}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SettingsUsed({ s, frozen }: { s: Settings; frozen: boolean }) {
  return (
    <>
      <div className="step">
        <p className="step-title">Settings used</p>
        <Row label="Allowance per person" value={money(s.allowancePerPerson)} />
        <Row label="Joint savings rate" value={ratePct(s.savingsRate)} />
        <Row label="Easy-access target" value={money(s.easyAccessTarget)} />
      </div>
      <p className="calc" style={{ margin: "10px 0 0" }}>
        {frozen ? "Frozen when this month was confirmed, so changing Settings won't change it."
          : "Today's settings. They are frozen with this month when you finish it."}
      </p>
    </>
  );
}

export function finding(r: WaterfallResult): React.ReactNode {
  if (r.isShortfall) {
    return <><b style={{ color: "var(--negative)" }}>Short by {money(-r.remainder)}.</b> Bills and allowances are more than the pot, so nothing is saved this month.</>;
  }
  return <>{money(r.jointSavings + r.personalSavingsTotal)} saved: {money(r.jointSavings)} joint and {money(r.personalSavingsTotal)} personal, split {pct(r.calContributionShare)} Cal / {pct(r.daniContributionShare)} Dani.</>;
}
