// The joint-share model: the same share of each income to joint costs first,
// joint savings from what's left in joint, and the rest is each person's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateShare, round2, type ShareInput } from "../src/lib/calculations.ts";

// Cal takes home £4,300 after a £300 car from his pay; Dani £3,000; 45%.
const month: ShareInput = {
  calIncome: 4300, daniIncome: 3000, jointShare: 0.45,
  billsTotal: 1500 + 100 + 2500 + 300, calPersonalBills: 1500, daniPersonalBills: 100,
  allowancePerPerson: 250, easyAccessTarget: 5000, currentEasyAccessBalance: 4800, calFromPay: 300,
};

test("each puts the same share of income towards joint costs", () => {
  const r = calculateShare(month);
  assert.equal(r.model, "share");
  assert.equal(r.calIncome, 4600); // take-home plus the car he's paid
  assert.equal(r.calJointShare, 2070);
  assert.equal(r.daniJointShare, 1350);
  assert.equal(r.pot, 3420);
  assert.equal(r.calJointShare / r.calIncome, r.daniJointShare / r.daniIncome);
  // The car counts towards his share: he transfers £300 less.
  assert.equal(r.calToJoint, 1770);
  assert.equal(r.daniToJoint, 1350);
});

test("joint savings is what's left in joint after the bills, easy-access first", () => {
  const r = calculateShare(month);
  assert.equal(r.jointBillsTotal, 2800);
  assert.equal(r.jointSavings, 620);
  assert.equal(r.toEasyAccess, 200);
  assert.equal(r.toLongTerm, 420);
  assert.equal(r.isShortfall, false);
});

test("the rest is each person's: own bills, allowance, then personal savings", () => {
  const r = calculateShare(month);
  assert.equal(r.calRest, 1030);   // 4,600 − 2,070 − 1,500
  assert.equal(r.daniRest, 1550);  // 3,000 − 1,350 − 100
  assert.equal(r.calPersonalSavings, 780);
  assert.equal(r.daniPersonalSavings, 1300);
  assert.equal(r.personalSavingsTotal, 2080);
});

test("a share too small for the bills is a shortfall: no joint savings, nothing adjusted", () => {
  const r = calculateShare({ ...month, jointShare: 0.35 });
  assert.equal(r.isShortfall, true);
  assert.equal(r.remainder, round2(0.35 * 4600 + 0.35 * 3000 - 2800));
  assert.equal(r.jointSavings, 0);
  assert.equal(r.calToJoint, round2(0.35 * 4600 - 300));
});

test("own bills and allowance more than the rest: no personal savings", () => {
  const r = calculateShare({ ...month, calPersonalBills: 2400, billsTotal: 2400 + 100 + 2500 + 300 });
  assert.equal(r.calRest, 130);
  assert.equal(r.calPersonalSavings, 0);
});

test("every account comes out even, on 2,000 random months", () => {
  let seed = 20261127;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const p = (max: number) => Math.round(rand() * max * 100) / 100;
  for (let i = 0; i < 2000; i++) {
    const calBills = p(1200), daniBills = p(500), fromPay = p(400), calCard = p(200), daniCard = p(150), jointOther = p(2500);
    const input: ShareInput = {
      calIncome: 3000 + p(3000), daniIncome: 2000 + p(2500), jointShare: Math.round((0.3 + rand() * 0.3) * 100) / 100,
      billsTotal: round2(calBills + daniBills + jointOther + fromPay + calCard + daniCard), calPersonalBills: calBills, daniPersonalBills: daniBills,
      allowancePerPerson: p(300), easyAccessTarget: p(6000), currentEasyAccessBalance: p(6000),
      calFromPay: fromPay, calFromAccount: calCard, daniFromAccount: daniCard,
    };
    const r = calculateShare(input);
    if (r.isShortfall || r.calRest < r.allowancePerPerson || r.daniRest < r.allowancePerPerson) continue;
    const near = (a: number, what: string) => assert.ok(Math.abs(a) < 0.015, `case ${i} ${what}: ${a}`);
    near(r.calTakeHome - calBills - calCard - r.allowancePerPerson - r.calPersonalSavings - r.calToJoint, "Cal's account");
    near(input.daniIncome - daniBills - daniCard - r.allowancePerPerson - r.daniPersonalSavings - r.daniToJoint, "Dani's account");
    near(r.calToJoint + r.daniToJoint - r.jointBillsFromJoint - r.jointSavings, "the joint account");
    near(r.toEasyAccess + r.toLongTerm - r.jointSavings, "the pots");
  }
});

test("bad inputs are refused", () => {
  assert.throws(() => calculateShare({ ...month, jointShare: 1.2 }), /between 0% and 100%/);
  assert.throws(() => calculateShare({ ...month, calFromPay: 9000 }), /cannot be more than the joint bills/);
});
