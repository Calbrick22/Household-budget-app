// Joint bills paid outside the joint account: from Cal's pay before it reaches
// him (a salary-sacrifice car, at its take-home cost) or from either person's
// own account (fuel on a card). The split must be the same as if the joint
// account had paid them; only who moves the money changes, and every account
// has to come out even.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateWaterfall, round2, type WaterfallInput } from "../src/lib/calculations.ts";

const base: WaterfallInput = {
  calIncome: 4000, daniIncome: 2000, billsTotal: 3600, allowancePerPerson: 250, savingsRate: 0.3,
  easyAccessTarget: 5000, currentEasyAccessBalance: 3000, calPersonalBills: 1500, daniPersonalBills: 100,
};

test("a car from Cal's pay and fuel on his card are shared as joint bills", () => {
  // Without the car Cal would take home £4,000; with it, £3,700. Fuel is £150.
  const asIfJoint = calculateWaterfall({ ...base, billsTotal: base.billsTotal + 300 + 150 });
  const r = calculateWaterfall({ ...base, calIncome: 3700, billsTotal: base.billsTotal + 300 + 150, calFromPay: 300, calFromAccount: 150 });

  // The split is exactly what it would be had the joint account paid both...
  for (const k of ["calIncome", "totalIncome", "pot", "calContributionShare", "jointBillsTotal", "remainder", "jointSavings",
    "personalSavingsTotal", "calPersonalSavings", "daniPersonalSavings", "toEasyAccess", "toLongTerm"] as const) {
    assert.equal(r[k], asIfJoint[k], k);
  }
  assert.equal(r.calIncome, 4000);
  assert.equal(r.calTakeHome, 3700);
  // ...but Cal moves £450 less into joint, and the joint account pays £450 less.
  assert.equal(r.calToJoint, round2(asIfJoint.calToJoint - 450));
  assert.equal(r.daniToJoint, asIfJoint.daniToJoint);
  assert.equal(r.jointPaidElsewhere, 450);
  assert.equal(r.jointBillsFromJoint, round2(asIfJoint.jointBillsTotal - 450));
});

test("Dani paying a joint bill from her account comes off her transfer", () => {
  const asIfJoint = calculateWaterfall({ ...base, billsTotal: base.billsTotal + 80 });
  const r = calculateWaterfall({ ...base, billsTotal: base.billsTotal + 80, daniFromAccount: 80 });
  assert.equal(r.daniPersonalSavings, asIfJoint.daniPersonalSavings);
  assert.equal(r.daniToJoint, round2(asIfJoint.daniToJoint - 80));
  assert.equal(r.calToJoint, asIfJoint.calToJoint);
});

test("with nothing paid elsewhere, nothing changes", () => {
  const r = calculateWaterfall(base);
  assert.equal(r.calIncome, r.calTakeHome);
  assert.equal(r.jointPaidElsewhere, 0);
  assert.equal(r.jointBillsFromJoint, r.jointBillsTotal);
});

test("every account comes out even, on 2,000 random months", () => {
  let seed = 20261117;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const p = (max: number) => Math.round(rand() * max * 100) / 100;
  for (let i = 0; i < 2000; i++) {
    const calBills = p(1500), daniBills = p(600), jointOther = p(2500), fromPay = p(400), calCard = p(200), daniCard = p(150);
    const input: WaterfallInput = {
      calIncome: 2500 + p(4000), daniIncome: 1500 + p(2500),
      billsTotal: round2(calBills + daniBills + jointOther + fromPay + calCard + daniCard),
      allowancePerPerson: p(400), savingsRate: Math.round(rand() * 100) / 100,
      easyAccessTarget: p(6000), currentEasyAccessBalance: p(6000),
      calPersonalBills: calBills, daniPersonalBills: daniBills, calFromPay: fromPay, calFromAccount: calCard, daniFromAccount: daniCard,
    };
    const r = calculateWaterfall(input);
    if (r.isShortfall) continue;
    const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.015, `case ${i} ${what}: ${a} vs ${b}`);
    // Cal: take-home in; personal bills, joint bills he pays, allowance, savings and his transfer out.
    near(r.calTakeHome - calBills - calCard - r.allowancePerPerson - r.calPersonalSavings - r.calToJoint, 0, "Cal's account");
    near(input.daniIncome - daniBills - daniCard - r.allowancePerPerson - r.daniPersonalSavings - r.daniToJoint, 0, "Dani's account");
    // Joint: both transfers in; the joint bills it pays and joint savings out.
    near(r.calToJoint + r.daniToJoint - r.jointBillsFromJoint - r.jointSavings, 0, "the joint account");
  }
});

test("paid elsewhere can't be more than the joint bills", () => {
  assert.throws(() => calculateWaterfall({ ...base, calFromPay: 5000 }), /cannot be more than the joint bills/);
});
