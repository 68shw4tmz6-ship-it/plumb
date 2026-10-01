"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBoss, requireProfile } from "@/lib/auth";
import type { MaterialStatus, ProjectStatus, StepStatus } from "@/lib/types";

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v.length ? v : null;
};

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/jobs/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
}

/* ---------------- Project itself (boss) ---------------- */

export async function createProject(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();

  const name = str(formData, "name");
  if (!name) throw new Error("The job needs a name.");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      client_id: str(formData, "client_id"),
      address: str(formData, "address"),
      suburb: str(formData, "suburb"),
      postcode: str(formData, "postcode"),
      description: str(formData, "description"),
      status: (str(formData, "status") ?? "unstarted") as ProjectStatus,
      start_date: str(formData, "start_date"),
      deadline: str(formData, "deadline"),
      budget_ex_gst: formData.get("budget_ex_gst")
        ? Number(formData.get("budget_ex_gst"))
        : null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("project_id"));

  const { error } = await supabase
    .from("projects")
    .update({
      name: str(formData, "name"),
      client_id: str(formData, "client_id"),
      address: str(formData, "address"),
      suburb: str(formData, "suburb"),
      postcode: str(formData, "postcode"),
      description: str(formData, "description"),
      status: (str(formData, "status") ?? "unstarted") as ProjectStatus,
      start_date: str(formData, "start_date"),
      deadline: str(formData, "deadline"),
      budget_ex_gst: formData.get("budget_ex_gst")
        ? Number(formData.get("budget_ex_gst"))
        : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  refresh(id);
}

export async function deleteProject(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const id = String(formData.get("project_id"));
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  redirect("/projects");
}

/** The shared notes box — the crew can write here too. */
export async function saveProjectNotes(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const id = String(formData.get("project_id"));

  const { error } = await supabase
    .from("projects")
    .update({ notes: String(formData.get("notes") ?? "") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refresh(id);
}

/* ---------------- Crew on the job (boss) ---------------- */

export async function assignMember(formData: FormData) {
  const profile = await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));
  const profileId = str(formData, "profile_id");
  if (!profileId) return;

  const { error } = await supabase.from("project_members").insert({
    project_id: projectId,
    profile_id: profileId,
    role_on_job: str(formData, "role_on_job"),
    assigned_by: profile.id,
  });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  refresh(projectId);
}

export async function unassignMember(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("id", String(formData.get("member_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

/* ---------------- Steps ---------------- */

export async function addStep(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));
  const parentId = str(formData, "parent_id");

  const { count } = await supabase
    .from("project_steps")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("project_steps").insert({
    project_id: projectId,
    parent_id: parentId,
    position: count ?? 0,
    label: String(formData.get("label") ?? "").trim(),
    detail: str(formData, "detail"),
    due_date: str(formData, "due_date"),
    assignee_id: str(formData, "assignee_id"),
  });
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function setStepStatus(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_steps")
    .update({ status: String(formData.get("status")) as StepStatus })
    .eq("id", String(formData.get("step_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function toggleStep(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));
  const done = formData.get("done") === "1";

  const { error } = await supabase
    .from("project_steps")
    .update({ status: (done ? "done" : "todo") as StepStatus })
    .eq("id", String(formData.get("step_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function updateStep(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_steps")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      due_date: str(formData, "due_date"),
      assignee_id: str(formData, "assignee_id"),
    })
    .eq("id", String(formData.get("step_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function deleteStep(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_steps")
    .delete()
    .eq("id", String(formData.get("step_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

/* ---------------- Shopping list ---------------- */

export async function addMaterial(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase.from("project_materials").insert({
    project_id: projectId,
    label: String(formData.get("label") ?? "").trim(),
    qty: Number(formData.get("qty") ?? 1),
    unit: str(formData, "unit") ?? "ea",
    status: (str(formData, "status") ?? "to_order") as MaterialStatus,
    needed_by: str(formData, "needed_by"),
    supplier: str(formData, "supplier"),
    note: str(formData, "note"),
    added_by: profile.id,
  });
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function setMaterialStatus(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_materials")
    .update({ status: String(formData.get("status")) as MaterialStatus })
    .eq("id", String(formData.get("material_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function updateMaterial(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_materials")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      qty: Number(formData.get("qty") ?? 1),
      unit: str(formData, "unit") ?? "ea",
      supplier: str(formData, "supplier"),
      needed_by: str(formData, "needed_by"),
    })
    .eq("id", String(formData.get("material_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

export async function deleteMaterial(formData: FormData) {
  await requireBoss();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const { error } = await supabase
    .from("project_materials")
    .delete()
    .eq("id", String(formData.get("material_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}

/* ---------------- Daily report + photos ---------------- */

export async function addReport(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("Write a line or two before posting.");

  const { data: report, error } = await supabase
    .from("project_reports")
    .insert({
      project_id: projectId,
      author_id: profile.id,
      report_date: str(formData, "report_date") ?? new Date().toISOString().slice(0, 10),
      content,
      weather: str(formData, "weather"),
      blocker: str(formData, "blocker"),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
  for (const photo of photos) {
    if (photo.size === 0) continue;
    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("projects")
      .upload(path, photo, { contentType: photo.type || "image/jpeg" });
    if (upErr) continue;
    await supabase.from("project_files").insert({
      project_id: projectId,
      report_id: report.id,
      kind: "photo",
      storage_path: path,
      file_name: photo.name,
      uploaded_by: profile.id,
    });
  }

  refresh(projectId);
}

export async function uploadProjectFile(formData: FormData) {
  const profile = await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));
  const kind = (str(formData, "kind") ?? "photo") as
    | "plan"
    | "photo"
    | "invoice"
    | "quote"
    | "other";

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const file of files) {
    if (file.size === 0) continue;
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("projects")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw new Error(error.message);
    await supabase.from("project_files").insert({
      project_id: projectId,
      kind,
      storage_path: path,
      file_name: file.name,
      caption: str(formData, "caption"),
      uploaded_by: profile.id,
    });
  }

  refresh(projectId);
}

export async function deleteProjectFile(formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const projectId = String(formData.get("project_id"));
  const path = String(formData.get("storage_path"));

  await supabase.storage.from("projects").remove([path]);
  const { error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", String(formData.get("file_id")));
  if (error) throw new Error(error.message);
  refresh(projectId);
}
