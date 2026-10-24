"use client";
// The month check-in: entering a month's figures in four short steps over This
// month - income, what's different in the bills, the pot, then a review and
// finish. The Cal → Joint ← Dani map at the top recalculates as you type.
// Nothing is written until Save draft or Finish: removed bills, edits and the
// carry-forward choice all wait for it, and closing with changes asks first.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateWaterfall, type WaterfallResult } from "@/lib/calculations";
import type { BillEntry, Settings, Tag } from "@/lib/db";
import { money, pct, ratePct } from "@/lib/format";
import { saveMonth } from "@/app/actions";
import { confirmLeave, setUnsaved } from "@/lib/leave-guard";
import { Avatar, Row } from "./money";
import { IconCheck, IconClose, IconPlus } from "./icons";
import { FlowArrow } from "./lane-carousel";

const TAGS: Tag[] = ["Joint", "Cal", "Dani"];
const STEPS = ["Income", "Bills", "Pot", "Finish"] as const;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface BillRow {
  key: string;
  id: number | null;
  templateId: number | null;
  name: string;
  amount: string;
  tag: Tag;
  original: { name: string; amount: number; tag: Tag } | null;
}

export interface CheckInProps {
  monthId: number;
  monthName: string;
  previousName: string | null;
  confirmed: boolean;
  settings: Settings;
  bills: BillEntry[];
  /** Recurring bills marked "varies regularly". */
  variesIds: number[];
  /** What each recurring bill came to in the previous confirmed month. */
  lastAmounts: Record<number, number>;
  calSalary: number;
  calRaf: number;
  daniIncome: number;
  lastIncome: { calSalary: number; calRaf: number; daniIncome: number } | null;
  easyAccessBalance: number;
  suggestion: { from: string; balance: number; added: number } | null;
}

const toNumber = (s: string) => {
  const n = Number(String(s).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const fixed = (n: number) => n.toFixed(2);
// Tapping an amount selects it, so typing replaces it rather than adding to it.
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const el = e.currentTarget; window.setTimeout(() => { if (document.activeElement === el) el.select(); }, 0); };
let counter = 0;
const newKey = () => `new-${++counter}`;

function changed(r: BillRow): boolean {
  if (!r.original) return false;
  return r.name.trim() !== r.original.name.trim()
    || Math.abs((toNumber(r.amount) || 0) - r.original.amount) >= 0.005
    || r.tag !== r.original.tag;
}

export function MonthCheckIn(p: CheckInProps) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
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
  const [showUsual, setShowUsual] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
  }, []);
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
  const [added, setAdded] = useState<string | null>(null);
  const addRow = () => {
    const key = newKey();
    setRows((rs) => [...rs, { key, id: null, templateId: null, name: "", amount: "0.00", tag: "Joint", original: null }]);
    setAdded(key); setDirty(true);
  };

  const live = rows.filter((r) => r.name.trim());
  const totals = { Joint: 0, Cal: 0, Dani: 0 } as Record<Tag, number>;
  for (const r of live) totals[r.tag] += toNumber(r.amount) || 0;
  const changedRecurring = rows.filter((r) => r.templateId != null && changed(r));

  // The bills split three ways: the ones that change every month, one-offs, and the usual ones.
  const varies = rows.filter((r) => r.templateId != null && p.variesIds.includes(r.templateId));
  const oneOffs = rows.filter((r) => r.templateId == null);
  const usual = rows.filter((r) => r.templateId != null && !p.variesIds.includes(r.templateId));
  const usualChanged = usual.filter(changed);
  const usualTotal = usual.reduce((s, r) => s + (toNumber(r.amount) || 0), 0);

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
  const r = typeof preview === "string" ? null : preview;

  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length || to === step) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
    body.current?.scrollTo(0, 0);
  };

  const close = () => {
    if (!confirmLeave()) return;
    setDirty(false);
    router.replace(`/?month=${p.monthId}`, { scroll: false });
  };

  // Which step each kind of field lives on, so a save can take you to the one that's wrong.
  const firstBadStep = () => {
    if ([calSalary, calRaf, daniIncome].some((v) => Number.isNaN(toNumber(v)))) return 0;
    if (live.some((x) => Number.isNaN(toNumber(x.amount)))) return 1;
    if (Number.isNaN(toNumber(easy))) return 2;
    return -1;
  };

  function save(finish: boolean) {
    setError(null);
    if (typeof preview === "string") {
      setError(preview);
      const bad = firstBadStep();
      if (bad >= 0) {
        if (bad === 1) setShowUsual(true);
        go(bad);
        window.setTimeout(() => body.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(), 60);
      }
      return;
    }
    startTransition(async () => {
      try {
        await saveMonth({
          monthId: p.monthId,
          bills: rows.map((x) => ({ id: x.id, name: x.name, amount: toNumber(x.amount) || 0, tag: x.tag })),
          removedIds: removed.map((x) => x.id!),
          carryForwardIds: carry ? changedRecurring.map((x) => x.id!) : [],
          calSalary: toNumber(calSalary), calRaf: toNumber(calRaf), daniIncome: toNumber(daniIncome),
          easyAccessBalance: toNumber(easy), finish,
        });
        setDirty(false); setUnsaved(false);
        const done = finish ? "finished=1" : `saved=${encodeURIComponent(p.confirmed ? "Changes saved." : "Draft saved.")}`;
        router.replace(`/?month=${p.monthId}&${done}`, { scroll: false });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Check your connection and try again.");
      }
    });
  }

  // Swiping across the step (not on a bill row, which swipes itself) moves between steps.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest(".bill-row, input, select, button")) return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(step + (dx < 0 ? 1 : -1));
  };

  const amountProps = (id: string, v: string, set: (v: string) => void) => ({
    id, value: v, inputMode: "decimal" as const, className: "input num", onFocus: selectAll,
    "aria-invalid": Number.isNaN(toNumber(v)) || undefined, "aria-describedby": Number.isNaN(toNumber(v)) ? `${id}-error` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => touch(set)(e.target.value),
    onBlur: () => { const n = toNumber(v); if (!Number.isNaN(n)) set(fixed(n)); },
  });
  const fieldError = (id: string, v: string) => Number.isNaN(toNumber(v)) && <p id={`${id}-error`} className="field-error">Enter an amount, like 1250.00</p>;
  const billRow = (x: BillRow, hint?: string) => (
    <BillInputs key={x.key} row={x} hint={hint} focus={x.key === added} onChange={(patch) => update(x.key, patch)} onRemove={() => remove(x)} />
  );

  const last = p.lastIncome;
  const incomeDiffers = last && (Math.abs(last.calSalary - (toNumber(calSalary) || 0)) >= 0.005
    || Math.abs(last.calRaf - (toNumber(calRaf) || 0)) >= 0.005 || Math.abs(last.daniIncome - (toNumber(daniIncome) || 0)) >= 0.005);
  const suggested = p.suggestion ? p.suggestion.balance + p.suggestion.added : null;

  return (
    <dialog ref={dlg} className="checkin" aria-labelledby="checkin-title"
      onCancel={(e) => { e.preventDefault(); close(); }}>
      <div className="checkin-head">
        <span className="sheet-grip" aria-hidden="true" />
        <div>
          <h2 id="checkin-title">{p.confirmed ? "Edit" : "Check in"}: {p.monthName}</h2>
          <p className="small muted">{p.confirmed ? "Already confirmed: saving changes its figures." : "Four quick steps, then finish the month."}</p>
        </div>
        <button type="button" className="btn icon ghost" onClick={close} aria-label="Close"><IconClose /></button>
      </div>

      <div className="flow mini" aria-live="polite" aria-label={r ? `Into joint: Cal ${money(Math.max(r.calToJoint, 0))}, Dani ${money(Math.max(r.daniToJoint, 0))}` : "Fix the amounts to see the split"}>
        <span className="flow-node cal"><span className="flow-dot" aria-hidden="true">C</span></span>
        <FlowArrow value={r ? r.calToJoint : 0} weight={weight(r, "cal")} who="cal" dir="right" />
        <span className="flow-node joint"><span className="flow-dot" aria-hidden="true">J</span></span>
        <FlowArrow value={r ? r.daniToJoint : 0} weight={weight(r, "dani")} who="dani" dir="left" />
        <span className="flow-node dani"><span className="flow-dot" aria-hidden="true">D</span></span>
      </div>

      <ol className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}>
              <span className="steps-bar" aria-hidden="true" />{s}
            </button>
          </li>
        ))}
      </ol>

      <div ref={body} className="checkin-body" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { swipe.current = null; }}>
        <div key={step} className={`checkin-step${dir > 0 ? " from-right" : dir < 0 ? " from-left" : ""}`}>
          {step === 0 && (
            <section aria-labelledby="income-h">
              <h3 id="income-h" className="step-h">What came in?</h3>
              {last && incomeDiffers && (
                <button type="button" className="btn suggest" onClick={() => {
                  touch(setCalSalary)(fixed(last.calSalary)); setCalRaf(fixed(last.calRaf)); setDaniIncome(fixed(last.daniIncome));
                }}>
                  Same as {p.previousName}: {money(last.calSalary + last.calRaf)} and {money(last.daniIncome)}
                </button>
              )}
              <div className="income-grid">
                <div className="stack" style={{ gap: 12 }}>
                  <span className="person-head"><Avatar who="Cal" small />Cal</span>
                  <div className="field"><label htmlFor="cal-salary">Salary (£)</label><input {...amountProps("cal-salary", calSalary, setCalSalary)} />{fieldError("cal-salary", calSalary)}</div>
                  <div className="field"><label htmlFor="cal-raf">RAF (£)</label><input {...amountProps("cal-raf", calRaf, setCalRaf)} />{fieldError("cal-raf", calRaf)}</div>
                </div>
                <div className="stack" style={{ gap: 12 }}>
                  <span className="person-head"><Avatar who="Dani" small />Dani</span>
                  <div className="field"><label htmlFor="dani-income">Income (£)</label><input {...amountProps("dani-income", daniIncome, setDaniIncome)} />{fieldError("dani-income", daniIncome)}</div>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="bills-h">
              <h3 id="bills-h" className="step-h">What&apos;s different this month?</h3>
              <div className="bill-group">
                <p className="group-label">Changes every month</p>
                {varies.length ? varies.map((x) => billRow(x, x.templateId != null && p.lastAmounts[x.templateId] != null ? `${p.previousName} ${money(p.lastAmounts[x.templateId])}` : undefined))
                  : <p className="calc" style={{ margin: 0 }}>None yet. Tick &ldquo;Varies regularly&rdquo; on a recurring bill in Settings and it will be asked about here first.</p>}
              </div>
              <div className="bill-group">
                <button type="button" className="usual" aria-expanded={showUsual} onClick={() => setShowUsual((v) => !v)}>
                  <span>
                    <b>{usual.length} bill{usual.length === 1 ? "" : "s"} {usualChanged.length ? `as usual, ${usualChanged.length} changed` : "same as usual"}</b>
                    <span className="sub">{money(usualTotal)} · tap to {showUsual ? "fold away" : "check or change"}</span>
                  </span>
                  <span className={`usual-mark${usualChanged.length ? " changed" : ""}`} aria-hidden="true">{usualChanged.length ? usualChanged.length : <IconCheck strokeWidth={2.5} />}</span>
                </button>
                {showUsual && <div className="usual-rows">{usual.map((x) => billRow(x))}</div>}
              </div>
              {oneOffs.length > 0 && (
                <div className="bill-group">
                  <p className="group-label">One-off this month</p>
                  {oneOffs.map((x) => billRow(x))}
                </div>
              )}
              {removed.length > 0 && (
                <div className="alert note inline" style={{ marginTop: 12, justifyContent: "space-between" }}>
                  <span>Removed when you save: {removed.map((x) => x.name).join(", ")}.</span>
                  <button className="btn" type="button" onClick={undo}>Undo</button>
                </div>
              )}
              {changedRecurring.length > 0 && (
                <label className="check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
                  <span>Change {changedRecurring.map((x) => x.name.trim() || x.original?.name).join(", ")} for future months too
                    <span className="sub muted small" style={{ display: "block" }}>Updates your recurring bills, so new months start with the new figure.</span></span>
                </label>
              )}
              <div className="inline" style={{ marginTop: 14 }}>
                <button className="btn" type="button" onClick={addRow}><IconPlus />Add one-off bill</button>
              </div>
              <div className="tag-totals">
                {TAGS.map((t) => <span key={t}><span className="dot" style={{ background: `var(--${t.toLowerCase()}-mid)` }} />{t} <b>{money(totals[t])}</b></span>)}
                <span>Total <b>{money(totals.Joint + totals.Cal + totals.Dani)}</b></span>
              </div>
              <p className="calc" style={{ margin: "8px 0 0" }}><span className="touch-only">Swipe a bill left to remove it. </span>Nothing changes until you save.</p>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="pot-h">
              <h3 id="pot-h" className="step-h">The easy-access pot</h3>
              <div className="field">
                <label htmlFor="easy">Balance at the start of this month (£)</label>
                <input {...amountProps("easy", easy, setEasy)} />
                {fieldError("easy", easy)}
              </div>
              {p.suggestion && suggested != null && Math.abs(suggested - (toNumber(easy) || 0)) >= 0.005 && (
                <button className="btn suggest" type="button" onClick={() => touch(setEasy)(fixed(suggested))}>
                  Use {money(suggested)}: {p.suggestion.from}&apos;s {money(p.suggestion.balance)} plus the {money(p.suggestion.added)} it added
                </button>
              )}
              {r && (
                <p className="calc" style={{ marginTop: 14 }}>
                  {money(r.toEasyAccess)} goes in this month and {money(r.toLongTerm)} to the long-term pot
                  {r.easyAccessTarget > 0 ? `, against a ${money(r.easyAccessTarget)} target.` : "."}
                </p>
              )}
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="finish-h">
              <h3 id="finish-h" className="step-h">{p.confirmed ? "Check and save" : "Check and finish"}</h3>
              {r ? <Review r={r} /> : <p className="alert bad">{preview as string}</p>}
            </section>
          )}
        </div>
      </div>

      <div className="checkin-foot">
        {error && <p className="alert bad" role="alert">{error}</p>}
        <div className="checkin-buttons">
          {step > 0 ? <button className="btn" type="button" onClick={() => go(step - 1)}>Back</button> : <span />}
          {step < STEPS.length - 1 ? (
            <button className="btn primary" type="button" onClick={() => go(step + 1)}>Next: {STEPS[step + 1]}</button>
          ) : p.confirmed ? (
            <button className="btn primary" type="button" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save changes"}</button>
          ) : (
            <span className="finish-pair">
              <button className="btn" type="button" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save draft"}</button>
              <HoldButton disabled={pending} onDone={() => save(true)}>Hold to finish</HoldButton>
            </span>
          )}
        </div>
      </div>
    </dialog>
  );
}

const weight = (r: WaterfallResult | null, who: "cal" | "dani") => {
  if (!r) return 2;
  const most = Math.max(r.calToJoint, r.daniToJoint, 0.01);
  return 2 + Math.round((Math.max(who === "cal" ? r.calToJoint : r.daniToJoint, 0) / most) * 6);
};

function Review({ r }: { r: WaterfallResult }) {
  return (
    <>
      <div className="review-grid">
        {([["Cal", r.calToJoint, r.calPersonalSavings], ["Dani", r.daniToJoint, r.daniPersonalSavings]] as const).map(([who, toJoint, sav]) => (
          <div key={who} className={`review-card ${who.toLowerCase()}`}>
            <span className="person-head"><Avatar who={who} small />{who} moves</span>
            <Row label="Joint account" value={money(Math.max(toJoint, 0))} />
            <Row label="Personal account" value={money(r.allowancePerPerson)} />
            <Row label="Personal savings" value={money(sav)} />
          </div>
        ))}
      </div>
      <div className="step">
        <p className="step-title">The working</p>
        <Row label="Into the joint pot" value={money(r.pot)} sub={`Cal ${pct(r.calContributionShare)} · Dani ${pct(r.daniContributionShare)}`} />
        <Row label="Joint bills" value={`−${money(r.jointBillsTotal)}`} />
        <Row label="Allowances" value={`−${money(r.allowanceTotal)}`} />
        <Row label="Left after bills and allowances" value={money(r.remainder)} cls="total" />
        <Row label={`Joint savings (${ratePct(r.savingsRate)})`} value={money(r.jointSavings)} />
        <Row label="Saved in all" value={money(r.jointSavings + r.personalSavingsTotal)} cls="total" />
      </div>
      {r.isShortfall && <p className="alert bad" style={{ marginTop: 14 }}>Shortfall: bills and allowances are {money(-r.remainder)} more than the pot.</p>}
      {!r.isShortfall && (r.calToJoint < 0 || r.daniToJoint < 0) && <p className="alert bad" style={{ marginTop: 14 }}>A joint transfer would go below zero this month.</p>}
    </>
  );
}

/** One bill: name, amount, whose it is and a remove button. On a touch screen
 *  the row also swipes left to remove. */
function BillInputs({ row, hint, focus, onChange, onRemove }: { row: BillRow; hint?: string; focus?: boolean; onChange: (p: Partial<BillRow>) => void; onRemove: () => void }) {
  const isChanged = changed(row);
  const bad = Number.isNaN(toNumber(row.amount));
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; on: boolean } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("select, button")) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) > 10) { drag.current = null; return; }
      if (dx < -12) { d.on = true; (document.activeElement as HTMLElement | null)?.blur(); try { el.current.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ } }
      else return;
    }
    d.dx = Math.min(0, dx);
    el.current.style.transform = `translateX(${d.dx}px)`;
    el.current.dataset.away = d.dx < -90 ? "1" : "";
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    const node = el.current;
    if (!d?.on || !node) return;
    if (d.dx < -90) {
      const out = node.animate([{ transform: `translateX(${d.dx}px)`, opacity: 1 }, { transform: "translateX(-110%)", opacity: 0 }], { duration: reduced() ? 1 : 180, fill: "forwards" });
      out.onfinish = onRemove;
    } else {
      node.style.transform = "";
      node.dataset.away = "";
    }
  };

  return (
    <div ref={el} className="bill-row" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <input className={`input name${isChanged && row.name !== row.original?.name ? " changed" : ""}`} aria-label="Bill name" placeholder="Bill name"
        autoFocus={focus} value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
      <input className={`input num${isChanged && Math.abs((toNumber(row.amount) || 0) - (row.original?.amount ?? 0)) >= 0.005 ? " changed" : ""}`}
        aria-label={`Amount for ${row.name || "new bill"}`} inputMode="decimal" value={row.amount} onFocus={selectAll}
        aria-invalid={bad || undefined} aria-describedby={bad ? `${row.key}-error` : hint ? `${row.key}-hint` : undefined}
        onChange={(e) => onChange({ amount: e.target.value })}
        onBlur={() => { const n = toNumber(row.amount); if (!Number.isNaN(n)) onChange({ amount: fixed(n) }); }} />
      <select className={`select${isChanged && row.tag !== row.original?.tag ? " changed" : ""}`} aria-label={`Whose bill is ${row.name || "the new bill"}`}
        value={row.tag} onChange={(e) => onChange({ tag: e.target.value as Tag })}>
        {TAGS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <button className="btn icon ghost" type="button" onClick={onRemove} aria-label={`Remove ${row.name || "this bill"}`} title="Remove when you save"><IconClose /></button>
      {hint && !bad && <p id={`${row.key}-hint`} className="bill-hint">Last month: {hint}</p>}
      {bad && <p id={`${row.key}-error`} className="field-error">Enter an amount for {row.name || "this bill"}, like 45.00</p>}
    </div>
  );
}

/** Finishing is press-and-hold, so it can't happen by accident: a bar fills
 *  across the button and the month is finished when it's full. Keyboards and
 *  screen readers, which press rather than hold, finish on activation. */
function HoldButton({ onDone, disabled, children }: { onDone: () => void; disabled?: boolean; children: React.ReactNode }) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const MS = 900;
  const start = (e: React.PointerEvent) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    started.current = performance.now();
    setHolding(true); setHint(false);
    timer.current = window.setTimeout(() => { setHolding(false); timer.current = null; onDone(); }, MS);
  };
  const stop = () => {
    if (timer.current == null) return;
    window.clearTimeout(timer.current); timer.current = null;
    setHolding(false);
    if (performance.now() - started.current < MS) setHint(true);
  };
  return (
    <button type="button" className={`btn primary hold${holding ? " holding" : ""}`} disabled={disabled}
      style={{ "--hold": `${MS}ms` } as React.CSSProperties}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0 && !disabled) onDone(); }}
      aria-describedby="hold-hint">
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{children}</span>
      <span id="hold-hint" className={hint ? "hold-hint on" : "sr-only"}>{hint ? "Keep holding" : "Press and hold to finish the month"}</span>
    </button>
  );
}
