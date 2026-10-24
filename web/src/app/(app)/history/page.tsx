import Link from "next/link";
import { Suspense } from "react";
import * as db from "@/lib/db";
import { calculateMonth, nextMonthAfter, totalSaved } from "@/lib/budget";
import { money, monthLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { StatusPill } from "@/components/money";
import { AddMonthMenu, Toast } from "@/components/month-controls";
import { DeleteMonth } from "@/components/delete-month";

export const metadata = { title: "History" };

export default async function History() {
  await requireSession();
  const [all, live] = await Promise.all([db.getAllFinancials(), db.getSettings()]);
  const next = nextMonthAfter(all.map((f) => f.month));
  const rows = [...all].reverse().map((f) => ({ f, r: calculateMonth(f, live) }));

  return (
    <>
      <Suspense><Toast /></Suspense>
      <div className="title-row">
        <div><h1>History</h1><p className="subtitle">{rows.length} month{rows.length === 1 ? "" : "s"}, newest first.</p></div>
        <div className="actions">
          <AddMonthMenu year={next.year} month={next.month} />
          <a className="btn" href="/history/export" download>Download CSV</a>
        </div>
      </div>

      <section className="card section-gap">
        {rows.length === 0 ? <p className="empty">No months yet. Add one and it will be listed here.</p> : (
          <table className="table hist-table">
            <thead>
              <tr><th>Month</th><th className="hide-phone">Income</th><th className="hide-phone">Saved</th><th className="hide-phone">Cal → joint</th><th className="hide-phone">Dani → joint</th><th><span style={{ position: "absolute", left: -9999 }}>Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map(({ f, r }) => {
                const label = monthLabel(f.month);
                const saved = r.isShortfall ? <span style={{ color: "var(--negative)" }}>Short {money(-r.remainder)}</span> : money(totalSaved(r));
                return (
                  <tr key={f.month.id}>
                    <td>
                      <span className="inline" style={{ gap: 8 }}><b>{label}</b><StatusPill confirmed={f.month.confirmed} /></span>
                      <span className="hist-sub">{money(r.totalIncome)} in · {r.isShortfall ? `short ${money(-r.remainder)}` : `saved ${money(totalSaved(r))}`}<br />
                        Cal {money(Math.max(r.calToJoint, 0))} · Dani {money(Math.max(r.daniToJoint, 0))} to joint</span>
                    </td>
                    <td className="hide-phone">{money(r.totalIncome)}</td>
                    <td className="hide-phone">{saved}</td>
                    <td className="hide-phone">{money(Math.max(r.calToJoint, 0))}</td>
                    <td className="hide-phone">{money(Math.max(r.daniToJoint, 0))}</td>
                    <td>
                      <span className="row-actions">
                        <Link className="btn" href={`/?month=${f.month.id}`}>Open</Link>
                        <DeleteMonth id={f.month.id} label={label} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
