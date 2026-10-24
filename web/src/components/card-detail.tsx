"use client";
// A card that opens into its own full view. The view grows out of the card
// (and shrinks back into it), so it reads as the same thing seen closer. Close
// with the button, Escape, or by dragging the top bar down on a phone.
import { useRef, useState } from "react";
import { IconClose, IconExpand } from "./icons";

const EASE = "cubic-bezier(.16, 1, .3, 1)";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CardDetail({ label, title, subtitle, avatar, card, children }: {
  label: string; title: string; subtitle: string; avatar: React.ReactNode; card: React.ReactNode; children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [id] = useState(() => `detail-${Math.random().toString(36).slice(2, 8)}`);
  const busy = useRef(false);

  // The transform that makes the open view sit exactly over the card.
  const fromCard = () => {
    const a = cardRef.current!.getBoundingClientRect();
    const b = dlg.current!.getBoundingClientRect();
    return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
  };

  const open = () => {
    const d = dlg.current;
    if (!d || d.open || busy.current) return;
    d.showModal();
    body.current?.scrollTo(0, 0);
    if (reduced()) return;
    d.animate([{ transform: fromCard(), borderRadius: "28px" }, { transform: "none" }], { duration: 460, easing: EASE });
    body.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 460, easing: "ease-out" });
  };

  const close = (from = "none") => {
    const d = dlg.current;
    if (!d || !d.open || busy.current) return;
    if (reduced()) { d.close(); return; }
    busy.current = true;
    body.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
    d.classList.add("closing");
    const a = d.animate([{ transform: from }, { transform: fromCard(), borderRadius: "28px" }], { duration: 320, easing: EASE });
    a.onfinish = () => {
      d.close(); d.classList.remove("closing"); d.style.transform = "";
      body.current?.getAnimations().forEach((x) => x.cancel());
      busy.current = false;
    };
  };

  // Dragging the top bar down pulls the view with the finger; far enough and it closes.
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, dy: 0 };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !dlg.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    dlg.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    const d = dlg.current, g = drag.current;
    drag.current = null;
    if (!d || !g) return;
    if (g.dy > 110) { close(`translateY(${g.dy}px)`); return; }
    d.style.transform = "";
    if (g.dy > 0 && !reduced()) d.animate([{ transform: `translateY(${g.dy}px)` }, { transform: "none" }], { duration: 220, easing: EASE });
  };

  return (
    <>
      <div ref={cardRef} className="expandable" onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) open(); }}>
        {card}
        <button type="button" className="btn icon ghost expand-btn" onClick={open} aria-haspopup="dialog" aria-label={`Open ${label}`}>
          <IconExpand />
        </button>
      </div>
      <dialog ref={dlg} className="detail" aria-labelledby={id}
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="detail-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="sheet-grip" aria-hidden="true" />
          <div className="detail-title">
            {avatar}
            <div><h2 id={id}>{title}</h2><p className="small muted">{subtitle}</p></div>
          </div>
          <button type="button" className="btn icon ghost" onClick={() => close()} aria-label="Close"><IconClose /></button>
        </div>
        <div ref={body} className="detail-body">{children}</div>
      </dialog>
    </>
  );
}

/** Copies an amount (digits only, so it pastes into a banking app) and says so. */
export function CopyAmount({ value, what }: { value: number; what: string }) {
  const [done, setDone] = useState(false);
  const text = value.toFixed(2);
  return (
    <button type="button" className={`btn copy${done ? " done" : ""}`} aria-label={`Copy ${what}, ${text}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { return; }
        setDone(true); window.setTimeout(() => setDone(false), 1600);
      }}>
      {done ? "Copied" : "Copy"}
      <span className="sr-only" role="status">{done ? `${what} copied` : ""}</span>
    </button>
  );
}
