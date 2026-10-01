import type { ReactNode } from "react";
import { SideNav, BottomNav, type NavItem } from "@/components/nav";
import type { Profile } from "@/lib/types";

export function AppShell({
  profile,
  items,
  children,
}: {
  profile: Profile;
  items: NavItem[];
  children: ReactNode;
}) {
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || "Plumb";
  return (
    <div className="shell">
      <SideNav
        items={items}
        businessName={businessName}
        role={profile.role}
        userName={profile.full_name}
      />
      <main className="main">{children}</main>
      <BottomNav items={items} />
    </div>
  );
}
