import * as db from "@/lib/db";
import { monthLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { Suspense } from "react";
import { RecurringBills, SettingsForm } from "@/components/settings-forms";
import { Toast } from "@/components/month-controls";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSession();
  const [settings, templates, all] = await Promise.all([db.getSettings(), db.getActiveTemplates(), db.getAllFinancials()]);
  const latest = all[all.length - 1];
  const preview = latest ? {
    label: monthLabel(latest.month), confirmed: latest.month.confirmed,
    calIncome: latest.calIncome, daniIncome: latest.daniIncome, billsTotal: latest.billsTotal,
    calBills: latest.calBills, daniBills: latest.daniBills, easyAccessBalance: latest.month.easyAccessBalance,
  } : null;

  return (
    <>
      <Suspense><Toast /></Suspense>
      <h1>Settings</h1>
      <p className="subtitle">How each month is split, and the bills every new month starts with.</p>

      <div className="settings-row section-gap">
        <div className="settings-label">
          <h2>How each month is split</h2>
          <p>The allowance goes to each of you every month. The joint savings rate is the share of what&apos;s left (after bills and allowances) that goes to joint savings - everything else becomes personal savings, split between Cal and Dani by how much each of you contributed.</p>
          <p>Changes apply to drafts and to every month you finish from now on. Confirmed months keep the settings they were confirmed with.</p>
        </div>
        <SettingsForm key={JSON.stringify(settings)} settings={settings} preview={preview} />
      </div>

      <div className="settings-row">
        <div className="settings-label">
          <h2>Recurring bills</h2>
          <p>The list new months are built from. Update an amount here the moment it changes (the water bill going up, say) and it carries forward from then on.</p>
          <p>Removing a bill here only stops it appearing in future months - it won&apos;t touch any month you&apos;ve already created.</p>
        </div>
        <RecurringBills key={templates.map((t) => `${t.id}:${t.defaultAmount}:${t.tag}:${t.name}`).join("|")} templates={templates} />
      </div>
    </>
  );
}
