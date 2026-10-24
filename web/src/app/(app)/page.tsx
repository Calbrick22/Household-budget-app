import Link from "next/link";
import { Suspense } from "react";
import * as db from "@/lib/db";
import { calculateMonth, nextMonthAfter, previousConfirmed, settingsFor } from "@/lib/budget";
import { monthLabel, monthName } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { StatusPill } from "@/components/money";
import { AddMonthMenu, MonthPicker, StartMonthButton, Toast } from "@/components/month-controls";
import { Comparison, EasyAccess, JointLane, NegativeTransferNotes, PersonLane, SettingsUsed, Working, finding } from "@/components/month-cards";

export default async function ThisMonth({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireSession();
  const [{ month: wanted }, months, live] = await Promise.all([searchParams, db.getMonths(), db.getSettings()]);
  const next = nextMonthAfter(months);

  // The month named in the URL, else the latest confirmed one, else the latest.
  const confirmed = months.filter((m) => m.confirmed);
  const month = months.find((m) => String(m.id) === wanted) ?? confirmed[confirmed.length - 1] ?? months[months.length - 1];

  if (!month) {
    return (
      <>
        <h1>This month</h1>
        <section className="card section-gap">
          <h2>No months yet</h2>
          <p className="empty" style={{ margin: "6px 0 16px" }}>Start the first month, enter its bills and income, and the transfers for each of you appear here.</p>
          <div className="inline"><StartMonthButton year={next.year} month={next.month} primary /><AddMonthMenu year={next.year} month={next.month} label="Other month" /></div>
        </section>
      </>
    );
  }

  const fin = (await db.getFinancials(month.id))!;
  const r = calculateMonth(fin, live);
  const prev = previousConfirmed(months, month);
  const prevFin = prev ? await db.getFinancials(prev.id) : null;
  const prevResult = prevFin ? calculateMonth(prevFin, live) : null;
  const options = [...months].reverse().map((m) => ({ id: m.id, label: monthLabel(m) + (m.confirmed ? "" : " (draft)") }));

  return (
    <>
      <Suspense><Toast /></Suspense>
      <div className="title-row">
        <div className="title"><h1>{monthLabel(month)}</h1><StatusPill confirmed={month.confirmed} /></div>
        <div className="actions">
          <MonthPicker options={options} current={month.id} />
          <Link className={`btn${month.confirmed ? "" : " primary"}`} href={`/month/${month.id}/edit`}>{month.confirmed ? "Edit month" : "Finish month"}</Link>
          <StartMonthButton year={next.year} month={next.month} primary={month.confirmed} />
        </div>
      </div>
      <p className="finding">{finding(r)}</p>
      {!month.confirmed && <p className="finding" style={{ color: "var(--warning-ink)" }}>Draft: these figures are a preview until you finish the month.</p>}
      <NegativeTransferNotes r={r} />

      <div className="grid-3 section-gap">
        <PersonLane r={r} who="Cal" />
        <JointLane r={r} />
        <PersonLane r={r} who="Dani" />
      </div>

      <div className="grid-2-1 section-gap">
        <Working r={r} />
        <div className="stack">
          <EasyAccess r={r} />
          <Comparison r={r} prev={prevResult} prevName={prev ? monthName(prev.month) : ""} />
          <SettingsUsed s={settingsFor(fin, live)} frozen={fin.frozenSettings != null} />
        </div>
      </div>
    </>
  );
}
