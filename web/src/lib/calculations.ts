/**
 * Pure budgeting calculations for the household waterfall model.
 *
 * A line-for-line port of calculations.py (the Streamlit app's maths), kept
 * identical to the penny: every figure is rounded exactly as Python's
 * round(x, 2) rounds it, and tests/parity.test.ts checks thousands of random
 * inputs against the Python original.
 *
 * MODEL ("joint-first" with proportional personal savings):
 * 1. Each person's income minus their own personal (Cal/Dani-tagged) bills is
 *    their "remainder" - paid straight from their own account.
 * 2. Both remainders go into the joint account (the "pot").
 * 3. The pot pays joint-tagged bills.
 * 4. The pot pays each person's allowance (flat, equal amount each).
 * 5. Of what's left, savingsRate goes to joint savings (easy-access first up
 *    to its target, then long-term).
 * 6. Everything remaining is personal savings, split between Cal and Dani in
 *    proportion to what each put into the pot.
 */

export interface WaterfallResult {
  calIncome: number;
  daniIncome: number;
  totalIncome: number;

  billsTotal: number;
  calPersonalBills: number;
  daniPersonalBills: number;
  jointBillsTotal: number;

  calRemainder: number;
  daniRemainder: number;
  pot: number;
  calContributionShare: number;
  daniContributionShare: number;

  allowancePerPerson: number;
  allowanceTotal: number;

  /** The JOINT savings rate, applied after bills and allowances. */
  savingsRate: number;

  /** Pot after joint bills and allowances; negative means a shortfall. */
  remainder: number;
  isShortfall: boolean;

  jointSavings: number;
  personalSavingsTotal: number;
  calPersonalSavings: number;
  daniPersonalSavings: number;

  easyAccessTarget: number;
  currentEasyAccessBalance: number;
  toEasyAccess: number;
  toLongTerm: number;

  /** The single transfer each person makes into the joint account, netted. */
  calToJoint: number;
  daniToJoint: number;
}

export interface WaterfallInput {
  calIncome: number;
  daniIncome: number;
  /** All bills, of every tag. The personal-bill figures are subsets of it. */
  billsTotal: number;
  allowancePerPerson: number;
  savingsRate: number;
  easyAccessTarget: number;
  currentEasyAccessBalance: number;
  calPersonalBills?: number;
  daniPersonalBills?: number;
}

/**
 * Python's round(x, 2) for a float: the exact value of the double rounded to
 * the nearest hundredth, ties to even. A tie at two places can only happen
 * when x is an odd multiple of 1/8 (0.125, 0.375, ...); everything else is
 * rounded correctly by toFixed, which also works from the exact value.
 */
export function round2(x: number): number {
  if (!Number.isFinite(x)) return x;
  const eighths = x * 8;
  if (Number.isInteger(eighths) && Math.abs(eighths) % 2 === 1) {
    const hundredths = x * 100; // exact: an odd multiple of 12.5
    const down = Math.floor(hundredths);
    const even = down % 2 === 0 ? down : down + 1;
    return even / 100 + 0; // + 0 turns -0 into 0, as Python prints it
  }
  return Number(x.toFixed(2)) + 0;
}

export function calculateWaterfall(input: WaterfallInput): WaterfallResult {
  const {
    calIncome, daniIncome, billsTotal, allowancePerPerson, savingsRate,
    easyAccessTarget, currentEasyAccessBalance,
  } = input;
  const calPersonalBills = input.calPersonalBills ?? 0;
  const daniPersonalBills = input.daniPersonalBills ?? 0;

  if (savingsRate < 0 || savingsRate > 1) {
    throw new RangeError("savings_rate must be between 0 and 1 (e.g. 0.30 for 30%)");
  }
  const money: [string, number][] = [
    ["cal_income", calIncome],
    ["dani_income", daniIncome],
    ["bills_total", billsTotal],
    ["allowance_per_person", allowancePerPerson],
    ["easy_access_target", easyAccessTarget],
    ["current_easy_access_balance", currentEasyAccessBalance],
    ["cal_personal_bills", calPersonalBills],
    ["dani_personal_bills", daniPersonalBills],
  ];
  for (const [name, value] of money) {
    if (value < 0) throw new RangeError(`${name} cannot be negative`);
  }

  const totalIncome = calIncome + daniIncome;
  const allowanceTotal = allowancePerPerson * 2;
  const jointBillsTotal = round2(billsTotal - calPersonalBills - daniPersonalBills);

  const calRemainder = Math.max(0, calIncome - calPersonalBills);
  const daniRemainder = Math.max(0, daniIncome - daniPersonalBills);
  const pot = round2(calRemainder + daniRemainder);

  let calContributionShare = 0.5;
  let daniContributionShare = 0.5;
  if (pot > 0) {
    calContributionShare = calRemainder / pot;
    daniContributionShare = daniRemainder / pot;
  }

  const remainder = round2(pot - jointBillsTotal - allowanceTotal);
  const isShortfall = remainder < 0;

  let jointSavings = 0, personalSavingsTotal = 0, calPersonalSavings = 0, daniPersonalSavings = 0;
  let toEasyAccess = 0, toLongTerm = 0;
  if (!isShortfall) {
    jointSavings = round2(remainder * savingsRate);
    personalSavingsTotal = round2(remainder - jointSavings);
    calPersonalSavings = round2(personalSavingsTotal * calContributionShare);
    // Dani gets the rest, so the two always sum exactly to the total.
    daniPersonalSavings = round2(personalSavingsTotal - calPersonalSavings);

    const easyAccessGap = Math.max(0, easyAccessTarget - currentEasyAccessBalance);
    toEasyAccess = round2(Math.min(jointSavings, easyAccessGap));
    toLongTerm = round2(jointSavings - toEasyAccess);
  }

  const calToJoint = round2(calRemainder - allowancePerPerson - calPersonalSavings);
  const daniToJoint = round2(daniRemainder - allowancePerPerson - daniPersonalSavings);

  return {
    calIncome, daniIncome, totalIncome,
    billsTotal, calPersonalBills, daniPersonalBills, jointBillsTotal,
    calRemainder, daniRemainder, pot, calContributionShare, daniContributionShare,
    allowancePerPerson, allowanceTotal, savingsRate, remainder, isShortfall,
    jointSavings, personalSavingsTotal, calPersonalSavings, daniPersonalSavings,
    easyAccessTarget, currentEasyAccessBalance, toEasyAccess, toLongTerm,
    calToJoint, daniToJoint,
  };
}
