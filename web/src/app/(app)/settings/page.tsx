import * as db from "@/lib/db";
import { monthLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { Suspense } from "react";
import { SettingsForm } from "@/components/settings-forms";
import { BillsBoard, type BillPoint } from "@/components/bills-board";
import { monthShort } from "@/lib/format";
import { Toast } from "@/components/month-controls";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSession();
  const [settings, templates, all, billHistory, oneOffs] = await Promise.all([
    db.getSettings(), db.getActiveTemplates(), db.getAllFinancials(), db.getBillHistory(), db.getRecentOneOffs(),
  ]);
  const history: Record<number, BillPoint[]> = {};
  for (const h of billHistory) (history[h.templateId] ??= []).push({ label: `${monthShort(h.month)} ’${String(h.year).slice(2)}`, amount: h.amount });
  const latest = all[all.length - 1];
  const preview = latest ? {
    label: monthLabel(latest.month), confirmed: latest.month.confirmed,
    calIncome: latest.calIncome, daniIncome: latest.daniIncome, billsTotal: latest.billsTotal,
    calBills: latest.calBills, daniBills: latest.daniBills, easyAccessBalance: latest.month.easyAccessBalance,
    calFromPay: latest.calFromPay, calFromAccount: latest.calFromAccount, daniFromAccount: latest.daniFromAccount,
  } : null;

  return (
    <>
      <Suspense><Toast /></Suspense>
      <h1>Settings</h1>
      <p className="subtitle">How each month is split, and the bills every new month starts with.</p>

      <div className="settings-row section-gap">
        <div className="settings-label">
          <h2>How each month is split</h2>
          <p>Each of you puts the <b>joint share</b> of your income towards joint costs first. The joint account pays the joint bills, and whatever is left there becomes joint savings. The rest of your income is yours: your own bills, then the allowance, then personal savings.</p>
          <p>Joint bills you pay yourself (the car from Cal&apos;s pay, say) count towards your share, so you move that much less into joint.</p>
          <p>Changes apply to drafts and to every month you finish from now on. Confirmed months keep the settings, and the way of splitting, they were confirmed with.</p>
        </div>
        <SettingsForm key={JSON.stringify(settings)} settings={settings} preview={preview} />
      </div>

      <div className="settings-block">
        <div className="settings-label">
          <h2>Recurring bills</h2>
          <p>The bills every new month starts with, by whose they are. Change an amount here the moment it changes (the water bill going up, say) and it carries forward from then on. Removing one only stops it appearing in future months.</p>
          <p>Tick <b>Varies regularly</b> on a bill that&apos;s different every month, like a credit card, and the month check-in asks about it first.</p>
        </div>
        <BillsBoard key={templates.map((t) => `${t.id}:${t.defaultAmount}:${t.tag}:${t.name}:${t.varies}`).join("|")}
          templates={templates} history={history} oneOffs={oneOffs} />
      </div>
    </>
  );
}
