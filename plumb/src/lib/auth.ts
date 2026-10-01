import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in person's profile, or null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?deactivated=1");
  return profile;
}

export async function requireBoss(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "boss") redirect("/jobs");
  return profile;
}

export async function requireCrewOrBoss(): Promise<Profile> {
  return requireProfile();
}

export function homeFor(role: Profile["role"]) {
  return role === "boss" ? "/dashboard" : "/jobs";
}
