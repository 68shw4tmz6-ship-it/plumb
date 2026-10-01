"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBoss, requireProfile } from "@/lib/auth";

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v.length ? v : null;
};

function refresh() {
  revalidatePath("/my-hours");
  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
}

/** A crew member logging their own day. */
export async function logHours(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();

  const workDate = str(formData, "work_date");
  if (!workDate) throw new Error("Pick a date.");

  const start = str(formData, "start_time");
  const finish = str(formData, "finish_time");
  const manualHours = formData.get("hours");

  if (!start && !manualHours) {
    throw new Error("Either put in start and finish times, or a straight number of hours.");
  }

  const { error } = await supabase.from("timesheet_entries").insert({
    profile_id: profile.id,
    project_id: str(formData, "project_id"),
    work_date: workDate,
    start_time: start,
    finish_time: finish,
    break_minutes: Number(formData.get("break_minutes") ?? 0),
    hours: manualHours ? Number(manualHours) : 0, // trigger recomputes when times are given
    note: str(formData, "note"),
  });

  if (error) {
    throw new Error(
      error.message.includes("duplicate")
        ? "You've already logged that job for that day — edit the existing entry instead."
        : error.message,
    );
  }
  refresh();
}

export async function updateHours(formData: FormData) {
  await requireProfile();
  const supabase = createClient();

  const start = str(formData, "start_time");
  const patch: Record<string, unknown> = {
    project_id: str(formData, "project_id"),
    work_date: str(formData, "work_date"),
    start_time: start,
    finish_time: str(formData, "finish_time"),
    break_minutes: Number(formData.get("break_minutes") ?? 0),
    note: str(formData, "note"),
  };
  if (!start && formData.get("hours")) {
    patch.hours = Number(formData.get("hours"));
  }

  const { error } = await supabase
    .from("timesheet_entries")
    .update(patch)
    .eq("id", String(formData.get("entry_id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteHours(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("timesheet_entries")
    .delete()
    .eq("id", String(formData.get("entry_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/* ---------------- Boss ---------------- */

export async function approveHours(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();

  const { error } = await supabase
    .from("timesheet_entries")
    .update({
      is_approved: true,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", String(formData.get("entry_id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function unapproveHours(formData: FormData) {
  await requireBoss();
  const supabase = createClient();

  const { error } = await supabase
    .from("timesheet_entries")
    .update({ is_approved: false, approved_by: null, approved_at: null })
    .eq("id", String(formData.get("entry_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/** Approve everything unapproved in a week, for one person or the whole crew. */
export async function approveWeek(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();

  const weekStart = String(formData.get("week_start"));
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const personId = str(formData, "profile_id");

  let query = supabase
    .from("timesheet_entries")
    .update({
      is_approved: true,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("is_approved", false)
    .gte("work_date", weekStart)
    .lte("work_date", end.toISOString().slice(0, 10));

  if (personId) query = query.eq("profile_id", personId);

  const { error } = await query;
  if (error) throw new Error(error.message);
  refresh();
}
