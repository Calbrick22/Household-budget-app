import * as db from "@/lib/db";
import { calculateMonth, savingsRates, totalSaved } from "@/lib/budget";
import { money, monthLabel, monthName, monthShort } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { LineChart, MoneyFlow, StackedBars } from "@/components/charts";

export const metadata = { title: "Trends" };

export default async function Trends() {
  await requireSession();
  const [all, live] = await Promise.all([db.getAllFinancials(), db.getSettings()]);
  const recent = all.filter((f) => f.month.confirmed).slice(-6);

  if (!recent.length) {
    return (
      <>
        <h1>Trends</h1>
        <p className="subtitle">The last six confirmed months, once there are some.</p>
        <section className="card section-gap"><p className="empty">No confirmed months yet. Finish a month and its figures start here.</p></section>
      </>
    );
  }

  const results = recent.map((f) => calculateMonth(f, live));
  const latest = results[results.length - 1];
  const latestFin = recent[recent.length - 1];
  const short = monthName(latestFin.month.month);
  const labels = recent.map((f) => monthShort(f.month.month));
  const [rateNow] = savingsRates(latest);
  let rateTitle = `${Math.round(rateNow)}% of income saved in ${short}`;
  if (results.length >= 2) {
    const [ratePrev] = savingsRates(results[results.length - 2]);
    const dir = rateNow > ratePrev ? "up from" : rateNow < ratePrev ? "down from" : "the same as";
    rateTitle += `, ${dir} ${Math.round(ratePrev)}%`;
  }
  const bills = latestFin.billsTotal;
  const calShare = bills > 0 ? (latestFin.calBills / bills) * 100 : 0;
  const daniShare = bills > 0 ? (latestFin.daniBills / bills) * 100 : 0;
  const jointTotal = results.reduce((s, r) => s + r.toEasyAccess + r.toLongTerm, 0);
  const incomeSum = results.reduce((s, r) => s + r.totalIncome, 0);
  const savedSum = results.reduce((s, r) => s + totalSaved(r), 0);

  return (
    <>
      <h1>Trends</h1>
      <p className="subtitle">The last {recent.length} confirmed month{recent.length === 1 ? "" : "s"}, {monthLabel(recent[0].month)} to {monthLabel(latestFin.month)}.</p>

      <section className="card chart-card section-gap">
        <h2>{latest.isShortfall ? `${monthLabel(latestFin.month)}: short by ${money(-latest.remainder)}, nothing saved`
          : `${monthLabel(latestFin.month)}: ${money(totalSaved(latest))} of ${money(latest.totalIncome)} saved`}</h2>
        <p className="caption">Where the month&apos;s income goes.</p>
        <MoneyFlow
          cal={latest.calIncome} dani={latest.daniIncome}
          outs={[
            { name: "Bills", value: latest.billsTotal, color: "var(--neutral-dark)", soft: "var(--neutral-soft)" },
            { name: "Allowances", value: latest.allowanceTotal, color: "var(--neutral-light)", soft: "var(--neutral-softer)" },
            { name: "Cal personal savings", value: latest.calPersonalSavings, color: "var(--cal-mid)", soft: "var(--cal-soft)" },
            { name: "Dani personal savings", value: latest.daniPersonalSavings, color: "var(--dani-mid)", soft: "var(--dani-soft)" },
          ]}
          joint={{ value: Math.max(latest.jointSavings, 0), color: "var(--joint-mid)", soft: "var(--joint-soft)" }}
          jointSplit={[{ name: "Easy-access", value: latest.toEasyAccess, color: "var(--joint-mid)" }, { name: "Long-term", value: latest.toLongTerm, color: "var(--joint)" }]}
        />
      </section>

      <div className="grid-2 section-gap">
        <section className="card chart-card">
          <h2>{rateTitle}</h2>
          <p className="caption">Share of income saved each month.</p>
          <LineChart labels={labels} suffix="%"
            series={[
              { name: "All savings", values: results.map((r) => savingsRates(r)[0]), color: "var(--joint-mid)" },
              { name: "Personal savings only", values: results.map((r) => savingsRates(r)[1]), color: "var(--neutral-dark)" },
            ]}
            annotations={results.map((r, i) => (r.isShortfall ? { at: i, label: "Shortfall" } : null)).filter((a): a is { at: number; label: string } => a != null)}
          />
        </section>
        <section className="card chart-card">
          <h2>Cal&apos;s own bills: {Math.round(calShare)}% of {short}&apos;s, Dani&apos;s {Math.round(daniShare)}%</h2>
          <p className="caption">Each month&apos;s bills by whose they are.</p>
          <StackedBars labels={labels} percent
            series={[
              { name: "Joint", values: recent.map((f) => Math.max(f.billsTotal - f.calBills - f.daniBills, 0)), color: "var(--joint-mid)" },
              { name: "Cal", values: recent.map((f) => f.calBills), color: "var(--cal-mid)" },
              { name: "Dani", values: recent.map((f) => f.daniBills), color: "var(--dani-mid)" },
            ]} />
        </section>
        <section className="card chart-card">
          <h2>{money(jointTotal)} into joint savings</h2>
          <p className="caption">Each month&apos;s joint savings, by pot.</p>
          <StackedBars labels={labels} pounds
            series={[
              { name: "Easy-access", values: results.map((r) => r.toEasyAccess), color: "var(--joint-mid)" },
              { name: "Long-term", values: results.map((r) => r.toLongTerm), color: "var(--joint)" },
            ]} />
        </section>
        <section className="card chart-card">
          <h2>Each month at a glance</h2>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Month</th><th>Income</th><th>Saved</th><th>Rate</th></tr></thead>
            <tbody>
              {[...results].reverse().map((r, i) => {
                const f = recent[recent.length - 1 - i];
                return (
                  <tr key={f.month.id}>
                    <td>{monthShort(f.month.month)} {f.month.year}</td>
                    <td>{money(r.totalIncome)}</td>
                    <td>{r.isShortfall ? <span style={{ color: "var(--negative)" }}>Short</span> : money(totalSaved(r))}</td>
                    <td>{savingsRates(r)[0].toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr className="total"><td>All {recent.length}</td><td>{money(incomeSum)}</td><td>{money(savedSum)}</td><td>{incomeSum > 0 ? ((savedSum / incomeSum) * 100).toFixed(1) : "0.0"}%</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
