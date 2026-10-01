"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBoss, requireProfile } from "@/lib/auth";
import type { AppRole, QuoteLineKind } from "@/lib/types";

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v.length ? v : null;
};

/* ---------------- Clients ---------------- */

export async function saveClient(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();
  const id = str(formData, "client_id");

  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    contact_name: str(formData, "contact_name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    suburb: str(formData, "suburb"),
    postcode: str(formData, "postcode"),
    state: str(formData, "state"),
    notes: str(formData, "notes"),
  };
  if (!payload.name) throw new Error("A client needs a name.");

  const { error } = id
    ? await supabase.from("clients").update(payload).eq("id", id)
    : await supabase.from("clients").insert({ ...payload, created_by: profile.id });

  if (error) throw new Error(error.message);
  revalidatePath("/clients");
}

export async function deleteClient(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", String(formData.get("client_id")));
  if (error) {
    throw new Error(
      error.message.includes("violates foreign key")
        ? "That client has quotes or jobs attached, so it can't be deleted."
        : error.message,
    );
  }
  revalidatePath("/clients");
}

/* ---------------- Price book ---------------- */

export async function savePriceItem(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = str(formData, "item_id");

  const payload = {
    category: str(formData, "category") ?? "General",
    label: String(formData.get("label") ?? "").trim(),
    detail: str(formData, "detail"),
    unit: str(formData, "unit") ?? "ea",
    unit_price: Number(formData.get("unit_price") ?? 0),
    kind: (str(formData, "kind") ?? "work") as QuoteLineKind,
  };
  if (!payload.label) throw new Error("The item needs a description.");

  const { error } = id
    ? await supabase.from("price_items").update(payload).eq("id", id)
    : await supabase.from("price_items").insert(payload);

  if (error) throw new Error(error.message);
  revalidatePath("/price-book");
}

export async function deletePriceItem(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const { error } = await supabase
    .from("price_items")
    .update({ is_active: false })
    .eq("id", String(formData.get("item_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/price-book");
}

/* ---------------- Team ---------------- */

export async function updateTeamMember(formData: FormData) {
  await requireBoss();
  const supabase = createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim(),
      role: (str(formData, "role") ?? "crew") as AppRole,
      trade: str(formData, "trade"),
      phone: str(formData, "phone"),
      abn: str(formData, "abn"),
      hourly_rate: formData.get("hourly_rate") ? Number(formData.get("hourly_rate")) : null,
      charge_rate: formData.get("charge_rate") ? Number(formData.get("charge_rate")) : null,
      is_active: formData.get("is_active") === "on",
    })
    .eq("id", String(formData.get("profile_id")));

  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

/** Anyone editing their own details. Sensitive columns are protected in the database. */
export async function updateOwnProfile(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim(),
      first_name: str(formData, "first_name"),
      last_name: str(formData, "last_name"),
      phone: str(formData, "phone"),
      trade: str(formData, "trade"),
      abn: str(formData, "abn"),
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
  revalidatePath("/me");
  revalidatePath("/team");
}
