// The joint-share model end to end, against the LOCAL test database.
// usage (from web/): npm run build && sh e2e/seed.sh && node --experimental-strip-types e2e/share.mjs [width]
import { execSync } from "node:child_process";
import { calculateShare } from "../src/lib/calculations.ts";
const pw = (await import("/opt/node-tools/node_modules/playwright/index.js")).default;
const q = (sql) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d budget_dev -tAc "${sql}"`).toString().trim();
execSync("sh e2e/seed.sh", { stdio: "pipe" });
const W = Number(process.argv[2] || 1440), PHONE = W < 600, BASE = "http://localhost:3000";
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: PHONE ? 844 : 1000 }, isMobile: PHONE, hasTouch: PHONE });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("dialog", (d) => d.accept());
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  [" + x + "]" : ""}`); };
const money = (v) => `£${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const id = (m) => q(`SELECT id FROM months WHERE year=2026 AND month=${m}`);
const open = async (m) => { await page.goto(`${BASE}/?month=${id(m)}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(900); };
const lanes = () => page.locator(".lanes").innerText();
const working = async () => {
  await page.getByRole("button", { name: /see the maths/ }).click(); await page.waitForTimeout(450);
  const t = await page.getByRole("dialog").innerText(); await page.keyboard.press("Escape"); await page.waitForTimeout(400); return t;
};

await page.goto(BASE + "/login"); await page.getByPlaceholder("Password").fill("dev");
await page.getByRole("button", { name: "Unlock", exact: true }).click(); await page.waitForURL(BASE + "/"); await page.waitForTimeout(800);

// Confirmed months keep the waterfall and its figures
ok("September was frozen as a waterfall month", q(`SELECT coalesce(settings_model,'waterfall') FROM months WHERE id=${id(9)}`) === "waterfall");
await open(9);
let t = await lanes();
ok("September keeps its old transfers (£1,721.43 / £998.57)", t.includes("£1,721.43") && t.includes("£998.57"));
let w = await working();
ok("September's working is the waterfall, with its 30% rate", w.includes("1. Income, less each person's own bills") && w.includes("Joint savings rate") && w.includes("30%"));

// The setting
ok("the joint share setting starts at 45%", q("SELECT value FROM settings WHERE key='joint_share'") === "0.45");
await page.goto(BASE + "/settings"); await page.waitForLoadState("networkidle");
const field = page.getByLabel("Joint share of income (%)");
ok("Settings shows the joint share field at 45", (await field.inputValue()) === "45");
await field.fill("47.5"); await field.blur(); await page.waitForTimeout(200);
const prev = await page.locator(".preview").innerText();
const oct = { calIncome: 4600, daniIncome: 2100, billsTotal: 3600, calPersonalBills: 1500, daniPersonalBills: 100, allowancePerPerson: 250, easyAccessTarget: 5000, currentEasyAccessBalance: 3720 };
const at475 = calculateShare({ ...oct, jointShare: 0.475 });
ok("the preview shows what 47.5% would do to the October draft", prev.includes(money(at475.pot)) && prev.includes(money(at475.jointSavings)), prev.replace(/\n/g, " | "));
await page.getByRole("button", { name: "Save settings" }).click(); await page.getByText("Settings saved.").waitFor();
ok("saving stores 0.475", q("SELECT value FROM settings WHERE key='joint_share'") === "0.475");
await field.fill("45"); await field.blur(); await page.getByRole("button", { name: "Save settings" }).click(); await page.waitForTimeout(800);
ok("and back to 45%", q("SELECT value FROM settings WHERE key='joint_share'") === "0.45");

// The October draft uses the joint share
const r = calculateShare({ ...oct, jointShare: 0.45 });
await open(10);
t = await lanes();
ok("Cal moves 45% of his income into joint", t.includes(money(r.calToJoint)) && t.includes("45% of your income"), money(r.calToJoint));
ok("Dani moves 45% of hers", t.includes(money(r.daniToJoint)), money(r.daniToJoint));
ok("personal savings are what's left after own bills and allowance", t.includes(money(r.calPersonalSavings)) && t.includes(money(r.daniPersonalSavings)) && t.includes("what's left after your bills and allowance"));
ok("joint savings are what's left in joint after the bills", t.includes(money(r.jointSavings)) && t.includes("what's left in joint after the bills"));
const main = await page.locator("main").innerText();
ok("the summary line explains the 45%", main.includes("Each of you puts 45% of your income towards joint costs"));
w = await working();
ok("the working follows the joint share", w.includes("1. 45% of each income towards joint costs") && w.includes("2. Joint bills, then joint savings") && w.includes("3. The rest is your own") && w.includes("Joint share of income"));
ok("both put the same share of income in", Math.abs(r.calJointShare / r.calIncome - r.daniJointShare / r.daniIncome) < 1e-9);

// Too small a share is a joint shortfall; personal savings still happen
q("UPDATE settings SET value='0.25' WHERE key='joint_share'");
await open(10);
const short = calculateShare({ ...oct, jointShare: 0.25 });
t = await page.locator("main").innerText();
ok("25% shows a joint shortfall warning", short.isShortfall && t.includes(`25% of your incomes falls ${money(-short.remainder)} short of the joint bills`));
ok("...while the Saved tile still counts personal savings", (await page.getByRole("button", { name: /see the maths/ }).innerText()).includes(money(short.personalSavingsTotal).split(".")[0]));
q("UPDATE settings SET value='0.45' WHERE key='joint_share'");

// The check-in previews it and finishing freezes it
await page.goto(`${BASE}/?month=${id(10)}&checkin=1`);
const dlg = page.getByRole("dialog", { name: /Check in: October 2026/ }); await dlg.waitFor(); await page.waitForTimeout(400);
await dlg.getByRole("button", { name: "Finish", exact: true }).click(); await page.waitForTimeout(300);
const review = await dlg.innerText();
ok("the check-in review shows the joint share", review.includes("45% of income") && review.includes("Into joint from you both") && review.includes(money(r.pot)));
const hold = dlg.getByRole("button", { name: /Hold to finish/ }); const hb = await hold.boundingBox();
await page.mouse.move(hb.x + 20, hb.y + 10); await page.mouse.down(); await page.waitForTimeout(1150); await page.mouse.up();
await page.waitForURL((u) => !u.href.includes("checkin")); await page.waitForTimeout(1500);
ok("finishing freezes the joint share model at 45%", q(`SELECT confirmed||'/'||settings_model||'/'||settings_joint_share FROM months WHERE id=${id(10)}`) === "true/share/0.45");
q("UPDATE settings SET value='0.5' WHERE key='joint_share'");
await open(10);
ok("a later change to the share doesn't touch a finished month", (await lanes()).includes(money(r.calToJoint)));
q("UPDATE settings SET value='0.45' WHERE key='joint_share'");

// The car from Cal's pay counts towards his share
q(`INSERT INTO months (year, month, confirmed, current_easy_access_balance) VALUES (2026, 12, FALSE, 3000)`);
const dec = id(12);
q(`INSERT INTO income_entries (month_id, person, source, amount) VALUES (${dec},'Cal','Salary',4300), (${dec},'Cal','RAF',0), (${dec},'Dani','Income',3000)`);
q(`INSERT INTO bill_entries (month_id, name, amount, tag, paid_from) VALUES (${dec},'Mortgage',1500,'Joint',NULL), (${dec},'Utilities',300,'Joint',NULL), (${dec},'Council Tax',200,'Joint',NULL), (${dec},'Car',300,'Joint','CalPay'), (${dec},'CMS',1300,'Cal',NULL), (${dec},'Mobile Phone (Dani)',100,'Dani',NULL)`);
const d = calculateShare({ calIncome: 4300, daniIncome: 3000, billsTotal: 3700, calPersonalBills: 1300, daniPersonalBills: 100, jointShare: 0.45,
  allowancePerPerson: 250, easyAccessTarget: 5000, currentEasyAccessBalance: 3000, calFromPay: 300 });
await open(12);
t = await lanes();
ok("December: 45% of £4,600 (take-home + car), less the car", d.calJointShare === 2070 && t.includes(money(d.calToJoint)) && t.includes("less the £300.00 of joint bills you pay"), money(d.calToJoint));
ok("December: Dani 45% of £3,000", t.includes(money(d.daniToJoint)));
const cal = 4300 - 1300 - 250 - d.calPersonalSavings - d.calToJoint;
const joint = d.calToJoint + d.daniToJoint - d.jointBillsFromJoint - d.jointSavings;
ok("every account comes out even", Math.abs(cal) < 0.011 && Math.abs(joint) < 0.011, `${cal.toFixed(2)} / ${joint.toFixed(2)}`);

// The CSV says which model each month used
const csv = await (await page.request.get(BASE + "/history/export")).text();
const rows = csv.trim().split(/\r?\n/).map((l) => l.split(",")), head = rows[0];
const modelOf = (m) => rows.find((x) => x[0] === "2026" && x[1] === String(m))[head.indexOf("model")];
ok("the CSV marks September waterfall and October share", modelOf(9) === "waterfall" && modelOf(10) === "share");

// Every screen still loads cleanly
for (const path of ["/history", "/trends", "/settings", `/?month=${id(7)}`, `/?month=${id(8)}`]) {
  await page.goto(BASE + path); await page.waitForLoadState("networkidle");
  ok(`${path} loads`, (await page.locator("main h1").count()) > 0 && !(await page.locator("main").innerText()).includes("Couldn't load"));
}
console.log(`\n${fails} failed; page errors: ${errs.length} ${errs.join(" | ")}`);
await b.close();
process.exit(fails || errs.length ? 1 : 0);
