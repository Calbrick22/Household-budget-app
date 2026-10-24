"use client";
// Bills, income and the easy-access balance for one month, with the split
// worked out live beside them. Nothing is written until a save button is
// pressed: removed bills, edits and the carry-forward choice all wait for it.
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateWaterfall, type WaterfallResult } from "@/lib/calculations";
import type { BillEntry, Settings, Tag } from "@/lib/db";
import { money, pct, ratePct } from "@/lib/format";
import { saveMonth } from "@/app/actions";
import { confirmLeave, setUnsaved } from "@/lib/leave-guard";
import { Avatar, Row } from "./money";
import { IconClose, IconPlus } from "./icons";

const TAGS: Tag[] = ["Joint", "Cal", "Dani"];

interface BillRow {
  key: string;
  id: number | null;
  templateId: number | null;
  name: string;
  amount: string;
  tag: Tag;
  original: { name: string; amount: number; tag: Tag } | null;
}

export interface EditorProps {
  monthId: number;
  monthName: string;
  shortName: string;
  confirmed: boolean;
  settings: Settings;
  bills: BillEntry[];
  calSalary: number;
  calRaf: number;
  daniIncome: number;
  easyAccessBalance: number;
  suggestion: { from: string; balance: number; added: number } | null;
}

const toNumber = (s: string) => {
  const n = Number(String(s).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const fixed = (n: number) => n.toFixed(2);
// Tapping an amount selects it, so typing replaces it rather than adding to it.
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); };
let counter = 0;
const newKey = () => `new-${++counter}`;

function changed(r: BillRow): boolean {
  if (!r.original) return false;
  return r.name.trim() !== r.original.name.trim()
    || Math.abs((toNumber(r.amount) || 0) - r.original.amount) >= 0.005
    || r.tag !== r.original.tag;
}

export function MonthEditor(p: EditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BillRow[]>(() => p.bills.map((b) => ({
    key: `b${b.id}`, id: b.id, templateId: b.templateId, name: b.name, amount: fixed(b.amount), tag: b.tag,
    original: { name: b.name, amount: b.amount, tag: b.tag },
  })));
  const [removed, setRemoved] = useState<BillRow[]>([]);
  const [calSalary, setCalSalary] = useState(fixed(p.calSalary));
  const [calRaf, setCalRaf] = useState(fixed(p.calRaf));
  const [daniIncome, setDaniIncome] = useState(fixed(p.daniIncome));
  const [easy, setEasy] = useState(fixed(p.easyAccessBalance));
  // Carrying a change forward is the usual intent on a draft, rarely on a past month.
  const [carry, setCarry] = useState(!p.confirmed);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setUnsaved(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); setUnsaved(false); };
  }, [dirty]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const update = (key: string, patch: Partial<BillRow>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };
  const remove = (row: BillRow) => {
    setRows((rs) => rs.filter((r) => r.key !== row.key));
    if (row.id) setRemoved((rs) => [...rs, row]);
    setDirty(true);
  };
  const undo = () => {
    setRows((rs) => [...rs, ...removed].sort((a, b) => (a.original?.name ?? "￿").localeCompare(b.original?.name ?? "￿")));
    setRemoved([]);
  };
  const addRow = () => { setRows((rs) => [...rs, { key: newKey(), id: null, templateId: null, name: "", amount: "0.00", tag: "Joint", original: null }]); setDirty(true); };

  const live = rows.filter((r) => r.name.trim());
  const totals = { Joint: 0, Cal: 0, Dani: 0 } as Record<Tag, number>;
  for (const r of live) totals[r.tag] += toNumber(r.amount) || 0;
  const changedRecurring = rows.filter((r) => r.templateId != null && changed(r));

  const preview = useMemo((): WaterfallResult | string => {
    const nums = [calSalary, calRaf, daniIncome, easy, ...live.map((r) => r.amount)].map(toNumber);
    if (nums.some(Number.isNaN)) return "One of the amounts isn't a number.";
    const round = (n: number) => Math.round(n * 100) / 100;
    try {
      return calculateWaterfall({
        calIncome: round(toNumber(calSalary) + toNumber(calRaf)), daniIncome: toNumber(daniIncome),
        billsTotal: round(totals.Joint + totals.Cal + totals.Dani),
        allowancePerPerson: p.settings.allowancePerPerson, savingsRate: p.settings.savingsRate,
        easyAccessTarget: p.settings.easyAccessTarget, currentEasyAccessBalance: toNumber(easy),
        calPersonalBills: round(totals.Cal), daniPersonalBills: round(totals.Dani),
      });
    } catch (e) {
      return e instanceof Error ? e.message.replace(/_/g, " ") : "Those figures don't work.";
    }
  }, [calSalary, calRaf, daniIncome, easy, live, totals, p.settings]);

  function save(finish: boolean) {
    setError(null);
    if (typeof preview === "string") {
      setError(preview);
      document.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    startTransition(async () => {
      try {
        await saveMonth({
          monthId: p.monthId,
          bills: rows.map((r) => ({ id: r.id, name: r.name, amount: toNumber(r.amount) || 0, tag: r.tag })),
          removedIds: removed.map((r) => r.id!),
          carryForwardIds: carry ? changedRecurring.map((r) => r.id!) : [],
          calSalary: toNumber(calSalary), calRaf: toNumber(calRaf), daniIncome: toNumber(daniIncome),
          easyAccessBalance: toNumber(easy), finish,
        });
        setDirty(false);
        if (finish || p.confirmed) {
          router.push(finish ? `/?month=${p.monthId}&finished=1` : `/?month=${p.monthId}&saved=${encodeURIComponent("Changes saved.")}`);
        } else {
          router.replace(`/month/${p.monthId}/edit?saved=${encodeURIComponent("Draft saved.")}`, { scroll: false });
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Check your connection and try again.");
      }
    });
  }

  const money2 = (id: string, v: string, set: (v: string) => void) => ({
    id, value: v, inputMode: "decimal" as const, className: "input num", onFocus: selectAll,
    "aria-invalid": Number.isNaN(toNumber(v)) || undefined, "aria-describedby": Number.isNaN(toNumber(v)) ? `${id}-error` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => touch(set)(e.target.value),
    onBlur: () => { const n = toNumber(v); if (!Number.isNaN(n)) set(fixed(n)); },
  });
  const fieldError = (id: string, v: string) => Number.isNaN(toNumber(v)) && <p id={`${id}-error`} className="field-error">Enter an amount, like 1250.00</p>;
  const transfers = typeof preview === "string" ? null : preview;

  return (
    <>
      <div className="title-row">
        <div className="title"><h1>Edit {p.monthName}</h1>{p.confirmed ? <span className="pill confirmed">Confirmed</span> : <span className="pill draft">Draft</span>}</div>
        <div className="actions">
          <Link className="btn" href={`/?month=${p.monthId}`} onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}>Back to {p.shortName}</Link>
        </div>
      </div>
      <p className="finding" style={p.confirmed ? { color: "var(--warning-ink)" } : { color: "var(--muted)" }}>
        {p.confirmed ? "This month is already confirmed - edits will change saved figures." : "Enter this month's bills and income, check the preview, then finish the month."}
      </p>

      <div className="grid-3-2 section-gap">
        <div className="stack">
          <section className="card" aria-labelledby="bills-h">
            <h2 id="bills-h">Bills and expenses</h2>
            <div className="bill-grid" style={{ marginTop: 12 }}>
              <span className="head">Bill</span><span className="head" style={{ textAlign: "right" }}>Amount (£)</span><span className="head">Whose bill</span><span />
              {rows.map((r) => (
                <BillInputs key={r.key} row={r} onChange={(patch) => update(r.key, patch)} onRemove={() => remove(r)} />
              ))}
            </div>
            <div className="tag-totals">
              {TAGS.map((t) => <span key={t}><span className="dot" style={{ background: `var(--${t.toLowerCase()}-mid)` }} />{t} <b>{money(totals[t])}</b></span>)}
              <span>Total <b>{money(totals.Joint + totals.Cal + totals.Dani)}</b></span>
            </div>
            {removed.length > 0 && (
              <div className="alert note inline" style={{ marginTop: 14, justifyContent: "space-between" }}>
                <span>Removed when you save: {removed.map((r) => r.name).join(", ")}.</span>
                <button className="btn" type="button" onClick={undo}>Undo</button>
              </div>
            )}
            {changedRecurring.length > 0 && (
              <label className="check" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
                <span>Change {changedRecurring.map((r) => r.name.trim() || r.original?.name).join(", ")} for future months too
                  <span className="sub muted small" style={{ display: "block" }}>Updates your recurring bills, so new months start with the new figure.</span></span>
              </label>
            )}
            <div className="inline" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={addRow}><IconPlus />Add one-off bill</button>
            </div>
            <p className="calc" style={{ margin: "12px 0 0" }}>One-off bills don&apos;t carry forward to next month. Nothing is removed or changed until you save.</p>
          </section>

          <section className="card" aria-labelledby="income-h">
            <h2 id="income-h">Income</h2>
            <div className="income-grid">
              <div className="stack" style={{ gap: 12 }}>
                <span className="person-head"><Avatar who="Cal" small />Cal</span>
                <div className="field"><label htmlFor="cal-salary">Salary (£)</label><input {...money2("cal-salary", calSalary, setCalSalary)} />{fieldError("cal-salary", calSalary)}</div>
                <div className="field"><label htmlFor="cal-raf">RAF (£)</label><input {...money2("cal-raf", calRaf, setCalRaf)} />{fieldError("cal-raf", calRaf)}</div>
              </div>
              <div className="stack" style={{ gap: 12 }}>
                <span className="person-head"><Avatar who="Dani" small />Dani</span>
                <div className="field"><label htmlFor="dani-income">Income (£)</label><input {...money2("dani-income", daniIncome, setDaniIncome)} />{fieldError("dani-income", daniIncome)}</div>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="easy-h">
            <div className="lane-head" style={{ margin: 0 }}><Avatar who="Joint" small /><h2 id="easy-h">Easy-access pot</h2></div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="easy">Balance at the start of this month (£)</label>
              <input {...money2("easy", easy, setEasy)} />
              {fieldError("easy", easy)}
            </div>
            {p.suggestion && Math.abs(p.suggestion.balance + p.suggestion.added - (toNumber(easy) || 0)) >= 0.005 && (
              <div className="inline" style={{ marginTop: 12 }}>
                <p className="calc" style={{ margin: 0, flex: "1 1 260px" }}>
                  {p.suggestion.from} started at {money(p.suggestion.balance)} and added {money(p.suggestion.added)}, which makes {money(p.suggestion.balance + p.suggestion.added)}.
                </p>
                <button className="btn" type="button" onClick={() => touch(setEasy)(fixed(p.suggestion!.balance + p.suggestion!.added))}>
                  Use {money(p.suggestion.balance + p.suggestion.added)}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="sticky stack" style={{ gap: 16 }}>
          <Preview preview={preview} />
          {error && <p className="alert bad" role="alert">{error}</p>}
          <div className="save-bar">
            {transfers && (
              <p className="save-bar-sum" aria-hidden="true">
                <span><span className="dot" style={{ background: "var(--cal-mid)" }} />Cal <b>{money(Math.max(transfers.calToJoint, 0))}</b></span>
                <span><span className="dot" style={{ background: "var(--dani-mid)" }} />Dani <b>{money(Math.max(transfers.daniToJoint, 0))}</b></span>
                <span className="muted">to joint</span>
              </p>
            )}
            <div className="save-bar-buttons">
              <button className="btn" type="button" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : p.confirmed ? "Save" : "Save draft"}</button>
              <button className="btn primary" type="button" disabled={pending} onClick={() => save(!p.confirmed)}>
                {p.confirmed ? "Save changes" : "Finish month"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BillInputs({ row, onChange, onRemove }: { row: BillRow; onChange: (p: Partial<BillRow>) => void; onRemove: () => void }) {
  const isChanged = changed(row);
  const bad = Number.isNaN(toNumber(row.amount));
  return (
    <>
      <input className={`input name${isChanged && row.name !== row.original?.name ? " changed" : ""}`} aria-label="Bill name" placeholder="Bill name"
        value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
      <input className={`input num${isChanged && Math.abs((toNumber(row.amount) || 0) - (row.original?.amount ?? 0)) >= 0.005 ? " changed" : ""}`}
        aria-label={`Amount for ${row.name || "new bill"}`} inputMode="decimal" value={row.amount} onFocus={selectAll}
        aria-invalid={bad || undefined} aria-describedby={bad ? `${row.key}-error` : undefined}
        onChange={(e) => onChange({ amount: e.target.value })}
        onBlur={() => { const n = toNumber(row.amount); if (!Number.isNaN(n)) onChange({ amount: fixed(n) }); }} />
      <select className={`select${isChanged && row.tag !== row.original?.tag ? " changed" : ""}`} aria-label={`Whose bill is ${row.name || "the new bill"}`}
        value={row.tag} onChange={(e) => onChange({ tag: e.target.value as Tag })}>
        {TAGS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <button className="btn icon ghost" type="button" onClick={onRemove} aria-label={`Remove ${row.name || "this bill"}`} title="Remove when you save"><IconClose /></button>
      {bad && <p id={`${row.key}-error`} className="field-error">Enter an amount for {row.name || "this bill"}, like 45.00</p>}
    </>
  );
}

function Preview({ preview }: { preview: WaterfallResult | string }) {
  if (typeof preview === "string") {
    return <section className="card"><h2>Preview</h2><p className="alert bad" style={{ marginTop: 12 }}>{preview}</p></section>;
  }
  const r = preview;
  return (
    <section className="card" aria-live="polite">
      <h2>Preview</h2>
      <p className="calc" style={{ margin: "2px 0 0" }}>Updates as you type. Nothing is saved until you press a button below.</p>
      <div className="step">
        <p className="step-title">Transfers</p>
        <Row label="Cal → joint account" value={money(Math.max(r.calToJoint, 0))} />
        <Row label="Dani → joint account" value={money(Math.max(r.daniToJoint, 0))} />
        <Row label="Each personal account (allowance)" value={money(r.allowancePerPerson)} />
      </div>
      <div className="step">
        <p className="step-title">The working</p>
        <Row label="Into the joint pot" value={money(r.pot)} sub={`Cal ${pct(r.calContributionShare)} · Dani ${pct(r.daniContributionShare)}`} />
        <Row label="Joint bills" value={`−${money(r.jointBillsTotal)}`} />
        <Row label="Allowances" value={`−${money(r.allowanceTotal)}`} />
        <Row label="Left after bills and allowances" value={money(r.remainder)} cls="total" />
        <Row label={`Joint savings (${ratePct(r.savingsRate)})`} value={money(r.jointSavings)} />
        <Row label="Cal personal savings" value={money(r.calPersonalSavings)} />
        <Row label="Dani personal savings" value={money(r.daniPersonalSavings)} />
      </div>
      {r.isShortfall && <p className="alert bad" style={{ marginTop: 14 }}>Shortfall: bills and allowances are {money(-r.remainder)} more than the pot.</p>}
      {!r.isShortfall && (r.calToJoint < 0 || r.daniToJoint < 0) && <p className="alert bad" style={{ marginTop: 14 }}>A joint transfer would go below zero this month.</p>}
    </section>
  );
}
