// Where a joint bill's money leaves from, when it isn't the joint account.
// Shared by the server (to check what's saved) and the forms (to offer it).
export const PAID_FROM = ["Cal", "Dani", "CalPay"] as const;
export type PaidFrom = (typeof PAID_FROM)[number] | null;

/** The choices as the dropdowns show them; "" is the joint account. */
export const PAID_FROM_OPTIONS: [string, string][] = [
  ["", "Joint account"],
  ["Cal", "Cal's account"],
  ["Dani", "Dani's account"],
  ["CalPay", "Cal's pay (before it hits)"],
];

export const paidFromLabel = (p: PaidFrom) => PAID_FROM_OPTIONS.find(([v]) => v === (p ?? ""))![1];

/** The three totals the maths needs from a set of bills. Only joint bills count. */
export function paidElsewhere(bills: { amount: number; tag: string; paidFrom: PaidFrom }[]) {
  const sum = (who: PaidFrom) => Math.round(bills.filter((b) => b.tag === "Joint" && b.paidFrom === who).reduce((s, b) => s + b.amount, 0) * 100) / 100;
  return { calFromPay: sum("CalPay"), calFromAccount: sum("Cal"), daniFromAccount: sum("Dani") };
}
