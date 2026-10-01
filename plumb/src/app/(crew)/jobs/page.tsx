import Link from "next/link";
import { ClipboardList, MapPin, CalendarClock, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Badge, Card, EmptyState, Gauge, PageHead } from "@/components/ui";
import {
  deadlineLabel,
  fullAddress,
  mapsUrl,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  relativeDays,
} from "@/lib/format";
import type { Project, ProjectStatus } from "@/lib/types";

export const metadata = { title: "My jobs" };
export const dynamic = "force-dynamic";

export default async function CrewJobsPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS already limits this to jobs the person is on.
  const { data: projects } = await supabase
    .from("projects")
    .select("*, clients(name)")
    .order("deadline", { ascending: true, nullsFirst: false });

  const rows = (projects ?? []) as (Project & { clients: { name: string } | null })[];
  const live = rows.filter((r) => !["done", "cancelled"].includes(r.status));
  const finished = rows.filter((r) => ["done", "cancelled"].includes(r.status));

  const ids = rows.map((r) => r.id);
  const { data: missing } = ids.length
    ? await supabase
        .from("project_materials")
        .select("project_id")
        .eq("status", "missing")
        .in("project_id", ids)
    : { data: [] };

  const missingBy = new Map<string, number>();
  for (const m of missing ?? []) {
    missingBy.set(m.project_id, (missingBy.get(m.project_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHead
        title={`G'day, ${profile.full_name.split(" ")[0]}`}
        subtitle={
          live.length === 0
            ? "Nothing assigned to you right now."
            : `${live.length} job${live.length === 1 ? "" : "s"} on your plate.`
        }
      />

      {live.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList size={22} />} title="No jobs assigned yet">
            When the boss puts you on a job it shows up here with the steps, the shopping list and
            somewhere to post your photos.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-2">
          {live.map((job) => {
            const address = fullAddress(job);
            const days = relativeDays(job.deadline);
            const late = days !== null && days < 0;
            const missingCount = missingBy.get(job.id) ?? 0;
            return (
              <Card key={job.id}>
                <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/jobs/${job.id}`} className="strong">
                      {job.name}
                    </Link>
                    <div className="tiny muted">{job.clients?.name}</div>
                  </div>
                  <Badge tone={PROJECT_STATUS_TONE[job.status as ProjectStatus]}>
                    {PROJECT_STATUS_LABEL[job.status as ProjectStatus]}
                  </Badge>
                </div>

                <Gauge value={job.progress} />

                <div className="stack-sm" style={{ marginTop: 10 }}>
                  <div
                    className="row small"
                    style={{ gap: 6, color: late ? "var(--danger)" : "var(--ink-soft)" }}
                  >
                    <CalendarClock size={13} /> {deadlineLabel(job.deadline)}
                  </div>
                  {address ? (
                    <a
                      href={mapsUrl(address)}
                      target="_blank"
                      rel="noreferrer"
                      className="row small"
                      style={{ gap: 6, color: "var(--steel)" }}
                    >
                      <MapPin size={13} /> {address}
                    </a>
                  ) : null}
                  {missingCount > 0 ? (
                    <div className="row small" style={{ gap: 6, color: "var(--danger)" }}>
                      <Package size={13} /> {missingCount} thing
                      {missingCount === 1 ? "" : "s"} flagged missing
                    </div>
                  ) : null}
                </div>

                <Link
                  href={`/jobs/${job.id}`}
                  className="btn btn-block"
                  style={{ marginTop: 12 }}
                >
                  Open job
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {finished.length > 0 ? (
        <Card title="Wrapped up" className="no-print">
          <ul className="list">
            {finished.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} style={{ flex: 1 }} className="small">
                  {job.name}
                </Link>
                <Badge tone="ok">Done</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
