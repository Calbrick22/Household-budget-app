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
 *
 * JOINT BILLS PAID OUTSIDE THE JOINT ACCOUNT (this app only; the Python model
 * stops at step 6, and with none of these the two agree to the penny):
 * - Paid from Cal's or Dani's own account (fuel on Cal's card, say): still a
 *   joint bill, shared like any other, but that person pays it, so their
 *   transfer into joint is smaller by the same amount and it stays in their
 *   account to cover it.
 * - Paid from Cal's pay before it reaches him (a salary-sacrifice car): his
 *   take-home is already lower by that much, so it is added back to his income
 *   for the split - he's credited with paying it - and his transfer into joint
 *   is smaller by the same amount, because that money never reached him. The
 *   amount is the drop in take-home, not the gross sacrifice.
 */

export interface WaterfallResult {
  /** Which model produced it: "waterfall" (months confirmed before the
   *  joint-share model) or "share" (see calculateShare). */
  model: "waterfall" | "share";
  /** Cal's income for the split: his take-home plus anything paid from his pay. */
  calIncome: number;
  /** What actually reached Cal's account. */
  calTakeHome: number;
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

  /** Joint bills paid outside the joint account (all included in jointBillsTotal). */
  calFromPay: number;
  calFromAccount: number;
  daniFromAccount: number;
  jointPaidElsewhere: number;
  /** The joint bills the joint account itself pays. */
  jointBillsFromJoint: number;

  /** The single transfer each person makes into the joint account, netted. */
  calToJoint: number;
  daniToJoint: number;

  /** The share of income each person puts towards joint costs (0 on the waterfall). */
  jointShare: number;
  /** What each person puts towards joint costs, including joint bills they pay directly. */
  calJointShare: number;
  daniJointShare: number;
  /** What each person has after their joint share and own bills: allowance plus personal savings. */
  calRest: number;
  daniRest: number;
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
  /** Joint bills taken from Cal's pay before it reaches him (calIncome is his take-home). */
  calFromPay?: number;
  /** Joint bills paid from Cal's or Dani's own account. */
  calFromAccount?: number;
  daniFromAccount?: number;
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
    daniIncome, billsTotal, allowancePerPerson, savingsRate,
    easyAccessTarget, currentEasyAccessBalance,
  } = input;
  const calTakeHome = input.calIncome;
  const calPersonalBills = input.calPersonalBills ?? 0;
  const daniPersonalBills = input.daniPersonalBills ?? 0;
  const calFromPay = input.calFromPay ?? 0;
  const calFromAccount = input.calFromAccount ?? 0;
  const daniFromAccount = input.daniFromAccount ?? 0;

  if (savingsRate < 0 || savingsRate > 1) {
    throw new RangeError("savings_rate must be between 0 and 1 (e.g. 0.30 for 30%)");
  }
  const money: [string, number][] = [
    ["cal_income", calTakeHome],
    ["dani_income", daniIncome],
    ["bills_total", billsTotal],
    ["allowance_per_person", allowancePerPerson],
    ["easy_access_target", easyAccessTarget],
    ["current_easy_access_balance", currentEasyAccessBalance],
    ["cal_personal_bills", calPersonalBills],
    ["dani_personal_bills", daniPersonalBills],
    ["cal_from_pay", calFromPay],
    ["cal_from_account", calFromAccount],
    ["dani_from_account", daniFromAccount],
  ];
  for (const [name, value] of money) {
    if (value < 0) throw new RangeError(`${name} cannot be negative`);
  }

  // With nothing taken from his pay this is his take-home exactly, as in the Python model.
  const calIncome = calFromPay ? round2(calTakeHome + calFromPay) : calTakeHome;
  const totalIncome = calIncome + daniIncome;
  const allowanceTotal = allowancePerPerson * 2;
  const jointBillsTotal = round2(billsTotal - calPersonalBills - daniPersonalBills);
  const jointPaidElsewhere = round2(calFromPay + calFromAccount + daniFromAccount);
  if (jointPaidElsewhere > jointBillsTotal + 0.005) {
    throw new RangeError("joint bills paid outside the joint account cannot be more than the joint bills");
  }
  const jointBillsFromJoint = round2(jointBillsTotal - jointPaidElsewhere);

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

  // Whatever someone has already paid towards joint bills comes off their transfer.
  const calToJoint = round2(calRemainder - allowancePerPerson - calPersonalSavings - calFromPay - calFromAccount);
  const daniToJoint = round2(daniRemainder - allowancePerPerson - daniPersonalSavings - daniFromAccount);

  return {
    model: "waterfall",
    jointShare: 0,
    calJointShare: round2(calToJoint + calFromPay + calFromAccount),
    daniJointShare: round2(daniToJoint + daniFromAccount),
    calRest: round2(calIncome - calPersonalBills - (calToJoint + calFromPay + calFromAccount)),
    daniRest: round2(daniIncome - daniPersonalBills - (daniToJoint + daniFromAccount)),
    calIncome, calTakeHome, daniIncome, totalIncome,
    billsTotal, calPersonalBills, daniPersonalBills, jointBillsTotal,
    calRemainder, daniRemainder, pot, calContributionShare, daniContributionShare,
    allowancePerPerson, allowanceTotal, savingsRate, remainder, isShortfall,
    jointSavings, personalSavingsTotal, calPersonalSavings, daniPersonalSavings,
    easyAccessTarget, currentEasyAccessBalance, toEasyAccess, toLongTerm,
    calFromPay, calFromAccount, daniFromAccount, jointPaidElsewhere, jointBillsFromJoint,
    calToJoint, daniToJoint,
  };
}

export interface ShareInput {
  calIncome: number; // Cal's take-home
  daniIncome: number;
  billsTotal: number;
  calPersonalBills: number;
  daniPersonalBills: number;
  /** The share of each person's income that goes to joint costs (0.45 for 45%). */
  jointShare: number;
  allowancePerPerson: number;
  easyAccessTarget: number;
  currentEasyAccessBalance: number;
  calFromPay?: number;
  calFromAccount?: number;
  daniFromAccount?: number;
}

/**
 * The joint-share model (from December 2026):
 * 1. Each person puts the same share of their income towards joint costs.
 *    Cal's income here is his take-home plus anything taken from his pay for
 *    joint bills (the car), since he has paid that.
 * 2. The joint account pays the joint bills; whatever is left is joint savings
 *    (easy-access first up to its target, then long-term). If the bills are
 *    more than the joint money, that is a shortfall: nothing is adjusted.
 * 3. The rest of each person's income is theirs: their own bills, then the
 *    allowance, then personal savings.
 * Joint bills paid outside the joint account count towards the payer's share,
 * so their transfer into joint is that much smaller, exactly as before.
 */
export function calculateShare(input: ShareInput): WaterfallResult {
  const { daniIncome, billsTotal, jointShare, allowancePerPerson, easyAccessTarget, currentEasyAccessBalance } = input;
  const calTakeHome = input.calIncome;
  const calPersonalBills = input.calPersonalBills, daniPersonalBills = input.daniPersonalBills;
  const calFromPay = input.calFromPay ?? 0, calFromAccount = input.calFromAccount ?? 0, daniFromAccount = input.daniFromAccount ?? 0;

  if (jointShare < 0 || jointShare > 1) throw new RangeError("the joint share must be between 0% and 100%");
  const money: [string, number][] = [
    ["cal_income", calTakeHome], ["dani_income", daniIncome], ["bills_total", billsTotal],
    ["allowance_per_person", allowancePerPerson], ["easy_access_target", easyAccessTarget],
    ["current_easy_access_balance", currentEasyAccessBalance], ["cal_personal_bills", calPersonalBills],
    ["dani_personal_bills", daniPersonalBills], ["cal_from_pay", calFromPay], ["cal_from_account", calFromAccount],
    ["dani_from_account", daniFromAccount],
  ];
  for (const [name, value] of money) if (value < 0) throw new RangeError(`${name} cannot be negative`);

  const calIncome = round2(calTakeHome + calFromPay);
  const totalIncome = round2(calIncome + daniIncome);
  const jointBillsTotal = round2(billsTotal - calPersonalBills - daniPersonalBills);
  const jointPaidElsewhere = round2(calFromPay + calFromAccount + daniFromAccount);
  if (jointPaidElsewhere > jointBillsTotal + 0.005) {
    throw new RangeError("joint bills paid outside the joint account cannot be more than the joint bills");
  }
  const jointBillsFromJoint = round2(jointBillsTotal - jointPaidElsewhere);

  // 1. The same share of each income to joint costs.
  const calJointShare = round2(calIncome * jointShare);
  const daniJointShare = round2(daniIncome * jointShare);
  const pot = round2(calJointShare + daniJointShare);
  const calContributionShare = pot > 0 ? calJointShare / pot : 0.5;
  const daniContributionShare = pot > 0 ? daniJointShare / pot : 0.5;

  // 2. Joint bills, then joint savings from what's left.
  const remainder = round2(pot - jointBillsTotal);
  const isShortfall = remainder < 0;
  const jointSavings = isShortfall ? 0 : remainder;
  const easyAccessGap = Math.max(0, easyAccessTarget - currentEasyAccessBalance);
  const toEasyAccess = round2(Math.min(jointSavings, easyAccessGap));
  const toLongTerm = round2(jointSavings - toEasyAccess);

  // 3. The rest is each person's: own bills, the allowance, then personal savings.
  const calRest = round2(calIncome - calJointShare - calPersonalBills);
  const daniRest = round2(daniIncome - daniJointShare - daniPersonalBills);
  const calPersonalSavings = Math.max(0, round2(calRest - allowancePerPerson));
  const daniPersonalSavings = Math.max(0, round2(daniRest - allowancePerPerson));

  const calToJoint = round2(calJointShare - calFromPay - calFromAccount);
  const daniToJoint = round2(daniJointShare - daniFromAccount);

  return {
    model: "share", jointShare, calJointShare, daniJointShare, calRest, daniRest,
    calIncome, calTakeHome, daniIncome, totalIncome,
    billsTotal, calPersonalBills, daniPersonalBills, jointBillsTotal,
    calRemainder: round2(calIncome - calPersonalBills), daniRemainder: round2(daniIncome - daniPersonalBills),
    pot, calContributionShare, daniContributionShare,
    allowancePerPerson, allowanceTotal: allowancePerPerson * 2,
    savingsRate: 1, remainder, isShortfall,
    jointSavings, personalSavingsTotal: round2(calPersonalSavings + daniPersonalSavings), calPersonalSavings, daniPersonalSavings,
    easyAccessTarget, currentEasyAccessBalance, toEasyAccess, toLongTerm,
    calFromPay, calFromAccount, daniFromAccount, jointPaidElsewhere, jointBillsFromJoint,
    calToJoint, daniToJoint,
  };
}
