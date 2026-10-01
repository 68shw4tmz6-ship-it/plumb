import Link from "next/link";
import { HardHat, Plus, CalendarClock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Badge, Card, EmptyState, Gauge, PageHead, Stat } from "@/components/ui";
import {
  currency,
  deadlineLabel,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  relativeDays,
} from "@/lib/format";
import type { Project, ProjectStatus } from "@/lib/types";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "live", label: "Live" },
  { key: "all", label: "All" },
  { key: "unstarted", label: "Not started" },
  { key: "done", label: "Finished" },
] as const;

type Row = Project & {
  clients: { name: string } | null;
  project_members: { profile_id: string; profiles: { full_name: string } | null }[];
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireBoss();
  const supabase = createClient();
  const filter = searchParams.filter ?? "live";

  let query = supabase
    .from("projects")
    .select("*, clients(name), project_members(profile_id, profiles(full_name))")
    .order("deadline", { ascending: true, nullsFirst: false });

  if (filter === "live") query = query.not("status", "in", "(done,cancelled)");
  if (filter === "unstarted") query = query.in("status", ["unstarted", "next"]);
  if (filter === "done") query = query.in("status", ["done", "cancelled"]);

  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  const live = rows.filter((r) => !["done", "cancelled"].includes(r.status));
  const overdue = rows.filter((r) => {
    const d = relativeDays(r.deadline);
    return d !== null && d < 0 && !["done", "cancelled"].includes(r.status);
  });
  const unassigned = live.filter((r) => r.project_members.length === 0);

  return (
    <>
      <PageHead
        title="Jobs"
        subtitle="Everything on the books. Accepted quotes turn up here on their own."
        actions={
          <Link href="/projects/new" className="btn">
            <Plus size={16} /> New job
          </Link>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Live jobs" value={live.length} />
        <Stat
          label="Past deadline"
          value={overdue.length}
          tone={overdue.length ? "danger" : undefined}
        />
        <Stat
          label="Nobody assigned"
          value={unassigned.length}
          tone={unassigned.length ? "amber" : undefined}
        />
        <Stat
          label="Value on the books"
          value={currency(live.reduce((s, r) => s + Number(r.budget_ex_gst ?? 0), 0))}
          sub="Ex GST"
        />
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "live" ? "/projects" : `/projects?filter=${f.key}`}
            className="chip"
            data-active={filter === f.key}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="alert alert-danger">Couldn&apos;t load jobs: {error.message}</div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<HardHat size={22} />} title="No jobs here">
            Accept a quote and the job appears with its steps and shopping list, or add one by
            hand.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-2">
          {rows.map((job) => {
            const days = relativeDays(job.deadline);
            const late = days !== null && days < 0 && !["done", "cancelled"].includes(job.status);
            return (
              <Link key={job.id} href={`/projects/${job.id}`} className="tile-link">
                <div className="row-between" style={{ marginBottom: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="strong truncate">{job.name}</div>
                    <div className="tiny muted">
                      {job.clients?.name ?? "No client"} · <span className="mono">{job.reference}</span>
                    </div>
                  </div>
                  <Badge tone={PROJECT_STATUS_TONE[job.status as ProjectStatus]}>
                    {PROJECT_STATUS_LABEL[job.status as ProjectStatus]}
                  </Badge>
                </div>

                <Gauge value={job.progress} />

                <div className="row wrap" style={{ marginTop: 10, gap: 12 }}>
                  <span
                    className="tiny row"
                    style={{ gap: 4, color: late ? "var(--danger)" : "var(--ink-soft)" }}
                  >
                    <CalendarClock size={12} /> {deadlineLabel(job.deadline)}
                  </span>
                  <span className="tiny row muted" style={{ gap: 4 }}>
                    <Users size={12} />
                    {job.project_members.length === 0
                      ? "Nobody on it"
                      : job.project_members
                          .map((m) => m.profiles?.full_name?.split(" ")[0])
                          .filter(Boolean)
                          .join(", ")}
                  </span>
                  {job.budget_ex_gst ? (
                    <span className="tiny muted mono">{currency(job.budget_ex_gst)}</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
