// The cards of the month screen: Cal, Joint and Dani side by side, then the
// working, the easy-access pot, the comparison and the settings used.
import type { WaterfallResult } from "@/lib/calculations";
import type { Settings } from "@/lib/db";
import { money, pct, ratePct } from "@/lib/format";
import { Avatar, BigMoney, Row } from "./money";

export function PersonLane({ r, who }: { r: WaterfallResult; who: "Cal" | "Dani" }) {
  const cal = who === "Cal";
  const income = cal ? r.calIncome : r.daniIncome;
  const bills = cal ? r.calPersonalBills : r.daniPersonalBills;
  const toJoint = cal ? r.calToJoint : r.daniToJoint;
  const savings = cal ? r.calPersonalSavings : r.daniPersonalSavings;
  const totalOut = toJoint + r.allowancePerPerson + savings;
  const jointSub = toJoint < 0
    ? <span style={{ color: "var(--negative)" }}>would be {money(toJoint)}, see the note above</span>
    : "joint savings and bills";
  return (
    <section className="card lane" aria-label={`${who}'s account`}>
      <div className="lane-head"><Avatar who={who} /><h2>{who}&apos;s account</h2></div>
      <p className="lane-label">Transferred out, in this order</p>
      <BigMoney value={Math.max(totalOut, 0)} />
      <p className="calc">{money(income)} income − {money(bills)} personal bills</p>
      <ol className="moves">
        <li><Row label="Joint account" value={money(Math.max(toJoint, 0))} sub={jointSub} /></li>
        <li><Row label="Personal account" value={money(r.allowancePerPerson)} sub="allowance" /></li>
        <li><Row label="Personal savings" value={money(savings)} /></li>
      </ol>
      <div className="foot"><Row label="Left in account for personal bills" value={money(bills)} cls="total" /></div>
    </section>
  );
}

export function JointLane({ r }: { r: WaterfallResult }) {
  return (
    <section className="card lane" aria-label="Joint account">
      <div className="lane-head"><Avatar who="Joint" /><h2>Joint account</h2></div>
      <p className="lane-label">Comes in from you both</p>
      <BigMoney value={r.calToJoint + r.daniToJoint} />
      <p className="calc">Cal {money(r.calToJoint)} + Dani {money(r.daniToJoint)}</p>
      <Row label="Joint bills" value={money(r.jointBillsTotal)} />
      <Row label="Joint savings" value={money(r.jointSavings)} sub={`${ratePct(r.savingsRate)} of the ${money(Math.max(r.remainder, 0))} left after bills and allowances`} />
      <Row label="To easy-access pot" value={money(r.toEasyAccess)} cls="indent" />
      <Row label="To long-term pot" value={money(r.toLongTerm)} cls="indent" />
      <div className="foot"><Row label="Paid out" value={money(r.jointBillsTotal + r.jointSavings)} cls="total" /></div>
    </section>
  );
}

/** Warnings that must stay in view: a shortfall, and a transfer that would go negative. */
export function MonthNotes({ r }: { r: WaterfallResult }) {
  const notes = ([["Cal", r.calToJoint, "his"], ["Dani", r.daniToJoint, "her"]] as const).filter(([, v]) => v < 0);
  if (!notes.length && !r.isShortfall) return null;
  return (
    <div style={{ marginTop: 12 }}>
      {r.isShortfall && (
        <p className="alert bad" role="alert">
          Shortfall this month: income doesn&apos;t cover bills and allowances by {money(-r.remainder)}. Nothing has been
          adjusted automatically - decide how to handle it and re-edit the month if needed.
        </p>
      )}
      {notes.map(([who, , pronoun]) => (
        <p key={who} className="alert bad" role="alert">
          {who}&apos;s allowance and savings add up to more than what&apos;s left after {pronoun} own bills this month -
          the joint transfer can&apos;t go negative, so the shortfall needs covering another way.
        </p>
      ))}
    </div>
  );
}

/** The waterfall step by step, in the model's own order (shown in the drill-down panel). */
export function WorkingSteps({ r }: { r: WaterfallResult }) {
  return (
    <>
      <div className="step">
        <p className="step-title">1. Income, less each person&apos;s own bills</p>
        <Row label="Cal" value={money(r.calRemainder)} sub={`${money(r.calIncome)} income − ${money(r.calPersonalBills)} personal bills`} />
        <Row label="Dani" value={money(r.daniRemainder)} sub={`${money(r.daniIncome)} income − ${money(r.daniPersonalBills)} personal bills`} />
        <Row label="Into the joint pot" value={money(r.pot)} cls="total" sub={`Cal ${pct(r.calContributionShare)} · Dani ${pct(r.daniContributionShare)}`} />
      </div>
      <div className="step">
        <p className="step-title">2. Paid from the pot</p>
        <Row label="Joint bills" value={`−${money(r.jointBillsTotal)}`} />
        <Row label={`Allowances (${money(r.allowancePerPerson)} × 2)`} value={`−${money(r.allowanceTotal)}`} />
        <Row label="Left after bills and allowances" value={money(r.remainder)} cls="total" />
      </div>
      {r.isShortfall && (
        <p className="alert bad" style={{ marginTop: 14 }}>
          Short by {money(-r.remainder)}: bills and allowances are more than the pot, so nothing is saved.
        </p>
      )}
      <div className="step">
        <p className="step-title">3. What&apos;s left is saved</p>
        <Row label={`Joint savings (${ratePct(r.savingsRate)})`} value={money(r.jointSavings)} />
        <Row label="Personal savings" value={money(r.personalSavingsTotal)} sub="the rest, split by what each of you put into the pot" />
        <Row label={`Cal (${pct(r.calContributionShare)})`} value={money(r.calPersonalSavings)} cls="indent" />
        <Row label={`Dani (${pct(r.daniContributionShare)})`} value={money(r.daniPersonalSavings)} cls="indent" />
      </div>
      <p className="calc" style={{ margin: "14px 0 0" }}>
        All bills this month: {money(r.billsTotal)} (Cal {money(r.calPersonalBills)}, Dani {money(r.daniPersonalBills)}, joint {money(r.jointBillsTotal)}).
      </p>
    </>
  );
}

/** The three totals the working arrives at, for the card that opens it. */
export function WorkingSummary({ r }: { r: WaterfallResult }) {
  return (
    <>
      <Row label="Into the joint pot" value={money(r.pot)} sub={`${money(r.totalIncome)} income − ${money(r.calPersonalBills + r.daniPersonalBills)} personal bills`} />
      <Row label="Left after bills and allowances" value={money(r.remainder)} sub={`− ${money(r.jointBillsTotal)} joint bills − ${money(r.allowanceTotal)} allowances`} />
      {r.isShortfall
        ? <Row label="Saved" value={<span style={{ color: "var(--negative)" }}>{money(0)}</span>} sub="a shortfall month saves nothing" />
        : <Row label="Saved" value={money(r.jointSavings + r.personalSavingsTotal)} sub={`${money(r.jointSavings)} joint · ${money(r.personalSavingsTotal)} personal`} />}
    </>
  );
}

export function EasyAccess({ r }: { r: WaterfallResult }) {
  const target = r.easyAccessTarget;
  const balance = r.currentEasyAccessBalance;
  if (target <= 0) {
    return <section className="card"><h2>Easy-access pot</h2><p className="empty">No target set. Add one in Settings.</p></section>;
  }
  const before = Math.max(0, Math.min(balance / target, 1)) * 100;
  const added = Math.max(0, Math.min(r.toEasyAccess / target, 1 - before / 100)) * 100;
  return (
    <section className="card">
      <h2>Easy-access pot</h2>
      <p className="calc" style={{ margin: "4px 0 0" }}>{money(r.toEasyAccess)} goes in this month, {money(r.toLongTerm)} to the long-term pot.</p>
      <div className="track" role="img" aria-label={`${money(balance)} of ${money(target)}, plus ${money(r.toEasyAccess)} this month`}>
        <span style={{ width: `${before}%`, background: "var(--joint-mid)" }} />
        <span style={{ width: `${added}%`, background: "var(--joint-pale)" }} />
      </div>
      <div className="track-ends"><span>{money(balance)} + {money(r.toEasyAccess)}</span><span>{money(target)} target</span></div>
    </section>
  );
}

export function Comparison({ r, prev, prevName }: { r: WaterfallResult; prev: WaterfallResult | null; prevName: string }) {
  if (!prev) {
    return <section className="card"><h2>Against last month</h2><p className="empty" style={{ marginTop: 8 }}>No earlier confirmed month to compare with yet.</p></section>;
  }
  // Colour only a change in the bad direction; everything else stays grey.
  const change = (cur: number, before: number, badIfUp: boolean | null) => {
    const diff = Math.round((cur - before) * 100) / 100;
    if (Math.abs(diff) < 0.005) return <span className="chg">—</span>;
    const bad = (badIfUp === true && diff > 0) || (badIfUp === false && diff < 0);
    return <span className={`chg${bad ? " bad" : ""}`}>{diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</span>;
  };
  const lines: [string, number, number, boolean | null][] = [
    ["Income", r.totalIncome, prev.totalIncome, false],
    ["All bills", r.billsTotal, prev.billsTotal, true],
    ["Allowances", r.allowanceTotal, prev.allowanceTotal, null],
    ["All savings", r.jointSavings + r.personalSavingsTotal, prev.jointSavings + prev.personalSavingsTotal, false],
    ["Joint savings", r.jointSavings, prev.jointSavings, false],
    ["Personal savings", r.personalSavingsTotal, prev.personalSavingsTotal, false],
    ["Into joint", r.calToJoint + r.daniToJoint, prev.calToJoint + prev.daniToJoint, null],
  ];
  return (
    <section className="card">
      <h2>Against {prevName}</h2>
      <table className="table" style={{ marginTop: 12 }}>
        <thead><tr><th>Figure</th><th>This month</th><th>Change</th></tr></thead>
        <tbody>{lines.map(([n, c, p, b]) => <tr key={n}><td>{n}</td><td>{money(c)}</td><td>{change(c, p, b)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

export function SettingsUsed({ s, frozen }: { s: Settings; frozen: boolean }) {
  return (
    <>
      <div className="step">
        <p className="step-title">Settings used</p>
        <Row label="Allowance per person" value={money(s.allowancePerPerson)} />
        <Row label="Joint savings rate" value={ratePct(s.savingsRate)} />
        <Row label="Easy-access target" value={money(s.easyAccessTarget)} />
      </div>
      <p className="calc" style={{ margin: "10px 0 0" }}>
        {frozen ? "Frozen when this month was confirmed, so changing Settings won't change it."
          : "Today's settings. They are frozen with this month when you finish it."}
      </p>
    </>
  );
}

export function finding(r: WaterfallResult): React.ReactNode {
  if (r.isShortfall) {
    return <><b style={{ color: "var(--negative)" }}>Short by {money(-r.remainder)}.</b> Bills and allowances are more than the pot, so nothing is saved this month.</>;
  }
  return <>{money(r.jointSavings + r.personalSavingsTotal)} saved: {money(r.jointSavings)} joint and {money(r.personalSavingsTotal)} personal, split {pct(r.calContributionShare)} Cal / {pct(r.daniContributionShare)} Dani.</>;
}
