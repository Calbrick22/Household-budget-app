import Link from "next/link";
import { Suspense } from "react";
import * as db from "@/lib/db";
import { calculateMonth, nextMonthAfter, previousConfirmed, settingsFor } from "@/lib/budget";
import { money, monthLabel, monthName } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { StatusPill } from "@/components/money";
import { AddMonthMenu, MonthPicker, StartMonthButton, Toast } from "@/components/month-controls";
import { Comparison, EasyAccess, JointLane, MonthNotes, PersonLane, SettingsUsed, WorkingSteps, WorkingSummary, finding } from "@/components/month-cards";
import { LaneCarousel } from "@/components/lane-carousel";
import { WorkingSheet } from "@/components/working-sheet";

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
  // Each month in the picker carries its headline, worked out with its own settings.
  const allFin = await db.getAllFinancials();
  const options = [...allFin].reverse().map((f) => {
    const res = calculateMonth(f, live);
    return {
      id: f.month.id, label: monthLabel(f.month), confirmed: f.month.confirmed,
      note: res.isShortfall ? `Short by ${money(-res.remainder)}` : `${money(res.jointSavings + res.personalSavingsTotal)} saved`,
    };
  });

  return (
    <>
      <Suspense><Toast /></Suspense>
      <div className="title-row">
        <div className="title"><MonthPicker options={options} current={month.id} title={monthLabel(month)} /><StatusPill confirmed={month.confirmed} /></div>
        <div className="actions">
          <Link className={`btn${month.confirmed ? "" : " primary"}`} href={`/month/${month.id}/edit`}>{month.confirmed ? "Edit month" : "Finish month"}</Link>
          <StartMonthButton year={next.year} month={next.month} primary={month.confirmed} />
        </div>
      </div>
      <p className="finding">{finding(r)}</p>
      {!month.confirmed && <p className="finding" style={{ color: "var(--warning-ink)" }}>Draft: these figures are a preview until you finish the month.</p>}
      <MonthNotes r={r} />

      <LaneCarousel>
        <PersonLane r={r} who="Cal" />
        <JointLane r={r} />
        <PersonLane r={r} who="Dani" />
      </LaneCarousel>

      <div className="below">
        <div className="stack">
          <WorkingSheet month={monthLabel(month)} summary={<WorkingSummary r={r} />}>
            <WorkingSteps r={r} />
            <SettingsUsed s={settingsFor(fin, live)} frozen={fin.frozenSettings != null} />
          </WorkingSheet>
          <EasyAccess r={r} />
        </div>
        <Comparison r={r} prev={prevResult} prevName={prev ? monthName(prev.month) : ""} />
      </div>
    </>
  );
}
