// Turns a month's stored figures into the waterfall, with the right settings.
import { calculateWaterfall, type WaterfallResult } from "./calculations";
import type { Financials, Month, Settings } from "./db";

/** A confirmed month keeps the settings it was confirmed with; a draft
 *  follows the live settings until it is finished. */
export function settingsFor(fin: Financials, live: Settings): Settings {
  return fin.frozenSettings ?? live;
}

export function calculateMonth(fin: Financials, live: Settings): WaterfallResult {
  const s = settingsFor(fin, live);
  return calculateWaterfall({
    calIncome: fin.calIncome, daniIncome: fin.daniIncome, billsTotal: fin.billsTotal,
    allowancePerPerson: s.allowancePerPerson, savingsRate: s.savingsRate,
    easyAccessTarget: s.easyAccessTarget, currentEasyAccessBalance: fin.month.easyAccessBalance,
    calPersonalBills: fin.calBills, daniPersonalBills: fin.daniBills,
  });
}

export const totalSaved = (r: WaterfallResult) => r.jointSavings + r.personalSavingsTotal;

/** (all savings, personal savings) as a percentage of income. */
export function savingsRates(r: WaterfallResult): [number, number] {
  if (r.totalIncome <= 0) return [0, 0];
  return [(r.personalSavingsTotal + r.toEasyAccess + r.toLongTerm) / r.totalIncome * 100, r.personalSavingsTotal / r.totalIncome * 100];
}

/** The month after the latest one, or this month when there are none. */
export function nextMonthAfter(months: Month[]): { year: number; month: number } {
  const last = months[months.length - 1];
  if (!last) { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  return last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 };
}

export function previousConfirmed(months: Month[], month: Month): Month | null {
  const earlier = months.filter((m) => m.confirmed && (m.year < month.year || (m.year === month.year && m.month < month.month)));
  return earlier[earlier.length - 1] ?? null;
}
