// Money and dates as the app shows them: £1,234.56, a true minus sign, two places.
const gbp = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number): string {
  const text = `£${gbp.format(Math.abs(value))}`;
  return value < 0 && Math.abs(value) >= 0.005 ? `−${text}` : text;
}

/** A share as a percentage to two places: 0.6122449 → "61.22%". */
export const pct = (share: number) => `${(share * 100).toFixed(2)}%`;

/** A rate as a whole percentage: 0.3 → "30%". */
export const ratePct = (rate: number) => `${Math.round(rate * 100)}%`;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTHS[m - 1];
export const monthShort = (m: number) => MONTHS[m - 1].slice(0, 3);
export const monthLabel = (m: { month: number; year: number }) => `${monthName(m.month)} ${m.year}`;
