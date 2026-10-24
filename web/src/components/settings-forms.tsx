"use client";
// The split settings, with what they would do shown before saving. The
// recurring bills board lives in bills-board.tsx.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateWaterfall } from "@/lib/calculations";
import type { Settings } from "@/lib/db";
import { money } from "@/lib/format";
import { saveSettings } from "@/app/actions";
import { Row } from "./money";

const toNumber = (s: string) => { const n = Number(String(s).replace(/[£,%\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => { const el = e.currentTarget; window.setTimeout(() => { if (document.activeElement === el) el.select(); }, 0); };

/** A number field that says what's wrong right under itself. */
function NumberField({ id, label, value, set, problem }: { id: string; label: string; value: string; set: (v: string) => void; problem: string | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" inputMode="decimal" value={value} onFocus={selectAll} onChange={(e) => set(e.target.value)}
        aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-error` : undefined} />
      {problem && <p id={`${id}-error`} className="field-error">{problem}</p>}
    </div>
  );
}

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
        <NumberField id="allowance" label="Allowance per person (£)" value={allowance} set={setAllowance}
          problem={Number.isNaN(a) ? "Enter an amount, like 250.00" : a < 0 ? "Can't be negative" : null} />
        <NumberField id="rate" label="Joint savings rate (%)" value={rate} set={setRate}
          problem={Number.isNaN(r) ? "Enter a percentage, like 30" : r < 0 || r > 1 ? "Between 0 and 100" : null} />
        <NumberField id="target" label="Easy-access target (£)" value={target} set={setTarget}
          problem={Number.isNaN(t) ? "Enter an amount, like 5000.00" : t < 0 ? "Can't be negative" : null} />
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
        <button className="btn primary" type="button" disabled={pending || !changed || typeof result === "string" || [a, r, t].some(Number.isNaN) || a < 0 || t < 0 || r < 0 || r > 1}
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

