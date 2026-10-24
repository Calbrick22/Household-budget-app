"use client";
// The split settings, with what they would do shown before saving, and the
// recurring bills list, where removals wait for Save like the month editor.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateWaterfall } from "@/lib/calculations";
import type { Settings, Tag, Template } from "@/lib/db";
import { money } from "@/lib/format";
import { saveSettings, saveTemplates } from "@/app/actions";
import { Row } from "./money";
import { IconClose, IconPlus } from "./icons";

const toNumber = (s: string) => { const n = Number(String(s).replace(/[£,%\s]/g, "")); return Number.isFinite(n) ? n : NaN; };

export interface PreviewMonth {
  label: string; confirmed: boolean;
  calIncome: number; daniIncome: number; billsTotal: number; calBills: number; daniBills: number; easyAccessBalance: number;
}

export function SettingsForm({ settings, preview }: { settings: Settings; preview: PreviewMonth | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [allowance, setAllowance] = useState(settings.allowancePerPerson.toFixed(2));
  const [rate, setRate] = useState((settings.savingsRate * 100).toFixed(1));
  const [target, setTarget] = useState(settings.easyAccessTarget.toFixed(2));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const a = toNumber(allowance), r = toNumber(rate) / 100, t = toNumber(target);
  let result: ReturnType<typeof calculateWaterfall> | string | null = null;
  if (preview) {
    try {
      result = calculateWaterfall({ calIncome: preview.calIncome, daniIncome: preview.daniIncome, billsTotal: preview.billsTotal,
        allowancePerPerson: a, savingsRate: r, easyAccessTarget: t, currentEasyAccessBalance: preview.easyAccessBalance,
        calPersonalBills: preview.calBills, daniPersonalBills: preview.daniBills });
    } catch { result = "Check the figures: the rate must be 0-100% and amounts can't be negative."; }
  }
  const changed = a !== settings.allowancePerPerson || Math.abs(r - settings.savingsRate) > 1e-9 || t !== settings.easyAccessTarget;

  return (
    <section className="card">
      <div className="fields-3">
        <div className="field"><label htmlFor="allowance">Allowance per person (£)</label><input id="allowance" className="input num" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} /></div>
        <div className="field"><label htmlFor="rate">Joint savings rate (%)</label><input id="rate" className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <div className="field"><label htmlFor="target">Easy-access target (£)</label><input id="target" className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      </div>
      {preview && (
        <div className="preview">
          <p className="calc" style={{ margin: "0 0 6px" }}>
            {preview.confirmed ? `On ${preview.label}'s figures these settings would give the following. ${preview.label} itself keeps the settings it was confirmed with.`
              : `With these settings, ${preview.label} (draft) comes out as:`}
          </p>
          {typeof result === "string" ? <p className="alert bad">{result}</p> : result && (
            <>
              <Row label="Joint savings" value={money(result.jointSavings)} />
              <Row label="Personal savings, Cal / Dani" value={`${money(result.calPersonalSavings)} / ${money(result.daniPersonalSavings)}`} />
              <Row label="Cal / Dani → joint account" value={`${money(Math.max(result.calToJoint, 0))} / ${money(Math.max(result.daniToJoint, 0))}`} />
            </>
          )}
        </div>
      )}
      <div className="inline" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" disabled={pending || !changed || typeof result === "string"}
          onClick={() => start(async () => {
            try {
              await saveSettings({ allowancePerPerson: a, savingsRate: r, easyAccessTarget: t });
              router.replace(`/settings?saved=${encodeURIComponent("Settings saved.")}`, { scroll: false });
            } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." }); }
          })}>{pending ? "Saving…" : "Save settings"}</button>
        {msg && <span role="status" className={msg.ok ? "muted small" : "alert bad"}>{msg.text}</span>}
      </div>
    </section>
  );
}

interface TRow { key: string; id: number | null; name: string; amount: string; tag: Tag; original: Template | null }
const TAGS: Tag[] = ["Joint", "Cal", "Dani"];
let n = 0;

export function RecurringBills({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fresh = () => templates.map((t) => ({ key: `t${t.id}`, id: t.id, name: t.name, amount: t.defaultAmount.toFixed(2), tag: t.tag, original: t }));
  const [rows, setRows] = useState<TRow[]>(fresh);
  const [removed, setRemoved] = useState<TRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const update = (key: string, patch: Partial<TRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dirty = removed.length > 0 || rows.some((r) => !r.original ? r.name.trim() !== "" :
    r.name !== r.original.name || Math.abs((toNumber(r.amount) || 0) - r.original.defaultAmount) >= 0.005 || r.tag !== r.original.tag);

  return (
    <section className="card">
      <div className="bill-grid">
        <span className="head">Bill</span><span className="head" style={{ textAlign: "right" }}>Usual amount (£)</span><span className="head">Whose bill</span><span />
        {rows.map((r) => (
          <RowInputs key={r.key} r={r} onChange={(p) => update(r.key, p)} onRemove={() => {
            setRows((rs) => rs.filter((x) => x.key !== r.key));
            if (r.id) setRemoved((rs) => [...rs, r]);
          }} />
        ))}
      </div>
      {removed.length > 0 && (
        <div className="alert note inline" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <span>Removed when you save: {removed.map((r) => r.name).join(", ")}.</span>
          <button className="btn" type="button" onClick={() => { setRows((rs) => [...rs, ...removed].sort((a, b) => a.name.localeCompare(b.name))); setRemoved([]); }}>Undo</button>
        </div>
      )}
      <div className="inline" style={{ marginTop: 16 }}>
        <button className="btn" type="button" onClick={() => setRows((rs) => [...rs, { key: `n${++n}`, id: null, name: "", amount: "0.00", tag: "Joint", original: null }])}><IconPlus />Add recurring bill</button>
        <button className="btn primary" type="button" disabled={pending || !dirty} onClick={() => start(async () => {
          try {
            await saveTemplates(rows.map((r) => ({ id: r.id, name: r.name, defaultAmount: toNumber(r.amount) || 0, tag: r.tag })), removed.map((r) => r.id!));
            setRemoved([]);
            router.replace(`/settings?saved=${encodeURIComponent("Recurring bills saved.")}`, { scroll: false });
          } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." }); }
        })}>{pending ? "Saving…" : "Save recurring bills"}</button>
        {msg && <span role="status" className={msg.ok ? "muted small" : "alert bad"}>{msg.text}</span>}
      </div>
    </section>
  );
}

function RowInputs({ r, onChange, onRemove }: { r: TRow; onChange: (p: Partial<TRow>) => void; onRemove: () => void }) {
  return (
    <>
      <input className="input name" aria-label="Bill name" placeholder="Bill name" value={r.name} onChange={(e) => onChange({ name: e.target.value })} />
      <input className="input num" aria-label={`Usual amount for ${r.name || "new bill"}`} inputMode="decimal" value={r.amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        onBlur={() => { const v = toNumber(r.amount); if (!Number.isNaN(v)) onChange({ amount: v.toFixed(2) }); }} />
      <select className="select" aria-label={`Whose bill is ${r.name || "the new bill"}`} value={r.tag} onChange={(e) => onChange({ tag: e.target.value as Tag })}>
        {TAGS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <button className="btn icon ghost" type="button" onClick={onRemove} aria-label={`Remove ${r.name || "this bill"}`} title="Remove from future months when you save"><IconClose /></button>
    </>
  );
}
