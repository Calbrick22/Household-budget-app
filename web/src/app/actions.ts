"use server";
// Every write the app makes. Each action checks the session first, because a
// server action is a public endpoint whether or not a page links to it.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as db from "@/lib/db";
import { endSession, passwordMatches, requireSession, startSession } from "@/lib/session";

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const entered = String(form.get("password") ?? "");
  if (!passwordMatches(entered)) {
    await new Promise((r) => setTimeout(r, 600)); // slows guessing a little
    return { error: "Incorrect password." };
  }
  await startSession();
  redirect("/");
}

export async function lock(): Promise<void> {
  await endSession();
  redirect("/login");
}

const money = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return Math.round(n * 100) / 100;
};

export async function startMonth(form: FormData): Promise<void> {
  await requireSession();
  const year = Number(form.get("year"));
  const month = Number(form.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Choose a month and a year between 2000 and 2100.");
  }
  const id = await db.getOrCreateMonth(year, month);
  redirect(`/month/${id}/edit`);
}

export async function saveMonth(input: db.MonthSave): Promise<{ ok: true }> {
  await requireSession();
  const month = await db.getMonth(Number(input.monthId));
  if (!month) throw new Error("That month no longer exists.");
  await db.saveMonth({
    monthId: month.id,
    bills: input.bills.map((b) => ({ id: b.id ? Number(b.id) : null, name: String(b.name), amount: money(b.amount, "Amount"), tag: String(b.tag) })),
    removedIds: input.removedIds.map(Number),
    carryForwardIds: input.carryForwardIds.map(Number),
    calSalary: money(input.calSalary, "Salary"),
    calRaf: money(input.calRaf, "RAF"),
    daniIncome: money(input.daniIncome, "Income"),
    easyAccessBalance: money(input.easyAccessBalance, "Easy-access balance"),
    finish: Boolean(input.finish) && !month.confirmed,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMonth(form: FormData): Promise<void> {
  await requireSession();
  await db.deleteMonth(Number(form.get("id")));
  revalidatePath("/", "layout");
  redirect("/history?deleted=1");
}

export async function saveSettings(input: db.Settings): Promise<{ ok: true }> {
  await requireSession();
  const rate = Number(input.savingsRate);
  if (!(rate >= 0 && rate <= 1)) throw new Error("The joint savings rate must be between 0% and 100%.");
  const allowance = money(input.allowancePerPerson, "Allowance");
  const target = money(input.easyAccessTarget, "Target");
  if (allowance < 0 || target < 0) throw new Error("Amounts can't be negative.");
  await db.saveSettings({ allowancePerPerson: allowance, savingsRate: rate, easyAccessTarget: target });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveTemplates(rows: { id: number | null; name: string; defaultAmount: number; tag: string }[], removedIds: number[]): Promise<{ ok: true }> {
  await requireSession();
  await db.saveTemplates(
    rows.map((r) => ({ id: r.id ? Number(r.id) : null, name: String(r.name), defaultAmount: money(r.defaultAmount, "Amount"), tag: String(r.tag) })),
    removedIds.map(Number),
  );
  revalidatePath("/", "layout");
  return { ok: true };
}
