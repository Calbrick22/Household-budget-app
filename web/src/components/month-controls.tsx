"use client";
// Small interactive pieces: the month picker, starting a month, the toast.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { startMonth } from "@/app/actions";
import { MONTHS } from "@/lib/format";

export function MonthPicker({ options, current }: { options: { id: number; label: string }[]; current: number }) {
  const router = useRouter();
  return (
    <select
      className="select" aria-label="Choose a month" value={current} style={{ width: 210 }}
      onChange={(e) => router.push(`/?month=${e.target.value}`)}
    >
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

function Submit({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`btn${primary ? " primary" : ""}`} type="submit" disabled={pending}>{pending ? "Opening…" : children}</button>;
}

/** One click to start the month after the latest one. */
export function StartMonthButton({ year, month, primary }: { year: number; month: number; primary?: boolean }) {
  return (
    <form action={startMonth} style={{ display: "contents" }}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <Submit primary={primary}>Start {MONTHS[month - 1].slice(0, 3)} {year}</Submit>
    </form>
  );
}

/** Any month and year, for back-filling or skipping ahead. */
export function AddMonthMenu({ year, month, label = "Add a month" }: { year: number; month: number; label?: string }) {
  return (
    <details className="menu">
      <summary className="btn">{label}</summary>
      <form action={startMonth} className="menu-body">
        <div className="field">
          <label htmlFor="add-month">Month</label>
          <select id="add-month" name="month" className="select" defaultValue={month}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-year">Year</label>
          <input id="add-year" name="year" className="input num" type="number" min={2000} max={2100} defaultValue={year} inputMode="numeric" />
        </div>
        <Submit primary>Open month</Submit>
      </form>
    </details>
  );
}

/** Shows a confirmation passed in the URL (?saved=...), then tidies the URL. */
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const saved = params.get("saved");
    if (!saved) return;
    setMessage(saved);
    const next = new URLSearchParams(params);
    next.delete("saved");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, pathname, router]);
  if (!message) return null;
  return <div className="toast" role="status" key={message}>{message}</div>;
}
