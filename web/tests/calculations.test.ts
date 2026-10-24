// The ten tests from tests/test_calculations.py, ported one for one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateWaterfall, round2, type WaterfallInput } from "../src/lib/calculations.ts";

function workedExample(overrides: Partial<WaterfallInput> = {}) {
  return calculateWaterfall({
    calIncome: 4500, daniIncome: 2000, billsTotal: 3600, allowancePerPerson: 250,
    savingsRate: 0.3, easyAccessTarget: 5000, currentEasyAccessBalance: 0,
    calPersonalBills: 1500, daniPersonalBills: 100, ...overrides,
  });
}

test("worked example", () => {
  const r = workedExample();
  assert.equal(r.calRemainder, 3000);
  assert.equal(r.daniRemainder, 1900);
  assert.equal(r.pot, 4900);
  assert.equal(r.jointBillsTotal, 2000);
  assert.equal(r.allowanceTotal, 500);
  assert.equal(r.remainder, 2400);
  assert.equal(r.jointSavings, 720);
  assert.equal(r.personalSavingsTotal, 1680);
  assert.equal(round2(r.calContributionShare * 100), 61.22);
  assert.equal(round2(r.daniContributionShare * 100), 38.78);
  assert.equal(r.calPersonalSavings, 1028.57);
  assert.equal(r.daniPersonalSavings, 651.43);
  assert.equal(r.isShortfall, false);
});

test("personal savings sum exactly to the total", () => {
  const r = workedExample({ calIncome: 3333.33, daniIncome: 1111.11, billsTotal: 2100 });
  assert.ok(Math.abs(r.calPersonalSavings + r.daniPersonalSavings - r.personalSavingsTotal) < 1e-9);
});

test("total savings are independent of the rate", () => {
  const totals = new Set<number>();
  for (const rate of [0, 0.15, 0.3, 0.35, 0.4, 1]) {
    const r = workedExample({ savingsRate: rate });
    totals.add(round2(r.jointSavings + r.personalSavingsTotal));
  }
  assert.deepEqual([...totals], [2400]);
});

test("transfer netting reconciles", () => {
  const r = workedExample();
  assert.ok(Math.abs(r.calToJoint + r.daniToJoint - (r.jointBillsTotal + r.jointSavings)) < 0.005);
  assert.equal(r.calToJoint, 1721.43);
  assert.equal(r.daniToJoint, 998.57);
});

test("a shortfall zeroes savings but keeps allowances", () => {
  const r = workedExample({ calIncome: 2500, daniIncome: 500 });
  assert.equal(r.isShortfall, true);
  assert.equal(r.remainder, -1100);
  assert.equal(r.allowanceTotal, 500);
  for (const k of ["jointSavings", "personalSavingsTotal", "calPersonalSavings", "daniPersonalSavings", "toEasyAccess", "toLongTerm"] as const) {
    assert.equal(r[k], 0, k);
  }
});

test("personal bills default to zero", () => {
  const r = calculateWaterfall({
    calIncome: 3000, daniIncome: 1000, billsTotal: 1500, allowancePerPerson: 250,
    savingsRate: 0.3, easyAccessTarget: 5000, currentEasyAccessBalance: 0,
  });
  assert.equal(r.calPersonalBills, 0);
  assert.equal(r.daniPersonalBills, 0);
  assert.equal(r.jointBillsTotal, 1500);
  assert.equal(r.pot, 4000);
  assert.equal(r.calContributionShare, 0.75);
});

test("a remainder floors at zero when personal bills exceed income", () => {
  const r = workedExample({ daniIncome: 50 });
  assert.equal(r.daniRemainder, 0);
  assert.equal(r.calContributionShare, 1);
  assert.equal(r.daniPersonalSavings, 0);
});

test("rejects a rate outside 0 to 1", () => {
  assert.throws(() => workedExample({ savingsRate: 30 }), RangeError);
  assert.throws(() => workedExample({ savingsRate: -0.1 }), RangeError);
});

test("rejects negative money", () => {
  assert.throws(() => workedExample({ calIncome: -1 }), RangeError);
  assert.throws(() => workedExample({ daniPersonalBills: -5 }), RangeError);
});

test("easy-access target already met sends everything to long-term", () => {
  const r = workedExample({ currentEasyAccessBalance: 6000 });
  assert.equal(r.toEasyAccess, 0);
  assert.equal(r.toLongTerm, 720);
  const partly = workedExample({ currentEasyAccessBalance: 4800 });
  assert.equal(partly.toEasyAccess, 200);
  assert.equal(partly.toLongTerm, 520);
});
