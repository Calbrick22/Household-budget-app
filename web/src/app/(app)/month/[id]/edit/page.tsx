import { notFound } from "next/navigation";
import { Suspense } from "react";
import * as db from "@/lib/db";
import { calculateMonth, previousConfirmed, settingsFor } from "@/lib/budget";
import { monthLabel, monthName, monthShort } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { MonthEditor } from "@/components/month-editor";
import { Toast } from "@/components/month-controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const m = await db.getMonth(Number((await params).id));
  return { title: m ? `Edit ${monthLabel(m)}` : "Month not found" };
}

export default async function EditMonth({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const id = Number((await params).id);
  const [fin, bills, income, months, live] = await Promise.all([
    db.getFinancials(id), db.getBillEntries(id), db.getIncome(id), db.getMonths(), db.getSettings(),
  ]);
  if (!fin) notFound();
  const month = fin.month;

  // Offer last confirmed month's balance plus its top-up; never fill it in unasked.
  const prev = previousConfirmed(months, month);
  let suggestion = null;
  if (prev) {
    const prevFin = await db.getFinancials(prev.id);
    if (prevFin) {
      const pr = calculateMonth(prevFin, live);
      suggestion = { from: monthName(prev.month), balance: pr.currentEasyAccessBalance, added: pr.toEasyAccess };
    }
  }

  return (
    <>
      <Suspense><Toast /></Suspense>
      <MonthEditor
        // A new key after every save, so the editor starts again from what was stored.
        key={`${bills.map((b) => `${b.id}:${b.amount}:${b.tag}:${b.name}`).join("|")}|${fin.calIncome}|${fin.daniIncome}|${month.easyAccessBalance}`}
        monthId={month.id} monthName={monthLabel(month)} shortName={`${monthShort(month.month)} ${month.year}`}
        confirmed={month.confirmed} settings={settingsFor(fin, live)} bills={bills}
        calSalary={income["Cal:Salary"] ?? 0} calRaf={income["Cal:RAF"] ?? 0} daniIncome={income["Dani:Income"] ?? 0}
        easyAccessBalance={month.easyAccessBalance} suggestion={suggestion}
      />
    </>
  );
}
