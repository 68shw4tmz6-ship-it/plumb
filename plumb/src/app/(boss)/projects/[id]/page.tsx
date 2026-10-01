import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  MapPin,
  Settings2,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  Clock,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Alert, Avatar, Badge, Card, Field, Gauge, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { StepsCard } from "@/components/project/steps";
import { MaterialsCard } from "@/components/project/materials";
import { ReportsCard } from "@/components/project/reports";
import { FilesCard } from "@/components/project/files";
import {
  assignMember,
  deleteProject,
  saveProjectNotes,
  unassignMember,
  updateProject,
} from "@/lib/actions/projects";
import {
  currency,
  deadlineLabel,
  fullAddress,
  hoursLabel,
  mapsUrl,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  relativeDays,
} from "@/lib/format";
import type {
  Client,
  Project,
  ProjectFile,
  ProjectMaterial,
  ProjectMember,
  ProjectReport,
  ProjectStatus,
  ProjectStep,
  TeamMember,
  TimesheetEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  await requireBoss();
  const supabase = createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(*), quotes(id, reference)")
    .eq("id", params.id)
    .maybeSingle();

  if (!project) notFound();
  const p = project as Project & {
    clients: Client | null;
    quotes: { id: string; reference: string } | null;
  };

  const [steps, materials, members, reports, files, team, clients, hours] = await Promise.all([
    supabase
      .from("project_steps")
      .select("*, profiles(full_name)")
      .eq("project_id", p.id)
      .order("position"),
    supabase
      .from("project_materials")
      .select("*")
      .eq("project_id", p.id)
      .order("created_at"),
    supabase
      .from("project_members")
      .select("*, profiles(id, full_name, role, trade, phone, is_active)")
      .eq("project_id", p.id),
    supabase
      .from("project_reports")
      .select("*, profiles(full_name)")
      .eq("project_id", p.id)
      .order("report_date", { ascending: false })
      .limit(20),
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false }),
    supabase.from("team_directory").select("*").eq("is_active", true).order("full_name"),
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("timesheet_entries")
      .select("hours, is_approved, profile_id, profiles(full_name)")
      .eq("project_id", p.id),
  ]);

  const fileRows = (files.data ?? []) as ProjectFile[];
  const signed = await Promise.all(
    fileRows.map(async (f) => {
      const { data } = await supabase.storage
        .from("projects")
        .createSignedUrl(f.storage_path, 60 * 60);
      return { ...f, url: data?.signedUrl ?? "" };
    }),
  );
  const photosByReport = new Map<string, (ProjectFile & { url: string })[]>();
  for (const f of signed) {
    if (f.report_id) {
      const list = photosByReport.get(f.report_id) ?? [];
      list.push(f);
      photosByReport.set(f.report_id, list);
    }
  }

  const memberRows = (members.data ?? []) as (ProjectMember & {
    profiles: TeamMember | null;
  })[];
  const assignedIds = new Set(memberRows.map((m) => m.profile_id));
  const teamRows = (team.data ?? []) as TeamMember[];
  const available = teamRows.filter((t) => !assignedIds.has(t.id));

  const hourRows = (hours.data ?? []) as unknown as (Pick<
    TimesheetEntry,
    "hours" | "is_approved" | "profile_id"
  > & { profiles: { full_name: string } | null })[];
  const totalHours = hourRows.reduce((s, h) => s + Number(h.hours ?? 0), 0);
  const unapproved = hourRows
    .filter((h) => !h.is_approved)
    .reduce((s, h) => s + Number(h.hours ?? 0), 0);

  const address = fullAddress(p);
  const days = relativeDays(p.deadline);
  const late = days !== null && days < 0 && !["done", "cancelled"].includes(p.status);

  return (
    <>
      <Link href="/projects" className="btn-quiet" style={{ marginBottom: 6 }}>
        <ArrowLeft size={15} /> Jobs
      </Link>

      <PageHead
        title={p.name}
        subtitle={
          <>
            <span className="mono">{p.reference}</span>
            {p.clients ? <> · {p.clients.name}</> : null}
            {address ? (
              <>
                {" "}
                ·{" "}
                <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="strong">
                  <MapPin size={12} style={{ verticalAlign: -1 }} /> {address}
                </a>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Badge tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>
              {PROJECT_STATUS_LABEL[p.status as ProjectStatus]}
            </Badge>
            {p.quotes ? (
              <Link href={`/quotes/${p.quotes.id}`} className="btn btn-ghost">
                <FileText size={15} /> {p.quotes.reference}
              </Link>
            ) : null}
          </>
        }
      />

      {searchParams.from === "quote" ? (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="ok">
            <strong>Job created from the accepted quote.</strong> Work lines became steps,
            materials became the shopping list. Set a deadline and put someone on it and the crew
            will see it straight away.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="label">Progress</div>
          <div style={{ marginTop: 8 }}>
            <Gauge value={p.progress} />
          </div>
        </div>
        <div className="stat">
          <div className="label">Deadline</div>
          <div
            className="value"
            style={{ fontSize: 20, color: late ? "var(--danger)" : undefined }}
          >
            {deadlineLabel(p.deadline)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Hours logged</div>
          <div className="value" style={{ fontSize: 20 }}>
            {hoursLabel(totalHours)}
          </div>
          {unapproved ? (
            <div className="sub">{hoursLabel(unapproved)} to approve</div>
          ) : null}
        </div>
        <div className="stat">
          <div className="label">Budget ex GST</div>
          <div className="value" style={{ fontSize: 20 }}>
            {p.budget_ex_gst ? currency(p.budget_ex_gst) : "—"}
          </div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <StepsCard
            projectId={p.id}
            steps={(steps.data ?? []) as ProjectStep[]}
            team={teamRows}
            canEdit
          />
          <MaterialsCard
            projectId={p.id}
            materials={(materials.data ?? []) as ProjectMaterial[]}
            canEdit
          />
          <ReportsCard
            projectId={p.id}
            reports={
              (reports.data ?? []) as (ProjectReport & {
                profiles: { full_name: string } | null;
              })[]
            }
            photosByReport={photosByReport}
            canPost
          />
        </div>

        <div className="stack">
          <Card title="Who's on it" icon={<Users size={17} />}>
            {memberRows.length === 0 ? (
              <p className="small muted" style={{ marginTop: 0 }}>
                Nobody assigned yet — until you put someone on, no crew member can see this job.
              </p>
            ) : (
              <ul className="list">
                {memberRows.map((m) => (
                  <li key={m.id}>
                    <Avatar name={m.profiles?.full_name ?? "?"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small strong truncate">{m.profiles?.full_name}</div>
                      <div className="tiny muted">
                        {m.role_on_job ?? m.profiles?.trade ?? "Crew"}
                      </div>
                    </div>
                    <form action={unassignMember}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <input type="hidden" name="project_id" value={p.id} />
                      <SubmitButton className="icon-btn" pendingLabel="…" title="Take off the job">
                        <X size={13} />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {available.length > 0 ? (
              <form action={assignMember} className="stack-sm" style={{ marginTop: 12 }}>
                <input type="hidden" name="project_id" value={p.id} />
                <Field label="Put someone on">
                  <select name="profile_id" required defaultValue="">
                    <option value="" disabled>
                      Pick a person…
                    </option>
                    {available.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                        {t.trade ? ` · ${t.trade}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Role on this job">
                  <input type="text" name="role_on_job" placeholder="Site supervisor" />
                </Field>
                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Adding…">
                  <UserPlus size={14} /> Assign
                </SubmitButton>
              </form>
            ) : (
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>
                Everyone active is already on this job.
              </p>
            )}
          </Card>

          <Card title="Job details" icon={<Settings2 size={17} />}>
            <form action={updateProject} className="stack-sm">
              <input type="hidden" name="project_id" value={p.id} />
              <Field label="Name">
                <input type="text" name="name" defaultValue={p.name} required />
              </Field>
              <Field label="Client">
                <select name="client_id" defaultValue={p.client_id ?? ""}>
                  <option value="">No client</option>
                  {((clients.data ?? []) as { id: string; name: string }[]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Field label="Address">
                  <input type="text" name="address" defaultValue={p.address ?? ""} />
                </Field>
                <Field label="Suburb">
                  <input type="text" name="suburb" defaultValue={p.suburb ?? ""} />
                </Field>
                <Field label="Postcode">
                  <input type="text" name="postcode" defaultValue={p.postcode ?? ""} />
                </Field>
                <Field label="Status">
                  <select name="status" defaultValue={p.status}>
                    {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {PROJECT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start">
                  <input type="date" name="start_date" defaultValue={p.start_date ?? ""} />
                </Field>
                <Field label="Deadline">
                  <input type="date" name="deadline" defaultValue={p.deadline ?? ""} />
                </Field>
              </div>
              <Field label="Budget ex GST">
                <input
                  type="number"
                  name="budget_ex_gst"
                  step="0.01"
                  min="0"
                  defaultValue={p.budget_ex_gst ?? ""}
                />
              </Field>
              <Field label="What's involved">
                <textarea name="description" rows={3} defaultValue={p.description ?? ""} />
              </Field>
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                Save details
              </SubmitButton>
            </form>
          </Card>

          <Card title="Shared notes" icon={<StickyNote size={17} />}>
            <form action={saveProjectNotes} className="stack-sm">
              <input type="hidden" name="project_id" value={p.id} />
              <textarea
                name="notes"
                rows={5}
                defaultValue={p.notes ?? ""}
                placeholder="Gate code, where to park the truck, dog on site…"
              />
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                Save notes
              </SubmitButton>
              <p className="tiny muted" style={{ margin: 0 }}>
                The crew can read and edit this one.
              </p>
            </form>
          </Card>

          <FilesCard projectId={p.id} files={signed.filter((f) => !f.report_id)} canDelete />

          <Card title="Hours on this job" icon={<Clock size={17} />}>
            {hourRows.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                No hours logged yet.
              </p>
            ) : (
              <>
                <ul className="list">
                  {[
                    ...hourRows
                      .reduce((map, h) => {
                        const name = h.profiles?.full_name ?? "Unknown";
                        map.set(name, (map.get(name) ?? 0) + Number(h.hours ?? 0));
                        return map;
                      }, new Map<string, number>())
                      .entries(),
                  ]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, total]) => (
                      <li key={name}>
                        <span style={{ flex: 1 }} className="small">
                          {name}
                        </span>
                        <span className="mono small">{hoursLabel(total)}</span>
                      </li>
                    ))}
                </ul>
                <Link href="/timesheets" className="btn-quiet small">
                  Approve hours →
                </Link>
              </>
            )}
          </Card>

          <Card>
            <form action={deleteProject}>
              <input type="hidden" name="project_id" value={p.id} />
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Deleting…">
                <Trash2 size={14} /> Delete this job
              </SubmitButton>
              <p className="tiny muted" style={{ margin: "6px 0 0" }}>
                Steps, materials, diary entries and photos go with it. Timesheet entries are kept
                but unlinked.
              </p>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
