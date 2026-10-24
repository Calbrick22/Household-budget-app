"use client";
// The months as a strip across the top of This month. The month on screen sits
// large in the middle; past months are smaller and quieter; a draft is see-
// through; and a last, faint tab starts the next month. Tapping a month moves
// it to the middle at once and dims the page until its figures arrive, then
// the figures roll to their new values.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { startMonth } from "@/app/actions";
import { confirmLeave } from "@/lib/leave-guard";
import { IconPlus } from "./icons";

export interface StripMonth { id: number; month: string; year: number; label: string; confirmed: boolean }

const Ctx = createContext<{ pending: boolean; target: number | null; go: (id: number) => void }>({ pending: false, target: null, go: () => {} });

/** Holds the switch between months, so the strip and the page below agree. */
export function MonthView({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<number | null>(null);
  const go = (id: number) => {
    if (!confirmLeave()) return;
    setTarget(id);
    start(() => router.push(`/?month=${id}`, { scroll: false }));
  };
  return <Ctx.Provider value={{ pending, target, go }}>{children}</Ctx.Provider>;
}

/** The part of the page that dims while another month loads. */
export function MonthBody({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(Ctx);
  return <div className="month-body" data-pending={pending || undefined} aria-busy={pending || undefined}>{children}</div>;
}

const yearMark = (y: number, current: number) => (y === current ? "" : ` ’${String(y).slice(2)}`);

export function MonthStrip({ months, current, next }: { months: StripMonth[]; current: number; next: { year: number; month: number; short: string } }) {
  const { pending, target, go } = useContext(Ctx);
  const selected = pending && target != null ? target : current;
  const strip = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const selectedYear = months.find((m) => m.id === selected)?.year ?? next.year;

  // Keep the chosen month in the middle; jump there on first paint, glide after.
  const centre = () => {
    const el = strip.current;
    const chip = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !chip) return;
    const left = chip.offsetLeft - el.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
    const smooth = !first.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    first.current = false;
  };
  useLayoutEffect(centre, [selected]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { first.current = true; centre(); });
    if (strip.current) ro.observe(strip.current);
    return () => ro.disconnect();
  }, []);

  return (
    <nav className="strip-wrap" aria-label="Months">
      <div ref={strip} className="strip">
        {months.map((m) => {
          const on = m.id === selected;
          const kind = on ? "on" : m.confirmed ? "past" : "draft";
          return (
            <a key={m.id} href={`/?month=${m.id}`} className={`mchip ${kind}`} aria-current={on ? "page" : undefined}
              aria-label={`${m.label}${m.confirmed ? "" : ", draft"}`} data-loading={on && pending ? "" : undefined}
              onClick={(e) => { e.preventDefault(); if (m.id !== selected) go(m.id); }}>
              <span className="mchip-face">{on ? m.label : `${m.month}${yearMark(m.year, selectedYear)}`}</span>
            </a>
          );
        })}
        <form action={startMonth} className="mchip-form">
          <input type="hidden" name="year" value={next.year} />
          <input type="hidden" name="month" value={next.month} />
          <StartChip label={`Start ${next.short} ${next.year}`} text={`${next.short}${yearMark(next.year, selectedYear)}`} />
        </form>
      </div>
    </nav>
  );
}

function StartChip({ label, text }: { label: string; text: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mchip start" aria-label={label} title={label} disabled={pending}
      onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}>
      <span className="mchip-face"><IconPlus />{pending ? "Opening…" : text}</span>
    </button>
  );
}
