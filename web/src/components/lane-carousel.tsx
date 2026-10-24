"use client";
// Cal, Joint and Dani as cards you swipe between on phones and tablets: native
// scroll-snap does the swiping, so it moves with the finger and settles on a
// card. Above them, a small map of the month's money: Cal and Dani each send an
// arrow into Joint, labelled with the amount and as thick as its share. The map
// follows the swipe, and tapping a person jumps to their card. On wide screens
// all three cards fit side by side and the map sits over them.
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

const PEOPLE = ["Cal", "Joint", "Dani"] as const;

export function LaneCarousel({ cal, dani, children }: { cal: number; dani: number; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Side by side (wide screens) there is no "current" card to press.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1101px)");
    const set = () => setWide(mq.matches);
    set(); mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  const cards = Children.toArray(children);

  // The card nearest the track's left edge is the active one.
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
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
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setActive(i);
    if (el.scrollWidth > el.clientWidth + 2) {
      const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
      el.scrollTo({ left: slide.offsetLeft - el.offsetLeft - pad, behavior: reduce ? "auto" : "smooth" });
    } else {
      // Side by side already: point at the card instead.
      slide.classList.remove("flash"); void slide.offsetWidth; slide.classList.add("flash");
    }
  };

  const most = Math.max(cal, dani, 0.01);
  const weight = (v: number) => 2 + Math.round((Math.max(v, 0) / most) * 6);

  return (
    <div className="carousel">
      <div className="flow" role="group" aria-label={`Money into the joint account: Cal ${money(cal)}, Dani ${money(dani)}. Choose an account to show.`}>
        <FlowNode i={0} active={wide ? -1 : active} go={go} />
        <FlowArrow key={`c${cal}`} value={cal} weight={weight(cal)} who="cal" dir="right" />
        <FlowNode i={1} active={wide ? -1 : active} go={go} total={money(cal + dani)} />
        <FlowArrow key={`d${dani}`} value={dani} weight={weight(dani)} who="dani" dir="left" />
        <FlowNode i={2} active={wide ? -1 : active} go={go} />
      </div>
      <div ref={track} className="lanes" aria-roledescription="carousel" aria-label="Accounts this month">
        {cards.map((c, i) => (
          <div key={i} className="lane-slide" aria-roledescription="slide" aria-label={`${PEOPLE[i]}, ${i + 1} of ${cards.length}`}>{c}</div>
        ))}
      </div>
      <div className="pager" aria-hidden="true">
        {cards.map((_, i) => <span key={i} className={i === active ? "on" : ""} />)}
      </div>
    </div>
  );
}

function FlowNode({ i, active, go, total }: { i: number; active: number; go: (i: number) => void; total?: string }) {
  const who = PEOPLE[i];
  return (
    <button type="button" className={`flow-node ${who.toLowerCase()}`} aria-pressed={active < 0 ? undefined : active === i} onClick={() => go(i)}
      aria-label={total ? `Joint account, ${total} in` : `${who}'s account`}>
      <span className="flow-dot" aria-hidden="true">{who[0]}</span>
      <span className="flow-name" aria-hidden="true">{who}</span>
    </button>
  );
}

function FlowArrow({ value, weight, who, dir }: { value: number; weight: number; who: "cal" | "dani"; dir: "left" | "right" }) {
  return (
    <div className={`flow-arrow ${who} ${dir}`} aria-hidden="true" style={{ "--w": `${weight}px` } as React.CSSProperties}>
      <span className="flow-amt">{money(Math.max(value, 0))}</span>
      <span className="flow-line"><i /></span>
    </div>
  );
}
