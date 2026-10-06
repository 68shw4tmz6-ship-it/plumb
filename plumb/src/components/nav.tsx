"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  HardHat,
  Users,
  Contact,
  BookOpen,
  Clock,
  ClipboardList,
  CalendarClock,
} from "lucide-react";
import type { ReactNode } from "react";
import { PlumbLockup } from "@/components/logo";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

const ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard size={17} />,
  quotes: <FileText size={17} />,
  projects: <HardHat size={17} />,
  clients: <Contact size={17} />,
  pricebook: <BookOpen size={17} />,
  team: <Users size={17} />,
  hours: <Clock size={17} />,
  jobs: <ClipboardList size={17} />,
  schedule: <CalendarClock size={17} />,
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/jobs") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function SideNav({
  items,
  businessName,
  role,
  userName,
}: {
  items: NavItem[];
  businessName: string;
  role: string;
  userName: string;
}) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <PlumbLockup height={34} reverse />
        <small>
          {businessName !== "Plumb" ? `${businessName} · ` : ""}
          {role === "boss" ? "Office" : "Crew"}
        </small>
      </div>
      <nav className="stack-sm" style={{ marginTop: 16 }}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="nav-link"
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            {ICONS[item.icon]}
            {item.label}
            {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="nav-foot">
        <div className="strong" style={{ color: "var(--night-ink)" }}>
          {userName}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="btn-quiet"
            style={{ color: "var(--night-muted)", padding: "4px 0", fontSize: 12 }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {items.slice(0, 5).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
        >
          {ICONS[item.icon]}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
