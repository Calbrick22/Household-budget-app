// One row per month, the same columns as the Streamlit export.
import * as db from "@/lib/db";
import { calculateMonth } from "@/lib/budget";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const FIELDS = [
  "year", "month", "confirmed", "cal_income", "dani_income", "total_income", "bills_total",
  "allowance_per_person", "allowance_total", "savings_rate", "cal_personal_savings",
  "dani_personal_savings", "remainder", "is_shortfall", "current_easy_access_balance",
  "easy_access_target", "to_easy_access", "to_long_term",
] as const;

// Python's str() for the same values: True/False, and floats always carry a decimal point.
const cell = (v: unknown) => (typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "number" && Number.isInteger(v) ? `${v}.0` : String(v));

export async function GET() {
  if (!(await hasSession())) return new Response("Unauthorised", { status: 401 });
  const [all, live] = await Promise.all([db.getAllFinancials(), db.getSettings()]);
  const lines = [FIELDS.join(",")];
  for (const f of [...all].reverse()) {
    const r = calculateMonth(f, live);
    const row: Record<(typeof FIELDS)[number], unknown> = {
      year: f.month.year, month: f.month.month, confirmed: f.month.confirmed,
      cal_income: r.calIncome, dani_income: r.daniIncome, total_income: r.totalIncome, bills_total: r.billsTotal,
      allowance_per_person: r.allowancePerPerson, allowance_total: r.allowanceTotal, savings_rate: r.savingsRate,
      cal_personal_savings: r.calPersonalSavings, dani_personal_savings: r.daniPersonalSavings,
      remainder: r.remainder, is_shortfall: r.isShortfall, current_easy_access_balance: r.currentEasyAccessBalance,
      easy_access_target: r.easyAccessTarget, to_easy_access: r.toEasyAccess, to_long_term: r.toLongTerm,
    };
    lines.push(FIELDS.map((k) => (k === "year" || k === "month" ? String(row[k]) : cell(row[k]))).join(","));
  }
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="household_budget_export.csv"' },
  });
}
