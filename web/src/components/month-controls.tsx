"use client";
// Small interactive pieces: the month picker, starting a month, the toast.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { startMonth } from "@/app/actions";
import { MONTHS } from "@/lib/format";
import { Sheet } from "./sheet";

/** The month's name is the picker: tap the title and every month slides up to choose from. */
export function MonthPicker({ options, current, title }: {
  options: { id: number; label: string; confirmed: boolean; note: string }[]; current: number; title: string;
}) {
  const router = useRouter();
  return (
    <Sheet
      title="Choose a month"
      trigger={(open) => (
        <h1 className="title-picker">
          <button type="button" onClick={open} aria-haspopup="dialog" aria-label={`${title}, choose a month`}>
            {title}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </h1>
      )}
    >
      {(close) => (
        <ul className="month-list" role="list">
          {options.map((o) => (
            <li key={o.id}>
              <a href={`/?month=${o.id}`} aria-current={o.id === current ? "true" : undefined}
                onClick={(e) => { e.preventDefault(); close(); if (o.id !== current) router.push(`/?month=${o.id}`); }}>
                <span><b>{o.label}</b><span className="small muted">{o.note}</span></span>
                <span className={`pill ${o.confirmed ? "confirmed" : "draft"}`}>{o.confirmed ? "Confirmed" : "Draft"}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
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
