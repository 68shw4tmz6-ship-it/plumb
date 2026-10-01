import { requireBoss } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireBoss();
  const supabase = createClient();

  // Quotes whose follow-up date has come and gone — shown as a badge so the
  // boss doesn't have to remember to look.
  const { count: dueCount } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .not("next_follow_up_on", "is", null)
    .lte("next_follow_up_on", new Date().toISOString().slice(0, 10));

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/quotes", label: "Quotes", icon: "quotes", badge: dueCount ?? 0 },
    { href: "/projects", label: "Jobs", icon: "projects" },
    { href: "/timesheets", label: "Timesheets", icon: "hours" },
    { href: "/clients", label: "Clients", icon: "clients" },
    { href: "/price-book", label: "Price book", icon: "pricebook" },
    { href: "/team", label: "Team", icon: "team" },
    { href: "/me", label: "Profile", icon: "schedule" },
  ];

  return (
    <AppShell profile={profile} items={items}>
      {children}
    </AppShell>
  );
}
