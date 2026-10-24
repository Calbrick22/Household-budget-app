"use client";
// "How it's worked out": a card showing where the working lands, which opens
// the full maths in a panel.
import { Sheet } from "./sheet";

export function WorkingSheet({ month, summary, children }: { month: string; summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <Sheet
      title="How it's worked out" subtitle={month}
      trigger={(open) => (
        <button type="button" className="card drill" onClick={open} aria-haspopup="dialog" aria-label="How it's worked out: see the maths">
          <span className="drill-head"><span className="drill-title">How it&apos;s worked out</span><span className="drill-cue">See the maths <span aria-hidden="true">›</span></span></span>
          <span className="drill-body">{summary}</span>
        </button>
      )}
    >
      {() => children}
    </Sheet>
  );
}
