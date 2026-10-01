"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import type { QuoteLineKind, QuoteStatus } from "@/lib/types";

type LineInput = {
  kind: QuoteLineKind;
  label: string;
  detail?: string | null;
  unit: string;
  qty: number;
  unit_price: number;
  price_item_id?: string | null;
};

function parseLines(raw: FormDataEntryValue | null): LineInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && String(l.label || "").trim())
      .map((l) => ({
        kind: (["work", "material", "other"].includes(l.kind) ? l.kind : "work") as QuoteLineKind,
        label: String(l.label).trim(),
        detail: l.detail ? String(l.detail) : null,
        unit: String(l.unit || "ea"),
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        price_item_id: l.price_item_id || null,
      }));
  } catch {
    return [];
  }
}

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v.length ? v : null;
};

export async function createQuote(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();

  const clientId = str(formData, "client_id");
  const title = str(formData, "title");
  if (!clientId || !title) throw new Error("A client and a title are required.");

  const lines = parseLines(formData.get("lines"));

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      title,
      description: str(formData, "description"),
      site_address: str(formData, "site_address"),
      site_suburb: str(formData, "site_suburb"),
      source: "generated",
      status: "draft",
      gst_rate: Number(formData.get("gst_rate") ?? 10),
      follow_up_days: Number(formData.get("follow_up_days") ?? 7),
      max_follow_ups: Number(formData.get("max_follow_ups") ?? 3),
      valid_until: str(formData, "valid_until"),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (lines.length) {
    const { error: lineError } = await supabase.from("quote_lines").insert(
      lines.map((l, i) => ({ ...l, quote_id: quote.id, position: i })),
    );
    if (lineError) throw new Error(lineError.message);
  }

  revalidatePath("/quotes");
  redirect(`/quotes/${quote.id}`);
}

export async function uploadQuote(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();

  const clientId = str(formData, "client_id");
  const title = str(formData, "title");
  if (!clientId || !title) throw new Error("A client and a title are required.");

  const amount = Number(formData.get("amount_ex_gst") ?? 0);
  const file = formData.get("file") as File | null;

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      title,
      description: str(formData, "description"),
      site_address: str(formData, "site_address"),
      source: "uploaded",
      status: str(formData, "already_sent") ? "sent" : "draft",
      amount_ex_gst: amount,
      gst_rate: Number(formData.get("gst_rate") ?? 10),
      follow_up_days: Number(formData.get("follow_up_days") ?? 7),
      max_follow_ups: Number(formData.get("max_follow_ups") ?? 3),
      sent_at: str(formData, "sent_on")
        ? new Date(String(formData.get("sent_on"))).toISOString()
        : null,
      valid_until: str(formData, "valid_until"),
      created_by: profile.id,
    })
    .select("id, reference")
    .single();

  if (error) throw new Error(error.message);

  if (file && file.size > 0) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${quote.id}/${quote.reference}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("quotes")
      .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
    if (upErr) throw new Error(`Quote saved, but the file didn't upload: ${upErr.message}`);
    await supabase.from("quotes").update({ file_path: path }).eq("id", quote.id);
  }

  revalidatePath("/quotes");
  redirect(`/quotes/${quote.id}`);
}

export async function attachQuoteFile(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const { data: quote } = await supabase
    .from("quotes")
    .select("reference")
    .eq("id", id)
    .single();

  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${id}/${quote?.reference ?? "quote"}.${ext}`;
  const { error } = await supabase.storage
    .from("quotes")
    .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
  if (error) throw new Error(error.message);

  await supabase.from("quotes").update({ file_path: path }).eq("id", id);
  revalidatePath(`/quotes/${id}`);
}

export async function setQuoteStatus(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));
  const status = String(formData.get("status")) as QuoteStatus;

  const patch: Record<string, unknown> = { status };
  if (status === "sent") {
    const sentOn = str(formData, "sent_on");
    patch.sent_at = sentOn ? new Date(sentOn).toISOString() : new Date().toISOString();
  }
  if (status === "declined") {
    patch.decision_note = str(formData, "decision_note");
  }

  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  // Accepting a quote fires the trigger that builds the job; pick up its id so
  // we can send the boss straight there.
  if (status === "accepted") {
    const { data } = await supabase.from("quotes").select("project_id").eq("id", id).single();
    revalidatePath("/projects");
    revalidatePath(`/quotes/${id}`);
    if (data?.project_id) redirect(`/projects/${data.project_id}?from=quote`);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

export async function logFollowUp(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));

  const { error } = await supabase.from("quote_follow_ups").insert({
    quote_id: id,
    channel: (str(formData, "channel") ?? "email") as never,
    note: str(formData, "note"),
    created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${id}`);
}

export async function updateFollowUpSettings(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));

  const { error } = await supabase
    .from("quotes")
    .update({
      follow_up_days: Number(formData.get("follow_up_days") ?? 7),
      max_follow_ups: Number(formData.get("max_follow_ups") ?? 3),
      follow_ups_paused: formData.get("follow_ups_paused") === "on",
      valid_until: str(formData, "valid_until"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/quotes/${id}`);
}

export async function updateQuoteDetails(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));

  const patch: Record<string, unknown> = {
    title: str(formData, "title"),
    description: str(formData, "description"),
    site_address: str(formData, "site_address"),
    site_suburb: str(formData, "site_suburb"),
    gst_rate: Number(formData.get("gst_rate") ?? 10),
  };
  const amount = formData.get("amount_ex_gst");
  if (amount !== null && String(amount) !== "") {
    patch.amount_ex_gst = Number(amount); // ignored for generated quotes (trigger wins)
  }

  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${id}`);
}

export async function addQuoteLine(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));

  const { count } = await supabase
    .from("quote_lines")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", id);

  const { error } = await supabase.from("quote_lines").insert({
    quote_id: id,
    position: count ?? 0,
    kind: (str(formData, "kind") ?? "work") as QuoteLineKind,
    label: String(formData.get("label") ?? "").trim(),
    detail: str(formData, "detail"),
    unit: str(formData, "unit") ?? "ea",
    qty: Number(formData.get("qty") ?? 1),
    unit_price: Number(formData.get("unit_price") ?? 0),
    price_item_id: str(formData, "price_item_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${id}`);
}

export async function updateQuoteLine(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const lineId = String(formData.get("line_id"));
  const quoteId = String(formData.get("quote_id"));

  const { error } = await supabase
    .from("quote_lines")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      kind: (str(formData, "kind") ?? "work") as QuoteLineKind,
      unit: str(formData, "unit") ?? "ea",
      qty: Number(formData.get("qty") ?? 1),
      unit_price: Number(formData.get("unit_price") ?? 0),
    })
    .eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function deleteQuoteLine(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const lineId = String(formData.get("line_id"));
  const quoteId = String(formData.get("quote_id"));

  const { error } = await supabase.from("quote_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function deleteQuote(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("quote_id"));

  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/quotes");
  redirect("/quotes");
}
