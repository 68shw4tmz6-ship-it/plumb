import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  MapPin,
  StickyNote,
  Users,
  Clock,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Avatar, Badge, Card, Gauge, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { StepsCard } from "@/components/project/steps";
import { MaterialsCard } from "@/components/project/materials";
import { ReportsCard } from "@/components/project/reports";
import { FilesCard } from "@/components/project/files";
import { saveProjectNotes } from "@/lib/actions/projects";
import {
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
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CrewJobPage({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(name, phone, contact_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!project) notFound();
  const p = project as Project & { clients: Pick<Client, "name" | "phone" | "contact_name"> | null };

  const [steps, materials, members, reports, files, myHours] = await Promise.all([
    supabase
      .from("project_steps")
      .select("*, profiles(full_name)")
      .eq("project_id", p.id)
      .order("position"),
    supabase.from("project_materials").select("*").eq("project_id", p.id).order("created_at"),
    supabase
      .from("project_members")
      .select("*, profiles(id, full_name, role, trade, phone, is_active)")
      .eq("project_id", p.id),
    supabase
      .from("project_reports")
      .select("*, profiles(full_name)")
      .eq("project_id", p.id)
      .order("report_date", { ascending: false })
      .limit(15),
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("timesheet_entries")
      .select("hours")
      .eq("project_id", p.id)
      .eq("profile_id", profile.id),
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

  const memberRows = (members.data ?? []) as (ProjectMember & { profiles: TeamMember | null })[];
  const address = fullAddress(p);
  const days = relativeDays(p.deadline);
  const late = days !== null && days < 0 && !["done", "cancelled"].includes(p.status);
  const myTotal = (myHours.data ?? []).reduce((s, h) => s + Number(h.hours ?? 0), 0);

  return (
    <>
      <Link href="/jobs" className="btn-quiet" style={{ marginBottom: 6 }}>
        <ArrowLeft size={15} /> My jobs
      </Link>

      <PageHead
        title={p.name}
        subtitle={p.clients?.name}
        actions={
          <Badge tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>
            {PROJECT_STATUS_LABEL[p.status as ProjectStatus]}
          </Badge>
        }
      />

      <Card className="no-print">
        <Gauge value={p.progress} />
        <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
          <span
            className="row small"
            style={{ gap: 6, color: late ? "var(--danger)" : "var(--ink-soft)" }}
          >
            <CalendarClock size={14} /> {deadlineLabel(p.deadline)}
          </span>
          {address ? (
            <a
              href={mapsUrl(address)}
              target="_blank"
              rel="noreferrer"
              className="row small"
              style={{ gap: 6, color: "var(--steel)" }}
            >
              <MapPin size={14} /> {address}
            </a>
          ) : null}
          <span className="row small muted" style={{ gap: 6 }}>
            <Clock size={14} /> You&apos;ve logged {hoursLabel(myTotal)} here
          </span>
        </div>
        {p.description ? (
          <>
            <div className="divider" />
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <Info size={15} className="muted" style={{ marginTop: 2, flex: "0 0 auto" }} />
              <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {p.description}
              </p>
            </div>
          </>
        ) : null}
      </Card>

      <div className="split" style={{ marginTop: 14 }}>
        <div className="stack">
          <StepsCard
            projectId={p.id}
            steps={(steps.data ?? []) as ProjectStep[]}
            team={memberRows.map((m) => m.profiles).filter((m): m is TeamMember => !!m)}
            canEdit={false}
          />
          <MaterialsCard
            projectId={p.id}
            materials={(materials.data ?? []) as ProjectMaterial[]}
            canEdit={false}
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
          <Card title="On this job" icon={<Users size={17} />}>
            <ul className="list">
              {memberRows.map((m) => (
                <li key={m.id}>
                  <Avatar name={m.profiles?.full_name ?? "?"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small strong truncate">{m.profiles?.full_name}</div>
                    <div className="tiny muted">{m.role_on_job ?? m.profiles?.trade ?? "Crew"}</div>
                  </div>
                  {m.profiles?.phone ? (
                    <a href={`tel:${m.profiles.phone}`} className="btn-quiet tiny">
                      Call
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            {p.clients?.phone ? (
              <>
                <div className="divider" />
                <div className="row-between">
                  <div>
                    <div className="small strong">{p.clients.contact_name ?? p.clients.name}</div>
                    <div className="tiny muted">Client</div>
                  </div>
                  <a href={`tel:${p.clients.phone}`} className="btn btn-ghost btn-sm">
                    Call
                  </a>
                </div>
              </>
            ) : null}
          </Card>

          <Card title="Shared notes" icon={<StickyNote size={17} />}>
            <form action={saveProjectNotes} className="stack-sm">
              <input type="hidden" name="project_id" value={p.id} />
              <textarea
                name="notes"
                rows={5}
                defaultValue={p.notes ?? ""}
                placeholder="Gate code, where to park, dog on site…"
              />
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                Save notes
              </SubmitButton>
            </form>
          </Card>

          <FilesCard
            projectId={p.id}
            files={signed.filter((f) => !f.report_id)}
            canDelete={false}
          />

          <Card className="no-print">
            <Link href={`/my-hours?job=${p.id}`} className="btn btn-block">
              <Clock size={15} /> Log hours on this job
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
