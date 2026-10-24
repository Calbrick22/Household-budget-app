"use client";
// The four destinations: a labelled sidebar on wide screens, a tab bar on phones.
// Both ask before leaving unsaved edits behind.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { confirmLeave } from "@/lib/leave-guard";
import { IconHistory, IconMonth, IconSettings, IconTrends } from "./icons";

const ITEMS = [
  { href: "/", label: "This month", short: "Month", Icon: IconMonth },
  { href: "/history", label: "History", short: "History", Icon: IconHistory },
  { href: "/trends", label: "Trends", short: "Trends", Icon: IconTrends },
  { href: "/settings", label: "Settings", short: "Settings", Icon: IconSettings },
];

const guard = (e: React.MouseEvent) => { if (!confirmLeave()) e.preventDefault(); };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/month");
  return pathname.startsWith(href);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} onClick={guard}>
          <Icon />{label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {ITEMS.map(({ href, short, Icon }) => (
        <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} onClick={guard}>
          <Icon />{short}
        </Link>
      ))}
    </nav>
  );
}
