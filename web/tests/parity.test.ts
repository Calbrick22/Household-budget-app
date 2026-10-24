// Runs thousands of random months through both the TypeScript port and the
// Python original (calculations.py at the repo root) and requires every field
// to match exactly - including Python's half-to-even rounding of x.xx5 ties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { calculateWaterfall, round2, type WaterfallInput } from "../src/lib/calculations.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PY = `
import json, sys, dataclasses
sys.path.insert(0, sys.argv[1])
from calculations import calculate_waterfall
out = []
for c in json.load(sys.stdin):
    try:
        r = calculate_waterfall(c["calIncome"], c["daniIncome"], c["billsTotal"], c["allowancePerPerson"],
            c["savingsRate"], c["easyAccessTarget"], c["currentEasyAccessBalance"],
            cal_personal_bills=c["calPersonalBills"], dani_personal_bills=c["daniPersonalBills"])
        out.append(dataclasses.asdict(r))
    except ValueError as e:
        out.append({"error": str(e)})
print(json.dumps(out))
`;

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// A small deterministic generator, so a failure can be reproduced.
let seed = 20261024;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pennies = (max: number) => Math.round(rand() * max * 100) / 100;
const eighths = (max: number) => Math.round(rand() * max * 8) / 8; // exact .125/.375 ties

function randomCase(i: number): Required<WaterfallInput> {
  const money = i % 3 === 0 ? eighths : pennies;
  const calBills = money(2500), daniBills = money(800), joint = money(3000);
  return {
    calIncome: money(7000), daniIncome: money(4000),
    billsTotal: Math.round((calBills + daniBills + joint) * 100) / 100,
    allowancePerPerson: money(500),
    savingsRate: i % 7 === 0 ? 1 : i % 11 === 0 ? 0 : Math.round(rand() * 1000) / 1000,
    easyAccessTarget: money(8000), currentEasyAccessBalance: money(9000),
    calPersonalBills: calBills, daniPersonalBills: daniBills,
  };
}

test("round2 matches Python's round(x, 2) on ties", () => {
  const cases: [number, number][] = [[0.125, 0.12], [0.375, 0.38], [2.675, 2.67], [1.005, 1], [-0.125, -0.12],
    [-0.375, -0.38], [0.625, 0.62], [1028.5714, 1028.57], [-104.625, -104.62], [2.5, 2.5]];
  for (const [x, want] of cases) assert.equal(round2(x), want, String(x));
});

test("TypeScript port matches calculations.py on 3,000 random months", () => {
  const cases = Array.from({ length: 3000 }, (_, i) => randomCase(i));
  const py = spawnSync("python3", ["-c", PY, repoRoot], { input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(py.status, 0, py.stderr);
  const expected = JSON.parse(py.stdout) as Record<string, number | boolean | string>[];
  let shortfalls = 0;
  cases.forEach((c, i) => {
    const want = expected[i];
    if ("error" in want) { assert.throws(() => calculateWaterfall(c)); return; }
    const got = calculateWaterfall(c) as unknown as Record<string, number | boolean>;
    for (const [k, v] of Object.entries(want)) {
      assert.equal(got[camel(k)], v, `case ${i} field ${k}: ${JSON.stringify(c)}`);
    }
    if (got.isShortfall) shortfalls++;
  });
  assert.ok(shortfalls > 50, "the random months include shortfalls");
});
