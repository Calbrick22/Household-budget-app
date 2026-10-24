"use client";
// Figures that roll from last month's value to this month's when you switch
// months, so you see which way they moved. The headline ones also flash the
// difference for a moment. The first render, and anyone who prefers less
// motion, get the plain figure straight away.
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => 1 - (1 - t) ** 3;

function useRolling(value: number, duration = 650): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || reduced()) { setShown(value); return; }
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      setShown(t >= 1 ? value : Math.round((start + (value - start) * ease(t)) * 100) / 100);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/** An amount in a row. Screen readers get the final figure, not the frames. */
export function Roll({ value }: { value: number }) {
  const shown = useRolling(value);
  return <><span aria-hidden="true">{money(shown)}</span><span className="sr-only">{money(value)}</span></>;
}

/** A headline amount with the pence set smaller, and the change since the
 *  month you came from shown briefly beside it. */
export function RollingBig({ value, className = "big" }: { value: number; className?: string }) {
  const shown = useRolling(value, 750);
  const last = useRef(value);
  const [delta, setDelta] = useState<{ diff: number; n: number } | null>(null);
  useEffect(() => {
    const diff = Math.round((value - last.current) * 100) / 100;
    last.current = value;
    if (Math.abs(diff) >= 0.005 && !reduced()) setDelta((d) => ({ diff, n: (d?.n ?? 0) + 1 }));
  }, [value]);
  const [pounds, pence] = money(shown).split(".");
  return (
    <p className={className}>
      <span aria-hidden="true">{pounds}<span className="pence">.{pence}</span></span>
      <span className="sr-only">{money(value)}</span>
      {delta && (
        <span key={delta.n} className={`delta ${delta.diff > 0 ? "up" : "down"}`} aria-hidden="true">
          {delta.diff > 0 ? "+" : "−"}{money(Math.abs(delta.diff))}
        </span>
      )}
    </p>
  );
}
