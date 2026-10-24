import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "../src/lib/quick-add.ts";

test("name, amount and owner", () => {
  assert.deepEqual(parseQuickAdd("Netflix 10.99 joint"), { name: "Netflix", amount: 10.99, tag: "Joint" });
  assert.deepEqual(parseQuickAdd("  Car Tax (Dani) £17.06 DANI "), { name: "Car Tax (Dani)", amount: 17.06, tag: "Dani" });
  assert.deepEqual(parseQuickAdd("Gym 1,030 cal"), { name: "Gym", amount: 1030, tag: "Cal" });
});

test("the owner defaults to Joint", () => {
  assert.deepEqual(parseQuickAdd("Window cleaner 15"), { name: "Window cleaner", amount: 15, tag: "Joint" });
});

test("lines it can't read", () => {
  for (const bad of ["", "Netflix", "Netflix ten pounds", "10.99", "Gym 30 bob", "Gym 30.999"]) assert.equal(parseQuickAdd(bad), null, bad);
});
