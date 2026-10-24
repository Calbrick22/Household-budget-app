import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SideNav, TabBar } from "@/components/nav";
import { IconLock } from "@/components/icons";
import { lock } from "../actions";

export const dynamic = "force-dynamic";

function Brand() {
  return (
    <Link href="/" className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-icon.png" alt="" width={36} height={36} />
      <span><b>Household Budget</b><span>Cal &amp; Dani</span></span>
    </Link>
  );
}

function LockButton() {
  return (
    <form action={lock}>
      <button className="btn ghost" type="submit" title="Ask for the password again on this device"><IconLock />Lock</button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Brand />
        <SideNav />
        <div className="foot"><LockButton /></div>
      </aside>
      <div>
        <header className="topbar"><Brand /><LockButton /></header>
        <main className="canvas" id="main" tabIndex={-1}>{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
