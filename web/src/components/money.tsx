import { money } from "@/lib/format";

/** A headline figure with the pence set smaller and grey. */
export function BigMoney({ value }: { value: number }) {
  const [pounds, pence] = money(value).split(".");
  return <p className="big">{pounds}<span className="pence">.{pence}</span></p>;
}

export function Row({ label, value, sub, cls = "" }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; cls?: string }) {
  return (
    <div className={`row ${cls}`}>
      <span>{label}{sub ? <span className="sub">{sub}</span> : null}</span>
      <span className="amt">{value}</span>
    </div>
  );
}

export function Avatar({ who, small }: { who: "Cal" | "Dani" | "Joint"; small?: boolean }) {
  return <span className={`avatar ${who.toLowerCase()}${small ? " small" : ""}`} aria-hidden="true">{who[0]}</span>;
}

export function StatusPill({ confirmed }: { confirmed: boolean }) {
  return confirmed ? <span className="pill confirmed">Confirmed</span> : <span className="pill draft">Draft</span>;
}
