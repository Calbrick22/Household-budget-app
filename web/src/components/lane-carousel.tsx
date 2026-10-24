"use client";
// Cal, Joint and Dani as cards you swipe between on phones and tablets: native
// scroll-snap does the swiping, so it moves with the finger and settles on a
// card. A switcher above follows the swipe and jumps on tap. On wide screens
// all three fit, so they sit side by side and the switcher hides.
import { Children, useCallback, useEffect, useRef, useState } from "react";

const PEOPLE = [
  { key: "Cal", tint: "var(--cal-soft)", ink: "var(--cal)" },
  { key: "Joint", tint: "var(--joint-soft)", ink: "var(--joint)" },
  { key: "Dani", tint: "var(--dani-soft)", ink: "var(--dani)" },
] as const;

export function LaneCarousel({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const cards = Children.toArray(children);

  // The card nearest the track's left edge is the active one.
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
    const at = (c: HTMLElement) => Math.abs(c.offsetLeft - el.offsetLeft - pad - el.scrollLeft);
    // At the very end the last card can't reach the edge, so it wins once the track can't scroll further.
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    let best = 0;
    items.forEach((c, i) => { if (at(c) < at(items[best])) best = i; });
    if (atEnd) best = items.length - 1;
    setActive(best);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - pad, behavior: reduce ? "auto" : "smooth" });
    setActive(i);
  };

  return (
    <div className="carousel">
      <div className="switcher" role="group" aria-label="Show account">
        <span className="switcher-thumb" style={{ transform: `translateX(${active * 100}%)` }} aria-hidden="true" />
        {PEOPLE.map((p, i) => (
          <button key={p.key} type="button" aria-pressed={active === i} onClick={() => go(i)}>
            <span className="switcher-dot" style={{ background: p.tint, color: p.ink }} aria-hidden="true">{p.key[0]}</span>
            {p.key}
          </button>
        ))}
      </div>
      <div ref={track} className="lanes" aria-roledescription="carousel" aria-label="Accounts this month">
        {cards.map((c, i) => (
          <div key={i} className="lane-slide" aria-roledescription="slide" aria-label={`${PEOPLE[i].key}, ${i + 1} of ${cards.length}`}>{c}</div>
        ))}
      </div>
      <div className="pager" aria-hidden="true">
        {cards.map((_, i) => <span key={i} className={i === active ? "on" : ""} />)}
      </div>
    </div>
  );
}
