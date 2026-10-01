import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  const items: NavItem[] = [
    { href: "/jobs", label: "My jobs", icon: "jobs" },
    { href: "/my-hours", label: "My hours", icon: "hours" },
    { href: "/me", label: "Profile", icon: "team" },
  ];

  return (
    <AppShell profile={profile} items={items}>
      {children}
    </AppShell>
  );
}
