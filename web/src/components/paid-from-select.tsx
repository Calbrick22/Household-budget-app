"use client";
import { PAID_FROM_OPTIONS, type PaidFrom } from "@/lib/paid-from";

/** Where a joint bill is paid from: a quiet line under the bill. */
export function PaidFromSelect({ id, name, value, changed, onChange }: { id: string; name: string; value: PaidFrom; changed?: boolean; onChange: (v: PaidFrom) => void }) {
  return (
    <label className={`paid-from${value ? " elsewhere" : ""}${changed ? " changed" : ""}`} htmlFor={id}>
      <span>Paid from</span>
      <select id={id} value={value ?? ""} aria-label={`Where ${name || "the new bill"} is paid from`}
        onChange={(e) => onChange((e.target.value || null) as PaidFrom)}>
        {PAID_FROM_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </label>
  );
}
