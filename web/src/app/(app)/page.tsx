import Link from "next/link";
import { Suspense } from "react";
import * as db from "@/lib/db";
import { calculateMonth, nextMonthAfter, previousConfirmed, settingsFor, totalSaved } from "@/lib/budget";
import { money, monthLabel, monthName, monthShort } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { Avatar, StatusPill } from "@/components/money";
import { AddMonthMenu, StartMonthButton, Toast } from "@/components/month-controls";
import {
  ChangeTable, JointDetail, JointLane, MonthNotes, PersonDetail, PersonLane, SettingsUsed, WorkingSteps, changes, finding,
  type HistoryPoint,
} from "@/components/month-cards";
import { LaneCarousel } from "@/components/lane-carousel";
import { CardDetail } from "@/components/card-detail";
import { MonthBody, MonthStrip, MonthView } from "@/components/month-strip";
import { ChangeTile, NextTile, PotTile, SavedTile } from "@/components/tiles";
import { FinishMoment } from "@/components/finish-moment";
import { MonthCheckIn } from "@/components/month-checkin";
import { StackedBars } from "@/components/charts";

export const metadata = { title: "This month" };

export default async function ThisMonth({ searchParams }: { searchParams: Promise<{ month?: string; checkin?: string }> }) {
  await requireSession();
  const [{ month: wanted, checkin }, allFin, live] = await Promise.all([searchParams, db.getAllFinancials(), db.getSettings()]);
  const months = allFin.map((f) => f.month);
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

  const fin = allFin.find((f) => f.month.id === month.id)!;
  const [bills, income] = await Promise.all([db.getBillEntries(month.id), db.getIncome(month.id)]);
  const r = calculateMonth(fin, live);
  const prev = previousConfirmed(months, month);
  const prevFin = prev ? allFin.find((f) => f.month.id === prev.id) ?? null : null;
  const prevResult = prevFin ? calculateMonth(prevFin, live) : null;
  const lines = prevResult ? changes(r, prevResult) : [];

  // Up to six months for the small charts: the confirmed ones up to this month, and this one.
  const history: HistoryPoint[] = allFin
    .filter((f) => (f.month.confirmed || f.month.id === month.id) && (f.month.year < month.year || (f.month.year === month.year && f.month.month <= month.month)))
    .slice(-6)
    .map((f) => {
      const x = calculateMonth(f, live);
      return {
        label: monthShort(f.month.month), draft: !f.month.confirmed, calSavings: x.calPersonalSavings, daniSavings: x.daniPersonalSavings,
        easy: x.toEasyAccess, long: x.toLongTerm, balance: f.month.easyAccessBalance,
      };
    });

  const latest = months[months.length - 1];
  const checkInHref = (id: number) => `/?month=${id}&checkin=1`;
  const finish = !month.confirmed ? { name: monthName(month.month), href: checkInHref(month.id) }
    : !latest.confirmed ? { name: monthLabel(latest), href: checkInHref(latest.id) } : null;
  const label = monthLabel(month);
  const toJoint = (v: number) => Math.max(v, 0);
  const summary = r.isShortfall
    ? `${label} is confirmed, short by ${money(-r.remainder)}.`
    : `${label} is confirmed: ${money(totalSaved(r))} saved. Cal ${money(toJoint(r.calToJoint))} and Dani ${money(toJoint(r.daniToJoint))} into joint.`;

  // The check-in opens over the month when the URL asks for it.
  async function checkIn() {
    const [templates, prevBills, prevIncome] = await Promise.all([
      db.getActiveTemplates(), prev ? db.getBillEntries(prev.id) : [], prev ? db.getIncome(prev.id) : null,
    ]);
    const lastAmounts: Record<number, number> = {};
    for (const b of prevBills) if (b.templateId != null) lastAmounts[b.templateId] = (lastAmounts[b.templateId] ?? 0) + b.amount;
    return (
      <MonthCheckIn
        // A new key after every save, so the check-in starts again from what was stored.
        key={`${bills.map((b) => `${b.id}:${b.amount}:${b.tag}:${b.name}`).join("|")}|${fin.calIncome}|${fin.daniIncome}|${month!.easyAccessBalance}`}
        monthId={month!.id} monthName={label} previousName={prev ? monthName(prev.month) : null}
        confirmed={month!.confirmed} settings={settingsFor(fin, live)} bills={bills}
        variesIds={templates.filter((t) => t.varies).map((t) => t.id)} lastAmounts={lastAmounts}
        calSalary={income["Cal:Salary"] ?? 0} calRaf={income["Cal:RAF"] ?? 0} daniIncome={income["Dani:Income"] ?? 0}
        lastIncome={prevIncome ? { calSalary: prevIncome["Cal:Salary"] ?? 0, calRaf: prevIncome["Cal:RAF"] ?? 0, daniIncome: prevIncome["Dani:Income"] ?? 0 } : null}
        easyAccessBalance={month!.easyAccessBalance}
        suggestion={prevResult && prev ? { from: monthName(prev.month), balance: prevResult.currentEasyAccessBalance, added: prevResult.toEasyAccess } : null}
      />
    );
  }

  return (
    <MonthView>
      <Suspense><Toast /></Suspense>
      <Suspense><FinishMoment summary={summary} /></Suspense>
      {checkin === "1" && await checkIn()}
      <h1 className="sr-only">{label}</h1>
      <MonthStrip
        months={months.map((m) => ({ id: m.id, month: monthShort(m.month), year: m.year, label: monthLabel(m), confirmed: m.confirmed }))}
        current={month.id} next={{ ...next, short: monthShort(next.month) }}
      />
      <MonthBody>
        <div className="month-head">
          <div className="month-status">
            <StatusPill confirmed={month.confirmed} />
            <p className="finding">{finding(r)}</p>
          </div>
          <Link className="btn" href={checkInHref(month.id)} scroll={false}>{month.confirmed ? "Edit month" : "Check in"}</Link>
        </div>
        {!month.confirmed && <p className="finding" style={{ color: "var(--warning-ink)" }}>Draft: these figures are a preview until you finish the month.</p>}
        <MonthNotes r={r} />

        <LaneCarousel cal={toJoint(r.calToJoint)} dani={toJoint(r.daniToJoint)}>
          {(["Cal", "Joint", "Dani"] as const).map((who) => (
            <CardDetail key={who}
              label={who === "Joint" ? "the joint account" : `${who}'s account`}
              title={who === "Joint" ? "Joint account" : `${who}'s month`} subtitle={label}
              avatar={<Avatar who={who} />}
              card={who === "Joint" ? <JointLane r={r} /> : <PersonLane r={r} who={who} />}
            >
              {who === "Joint"
                ? <JointDetail r={r} bills={bills.filter((b) => b.tag === "Joint")} history={history} />
                : <PersonDetail r={r} who={who} history={history} bills={bills.filter((b) => b.tag === who)}
                    income={who === "Cal" ? [["Salary", income["Cal:Salary"] ?? 0], ["RAF", income["Cal:RAF"] ?? 0]] : [["Income", income["Dani:Income"] ?? 0]]} />}
            </CardDetail>
          ))}
        </LaneCarousel>

        <div className="bento">
          <SavedTile month={label} saved={totalSaved(r)} joint={r.jointSavings} cal={r.calPersonalSavings} dani={r.daniPersonalSavings}
            short={r.isShortfall ? -r.remainder : null} pot={r.pot} left={r.remainder}>
            <WorkingSteps r={r} />
            <SettingsUsed s={settingsFor(fin, live)} frozen={fin.frozenSettings != null} />
          </SavedTile>
          <PotTile balance={r.currentEasyAccessBalance} added={r.toEasyAccess} target={r.easyAccessTarget}>
            <p className="calc" style={{ margin: "4px 0 0" }}>
              {label} started at {money(r.currentEasyAccessBalance)}. {money(r.toEasyAccess)} goes in this month and {money(r.toLongTerm)} to the long-term pot.
              {" "}The easy-access pot fills first, until it reaches the target.
            </p>
            <div className="step">
              <p className="step-title">Balance at the start of each month, and what went in</p>
              <StackedBars labels={history.map((h) => h.label)} pounds height={200}
                series={[
                  { name: "Starting balance", values: history.map((h) => h.balance), color: "var(--joint-mid)" },
                  { name: "Added that month", values: history.map((h) => h.easy), color: "var(--joint-pale)" },
                ]} />
            </div>
          </PotTile>
          <ChangeTile prevName={prev ? monthName(prev.month) : null} lines={lines}>
            <ChangeTable lines={lines} />
            <p className="calc" style={{ margin: "12px 0 0" }}>Red marks a change in the direction that costs you: bills up, or income or savings down.</p>
          </ChangeTile>
          <NextTile finish={finish} start={{ year: next.year, month: next.month, label: `${monthShort(next.month)} ${next.year}` }} />
        </div>
      </MonthBody>
    </MonthView>
  );
}
