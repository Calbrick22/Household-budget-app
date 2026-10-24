"use client";
// The recurring bills as a board: a column each for Joint, Cal and Dani, with
// the column's total on top. Every bill shows how its amount has moved over
// recent months and opens its full history. A bill can be marked "Varies
// regularly" so the month check-in asks about it first. Like the check-in,
// nothing is written until Save: removals, edits and additions wait for it.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tag, Template } from "@/lib/db";
import { money } from "@/lib/format";
import { saveTemplates } from "@/app/actions";
import { setUnsaved } from "@/lib/leave-guard";
import { parseQuickAdd } from "@/lib/quick-add";
import { Avatar } from "./money";
import { Sheet } from "./sheet";
import { StackedBars } from "./charts";
import { IconClose, IconPlus } from "./icons";

const TAGS: Tag[] = ["Joint", "Cal", "Dani"];
const toNumber = (s: string) => { const n = Number(String(s).replace(/[£,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const el = e.currentTarget; window.setTimeout(() => { if (document.activeElement === el) el.select(); }, 0); };

export interface BillPoint { label: string; amount: number }
interface TRow { key: string; id: number | null; name: string; amount: string; tag: Tag; varies: boolean; original: Template | null }
let n = 0;

function isDirty(r: TRow): boolean {
  if (!r.original) return r.name.trim() !== "";
  return r.name !== r.original.name || Math.abs((toNumber(r.amount) || 0) - r.original.defaultAmount) >= 0.005
    || r.tag !== r.original.tag || r.varies !== r.original.varies;
}

export function BillsBoard({ templates, history, oneOffs }: {
  templates: Template[]; history: Record<number, BillPoint[]>; oneOffs: { name: string; amount: number; tag: Tag }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<TRow[]>(() => templates.map((t) => ({
    key: `t${t.id}`, id: t.id, name: t.name, amount: t.defaultAmount.toFixed(2), tag: t.tag, varies: t.varies, original: t,
  })));
  const [removed, setRemoved] = useState<TRow[]>([]);
  const [yearly, setYearly] = useState(false);
  const [quick, setQuick] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  const dirty = removed.length > 0 || rows.some(isDirty);
  const invalid = rows.some((r) => Number.isNaN(toNumber(r.amount)));
  useEffect(() => {
    setUnsaved(dirty);
    return () => setUnsaved(false);
  }, [dirty]);

  // A bill whose owner changes moves to that column; keep the focus on its dropdown.
  useEffect(() => {
    if (!moved) return;
    document.querySelector<HTMLSelectElement>(`[data-key="${moved}"] select`)?.focus();
    const t = window.setTimeout(() => setMoved(null), 900);
    return () => window.clearTimeout(t);
  }, [moved]);

  const update = (key: string, patch: Partial<TRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (patch.tag) setMoved(key);
  };
  const add = (name: string, amount: number, tag: Tag) => {
    const key = `n${++n}`;
    setRows((rs) => [...rs, { key, id: null, name, amount: amount.toFixed(2), tag, varies: false, original: null }]);
    setMoved(key);
  };
  const known = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const suggestions = oneOffs.filter((o) => !known.has(o.name.trim().toLowerCase()));
  const scale = yearly ? 12 : 1;

  return (
    <section className="board-wrap" aria-label="Recurring bills">
      <div className="board-tools">
        <form className="quick-add" onSubmit={(e) => {
          e.preventDefault();
          const bill = parseQuickAdd(quick);
          if (!bill) { setQuickError("Try a name, an amount and whose it is, like: Netflix 10.99 joint"); return; }
          add(bill.name, bill.amount, bill.tag); setQuick(""); setQuickError(null);
        }}>
          <label htmlFor="quick-add" className="sr-only">Add a recurring bill</label>
          <input id="quick-add" className="input" placeholder="Add a bill: Netflix 10.99 joint" value={quick} autoComplete="off"
            aria-invalid={quickError ? true : undefined} aria-describedby={quickError ? "quick-error" : "quick-help"}
            onChange={(e) => { setQuick(e.target.value); setQuickError(null); }} />
          <button className="btn" type="submit"><IconPlus />Add</button>
          {quickError ? <p id="quick-error" className="field-error">{quickError}</p>
            : <p id="quick-help" className="sr-only">A name, then the monthly amount, then Joint, Cal or Dani.</p>}
        </form>
        <div className="segmented" role="group" aria-label="Show amounts">
          <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
          <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly</button>
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions">
          <span className="small muted">Recent one-offs:</span>
          {suggestions.slice(0, 4).map((o) => (
            <button key={o.name} type="button" className="chip" onClick={() => add(o.name, o.amount, o.tag)}
              aria-label={`Make ${o.name}, ${money(o.amount)}, ${o.tag}, a recurring bill`}>
              <IconPlus />{o.name} {money(o.amount)}
            </button>
          ))}
        </div>
      )}

      <div className="board">
        {TAGS.map((tag) => {
          const col = rows.filter((r) => r.tag === tag);
          const total = col.reduce((s, r) => s + (toNumber(r.amount) || 0), 0);
          return (
            <section key={tag} className={`board-col ${tag.toLowerCase()}`} aria-label={`${tag} bills`}>
              <div className="board-head">
                <span className="person-head"><Avatar who={tag} small />{tag}</span>
                <span className="board-total"><b>{money(total * scale)}</b><span className="small muted">{yearly ? "a year" : "a month"}</span></span>
              </div>
              {col.length === 0 && <p className="empty small">No {tag === "Joint" ? "joint" : `${tag}'s`} bills.</p>}
              {col.map((r) => (
                <BillCard key={r.key} r={r} points={r.id ? history[r.id] ?? [] : []} yearly={yearly} arrived={moved === r.key}
                  onChange={(patch) => update(r.key, patch)}
                  onRemove={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); if (r.id) setRemoved((rs) => [...rs, r]); }} />
              ))}
            </section>
          );
        })}
      </div>

      {removed.length > 0 && (
        <div className="alert note inline" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <span>Stops when you save: {removed.map((r) => r.name).join(", ")}.</span>
          <button className="btn" type="button" onClick={() => { setRows((rs) => [...rs, ...removed]); setRemoved([]); }}>Undo</button>
        </div>
      )}
      <div className="board-save">
        <button className="btn primary" type="button" disabled={pending || !dirty || invalid} onClick={() => start(async () => {
          try {
            await saveTemplates(rows.map((r) => ({ id: r.id, name: r.name, defaultAmount: toNumber(r.amount) || 0, tag: r.tag, varies: r.varies })), removed.map((r) => r.id!));
            setRemoved([]); setUnsaved(false);
            router.replace(`/settings?saved=${encodeURIComponent("Recurring bills saved.")}`, { scroll: false });
          } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
        })}>{pending ? "Saving…" : "Save recurring bills"}</button>
        <span className="small muted">{dirty ? "Unsaved changes." : "New months start with these."}</span>
        {msg && <span role="status" className="alert bad">{msg}</span>}
      </div>
    </section>
  );
}

/** How a bill has moved: a small line and a few words. */
function trend(points: BillPoint[]): { note: string; up: boolean | null } | null {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const diff = Math.round((last.amount - first.amount) * 100) / 100;
  if (Math.abs(diff) < 0.005) return { note: `Steady since ${first.label}`, up: null };
  return { note: `${diff > 0 ? "Up" : "Down"} ${money(Math.abs(diff))} since ${first.label}`, up: diff > 0 };
}

function Spark({ points }: { points: BillPoint[] }) {
  const w = 64, h = 20;
  const vals = points.map((p) => p.amount);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const y = (v: number) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 4) + 2);
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={2.5} fill="currentColor" />
    </svg>
  );
}

function BillCard({ r, points, yearly, arrived, onChange, onRemove }: {
  r: TRow; points: BillPoint[]; yearly: boolean; arrived: boolean; onChange: (p: Partial<TRow>) => void; onRemove: () => void;
}) {
  const bad = Number.isNaN(toNumber(r.amount));
  const recent = points.slice(-6);
  const t = trend(recent);
  const changes = recent.slice(1).filter((p, i) => Math.abs(p.amount - recent[i].amount) >= 0.005).length;
  const id = `bill-${r.key}`;
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-key={r.key} className={`bill-card${arrived ? " arrived" : ""}${isDirty(r) ? " edited" : ""}`}>
      <input className="input name" aria-label="Bill name" placeholder="Bill name" value={r.name} onChange={(e) => onChange({ name: e.target.value })} />
      <div className="bill-card-row">
        <input className="input num" aria-label={`Usual monthly amount for ${r.name || "new bill"}`} inputMode="decimal" value={r.amount} onFocus={selectAll}
          aria-invalid={bad || undefined} aria-describedby={bad ? `${id}-error` : undefined}
          onChange={(e) => onChange({ amount: e.target.value })}
          onBlur={() => { const v = toNumber(r.amount); if (!Number.isNaN(v)) onChange({ amount: v.toFixed(2) }); }} />
        <select className="select" aria-label={`Whose bill is ${r.name || "the new bill"}`} value={r.tag} onChange={(e) => onChange({ tag: e.target.value as Tag })}>
          {TAGS.map((x) => <option key={x}>{x}</option>)}
        </select>
        <button className="btn icon ghost" type="button" onClick={onRemove} aria-label={`Remove ${r.name || "this bill"}`} title="Remove from future months when you save"><IconClose /></button>
      </div>
      {bad && <p id={`${id}-error`} className="field-error">Enter an amount for {r.name || "this bill"}, like 45.00</p>}
      {yearly && !bad && <p className="small muted">{money(toNumber(r.amount) * 12)} a year</p>}
      <div className="bill-card-foot">
        <label className="check varies">
          <input type="checkbox" checked={r.varies} onChange={(e) => onChange({ varies: e.target.checked })} />
          <span>Varies regularly
            {!r.varies && changes >= 2 && <span className="sub muted small">Changed in {changes} of the last {recent.length - 1} months</span>}
          </span>
        </label>
        {t && (
          <Sheet title={r.name} subtitle={`${r.tag} · what it came to each month`}
            trigger={(open) => (
              <button type="button" className={`trend${t.up ? " up" : t.up === false ? " down" : ""}`} onClick={open} aria-haspopup="dialog"
                aria-label={`${r.name}: ${t.note}. See its history`}>
                <Spark points={recent} /><span>{t.note}</span>
              </button>
            )}>
            {() => (
              <>
                <StackedBars labels={points.slice(-6).map((p) => p.label)} pounds height={200}
                  series={[{ name: r.name, values: points.slice(-6).map((p) => p.amount), color: `var(--${r.tag.toLowerCase()}-mid)` }]} />
                <div className="step">
                  {[...points].reverse().slice(0, 12).map((p, i) => (
                    <div key={p.label + i} className="row"><span>{p.label}</span><span className="amt">{money(p.amount)}</span></div>
                  ))}
                </div>
              </>
            )}
          </Sheet>
        )}
      </div>
    </div>
  );
}
