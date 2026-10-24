"use client";
// A panel that slides up from the bottom on a phone and in from the side on
// wider screens. Closes on its button, Escape or a tap outside, and animates
// out as well as in.
import { useRef, useState } from "react";
import { IconClose } from "./icons";

export function Sheet({ trigger, title, subtitle, children }: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  subtitle?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const [id] = useState(() => `sheet-${Math.random().toString(36).slice(2, 8)}`);

  const open = () => { setClosing(false); ref.current?.showModal(); };
  const close = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { ref.current?.close(); return; }
    setClosing(true);
    window.setTimeout(() => { ref.current?.close(); setClosing(false); }, 200);
  };

  return (
    <>
      {trigger(open)}
      <dialog
        ref={ref} className={`sheet${closing ? " closing" : ""}`} aria-labelledby={id}
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div className="sheet-inner">
          <span className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <div><h2 id={id}>{title}</h2>{subtitle && <p className="small muted">{subtitle}</p>}</div>
            <button type="button" className="btn icon ghost" onClick={close} aria-label="Close"><IconClose /></button>
          </div>
          <div className="sheet-body">{children(close)}</div>
        </div>
      </dialog>
    </>
  );
}
