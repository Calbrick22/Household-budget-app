"use client";
// The tiles under the cards: what was saved, the easy-access pot, the biggest
// change since last month and the next thing to do. Each of the first three
// opens a panel with the detail behind it.
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { startMonth } from "@/app/actions";
import { money } from "@/lib/format";
import { confirmLeave } from "@/lib/leave-guard";
import { Sheet } from "./sheet";
import { Roll, RollingBig } from "./rolling";
import type { Change } from "./month-cards";

const Cue = ({ children }: { children: React.ReactNode }) => <span className="tile-cue">{children} <span aria-hidden="true">›</span></span>;

export function SavedTile({ month, saved, joint, cal, dani, short, pot, left, children }: {
  month: string; saved: number; joint: number; cal: number; dani: number; short: number | null; pot: number; left: number; children: React.ReactNode;
}) {
  const parts = [
    { name: "Joint", value: joint, color: "var(--joint-mid)" },
    { name: "Cal", value: cal, color: "var(--cal-mid)" },
    { name: "Dani", value: dani, color: "var(--dani-mid)" },
  ];
  return (
    <Sheet title="How it's worked out" subtitle={month}
      trigger={(open) => (
        <button type="button" className="tile tile-saved" onClick={open} aria-haspopup="dialog" aria-label="Saved this month: see the maths">
          <span className="tile-label">{short == null ? "Saved this month" : "Shortfall this month"}</span>
          {short == null ? <RollingBig value={saved} className="big tile-big" />
            : <span className="big tile-big" style={{ color: "var(--negative)" }}>−{money(short)}</span>}
          {short == null ? (
            <>
              <span className="split" aria-hidden="true">
                {parts.filter((p) => p.value > 0).map((p) => <span key={p.name} style={{ flexGrow: p.value, background: p.color }} />)}
              </span>
              <span className="split-key">
                {parts.map((p) => <span key={p.name}><span className="dot" style={{ background: p.color }} />{p.name} <b><Roll value={p.value} /></b></span>)}
              </span>
            </>
          ) : <span className="small muted">Bills and allowances are more than the pot, so nothing is saved.</span>}
          <span className="tile-rows">
            <span><span>Into the joint pot</span><b><Roll value={pot} /></b></span>
            <span><span>Left after bills and allowances</span><b><Roll value={left} /></b></span>
          </span>
          <Cue>See the maths</Cue>
        </button>
      )}>
      {() => children}
    </Sheet>
  );
}

/** The pot as a jar: this month's starting balance, what goes in, and a line at the target. */
export function PotTile({ balance, added, target, children }: { balance: number; added: number; target: number; children: React.ReactNode }) {
  if (target <= 0) {
    return (
      <Link href="/settings" className="tile tile-pot" onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}>
        <span className="tile-label">Easy-access pot</span>
        <span className="small muted">No target set yet.</span>
        <Cue>Set one in Settings</Cue>
      </Link>
    );
  }
  const top = Math.max(target, balance + added) * 1.12;
  const h = (v: number) => `${(Math.max(v, 0) / top) * 100}%`;
  const after = balance + added;
  const left = Math.max(target - after, 0);
  return (
    <Sheet title="Easy-access pot" subtitle={`${money(target)} target`}
      trigger={(open) => (
        <button type="button" className="tile tile-pot" onClick={open} aria-haspopup="dialog" aria-label="Easy-access pot: see the balance over time">
          <span className="tile-label">Easy-access pot</span>
          <span className="pot">
            <span className="jar" role="img" aria-label={`${money(balance)} plus ${money(added)} this month, against a ${money(target)} target`}>
              <span className="jar-fill" style={{ height: h(after) }}>
                <span className="jar-added" style={{ height: after > 0 ? `${(added / after) * 100}%` : 0 }} />
              </span>
              <span className="jar-target" style={{ bottom: h(target) }} />
            </span>
            <span className="pot-figures">
              <b className="num"><Roll value={after} /></b>
              <span className="small muted">+{money(added)} this month</span>
              <span className="small muted">{left > 0 ? `${money(left)} to go` : "Target reached"}</span>
            </span>
          </span>
          <Cue>Balance over time</Cue>
        </button>
      )}>
      {() => children}
    </Sheet>
  );
}

export function ChangeTile({ prevName, lines, children }: { prevName: string | null; lines: Change[]; children: React.ReactNode }) {
  if (!prevName) {
    return (
      <div className="tile tile-change">
        <span className="tile-label">Against last month</span>
        <span className="small muted">No earlier confirmed month to compare with yet.</span>
      </div>
    );
  }
  // The figure that moved most, leaving out the allowances (a setting, not a change in the month).
  const moved = lines.filter((l) => l.name !== "Allowances").reduce((a, b) => (Math.abs(b.diff) > Math.abs(a.diff) ? b : a));
  const still = Math.abs(moved.diff) < 0.005;
  return (
    <Sheet title={`Against ${prevName}`} subtitle="Each figure, and how it moved"
      trigger={(open) => (
        <button type="button" className="tile tile-change" onClick={open} aria-haspopup="dialog" aria-label={`Changes since ${prevName}: see them all`}>
          <span className="tile-label">Biggest change since {prevName}</span>
          {still ? <b>Nothing moved</b> : (
            <>
              <b className={`tile-move${moved.bad ? " bad" : ""}`}>{moved.diff > 0 ? "+" : "−"}{money(Math.abs(moved.diff))}</b>
              <span className="small muted">{moved.name} {moved.diff > 0 ? "up" : "down"}</span>
            </>
          )}
          <Cue>All changes</Cue>
        </button>
      )}>
      {() => children}
    </Sheet>
  );
}

function StartButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tile tile-next" disabled={pending} onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}>
      <span className="tile-label">Next step</span>
      <b>{pending ? "Opening…" : label}</b>
      <span className="small">Its recurring bills are filled in for you.</span>
    </button>
  );
}

/** What to do now: finish a draft, or start the month after the latest. */
export function NextTile({ finish, start }: {
  finish: { name: string; href: string } | null; start: { year: number; month: number; label: string };
}) {
  if (finish) {
    return (
      <Link href={finish.href} className="tile tile-next">
        <span className="tile-label">Next step</span>
        <b>Finish {finish.name}</b>
        <span className="small">Check the bills and income, then confirm.</span>
      </Link>
    );
  }
  return (
    <form action={startMonth} style={{ display: "contents" }}>
      <input type="hidden" name="year" value={start.year} />
      <input type="hidden" name="month" value={start.month} />
      <StartButton label={`Start ${start.label}`} />
    </form>
  );
}
