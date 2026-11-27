// The main journeys through the app, against the LOCAL test database.
// usage (from web/): npm run build && node --experimental-strip-types e2e/flows.mjs [width]
import { execSync } from "node:child_process";
const pw = (await import("/opt/node-tools/node_modules/playwright/index.js")).default;
const q = (sql) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d budget_dev -tAc "${sql}"`).toString().trim();
execSync("sh e2e/seed.sh", { stdio: "pipe" });
const W = Number(process.argv[2] || 1440), PHONE = W < 600, BASE = "http://localhost:3000";
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: PHONE ? 844 : 1000 }, isMobile: PHONE, hasTouch: PHONE });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("dialog", (d) => d.accept());
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  [" + x + "]" : ""}`); };
const settle = async () => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(400); };
const nav = async (label) => { await page.locator(PHONE ? "nav.tabbar" : "nav.nav").getByRole("link", { name: PHONE && label === "This month" ? "Month" : label }).click(); await settle(); };
const h1 = () => page.locator("main h1").innerText();

let r = await page.request.get(BASE + "/history/export", { maxRedirects: 0 });
ok("CSV refuses without a session", r.status() === 401);
await page.goto(BASE + "/login"); await page.getByPlaceholder("Password").fill("wrong"); await page.getByRole("button", { name: "Unlock", exact: true }).click();
ok("a wrong password is refused", await page.getByText("Incorrect password.").waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.getByPlaceholder("Password").fill("dev"); await page.getByRole("button", { name: "Unlock", exact: true }).click(); await page.waitForURL(BASE + "/"); await settle();
ok("opens on the latest confirmed month", (await h1()) === "September 2026");

// The month strip, a card's own view, the tiles
const strip = page.getByRole("navigation", { name: "Months" });
await strip.getByRole("link", { name: /^July 2026/ }).click(); await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "July 2026"); await settle();
ok("the strip switches month, and July's shortfall shows", (await page.locator("main").innerText()).includes("income doesn't cover bills and allowances by £1,100.00"));
await strip.getByRole("link", { name: /^September 2026/ }).click(); await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "September 2026"); await settle();
await page.getByRole("button", { name: "Open Cal's account" }).click(); await page.waitForTimeout(600);
ok("Cal's card opens into his month", (await page.getByRole("dialog", { name: "Cal's month" }).innerText()).includes("Transfers to make"));
await page.keyboard.press("Escape"); await page.waitForTimeout(500);
for (const [name, text] of [[/Easy-access pot/, "Balance at the start of each month"], [/Changes since August/, "Personal savings"], [/see the maths/, "Settings used"]]) {
  await page.getByRole("button", { name }).click(); await page.waitForTimeout(450);
  ok(`the ${String(name)} tile opens its panel`, (await page.getByRole("dialog").innerText()).includes(text));
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
}

// A check-in saved as a draft
await strip.getByRole("link", { name: /^October 2026/ }).click(); await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "October 2026"); await settle();
await page.getByRole("link", { name: "Check in", exact: true }).click();
const dlg = page.getByRole("dialog", { name: /Check in: October 2026/ }); await dlg.waitFor(); await page.waitForTimeout(400);
const sal = page.getByLabel("Salary, take-home (£)"); await sal.fill("4100"); await sal.blur();
await dlg.getByRole("button", { name: "Bills", exact: true }).click();
await dlg.getByRole("button", { name: /same as usual/ }).click();
await page.getByLabel("Remove Council Tax").click();
await dlg.getByRole("button", { name: "Finish", exact: true }).click();
await dlg.getByRole("button", { name: "Save draft" }).click(); await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor(); await settle();
const oct = q("SELECT id FROM months WHERE month=10");
ok("Save draft saves income and the removal", q(`SELECT amount::numeric(10,2) FROM income_entries WHERE month_id=${oct} AND source='Salary'`) === "4100.00"
  && q(`SELECT count(*) FROM bill_entries WHERE month_id=${oct} AND name='Council Tax'`) === "0");

// The bills board
await nav("Settings");
await page.getByLabel("Add a recurring bill").fill("Fuel 150 joint"); await page.getByRole("button", { name: "Add", exact: true }).click();
await page.getByLabel("Where Fuel is paid from").selectOption({ label: "Cal's account" });
await page.locator(".bill-card", { has: page.getByLabel("Usual monthly amount for Utilities") }).getByRole("checkbox", { name: /Varies regularly/ }).check();
await page.getByRole("button", { name: "Save recurring bills" }).click(); await page.getByText("Recurring bills saved.").waitFor();
ok("the board saves a new bill, where it's paid from and Varies regularly",
  q("SELECT coalesce(paid_from,'-') FROM bill_templates WHERE name='Fuel'") === "Cal" && q("SELECT varies FROM bill_templates WHERE name='Utilities'") === "t");

// History: CSV, delete, add a month
await nav("History");
r = await page.request.get(BASE + "/history/export");
ok("CSV export", r.status() === 200 && (await r.text()).startsWith("year,month,confirmed"));
await page.getByRole("button", { name: "Delete June 2026" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Yes, delete" }).click(); await page.waitForURL(/deleted=1/); await settle();
ok("Delete removes the month", q("SELECT count(*) FROM months WHERE month=6") === "0");
await page.locator("summary", { hasText: "Add a month" }).click();
await page.getByLabel("Month", { exact: true }).selectOption({ label: "May" }); await page.getByLabel("Year").fill("2026");
await page.getByRole("button", { name: "Open month" }).click(); await page.waitForURL(/checkin=1/);
ok("Add a month opens its check-in", await page.getByRole("dialog", { name: /Check in: May 2026/ }).waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.getByRole("dialog").getByRole("button", { name: "Close" }).click(); await settle();
await nav("Trends");
ok("Trends loads", (await page.locator("main").innerText()).includes("Each month at a glance"));

await page.getByRole("button", { name: "Lock" }).first().click(); await page.waitForURL(/\/login/);
ok("Lock returns to the password screen", await page.getByPlaceholder("Password").count() === 1);
console.log(`\n${fails} failed; page errors: ${errs.length} ${errs.join(" | ")}`);
await b.close();
process.exit(fails || errs.length ? 1 : 0);
