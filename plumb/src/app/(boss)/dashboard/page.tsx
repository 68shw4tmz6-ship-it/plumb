import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  PackageX,
  Activity as ActivityIcon,
  HardHat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Card, Gauge, PageHead, Stat, EmptyState, Badge } from "@/components/ui";
import {
  currency,
  deadlineLabel,
  hoursLabel,
  longDate,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  relativeDays,
  shortDate,
  todayIso,
} from "@/lib/format";
import type { FollowUpDue, Project, ProjectStatus } from "@/lib/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function startOfWeekIso() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const profile = await requireBoss();
  const supabase = createClient();
  const today = todayIso();

  const [
    followUps,
    openQuotes,
    decided,
    projects,
    missing,
    pendingHours,
    activity,
  ] = await Promise.all([
    supabase.rpc("quotes_due_for_follow_up"),
    supabase.from("quotes").select("amount_inc_gst").eq("status", "sent"),
    supabase.from("quotes").select("status").in("status", ["accepted", "declined"]),
    supabase
      .from("projects")
      .select("*, clients(name)")
      .not("status", "in", "(done,cancelled)")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from("project_materials")
      .select("id, label, project_id, projects(name)")
      .eq("status", "missing")
      .order("flagged_at", { ascending: false })
      .limit(8),
    supabase
      .from("timesheet_entries")
      .select("hours")
      .eq("is_approved", false)
      .gte("work_date", startOfWeekIso()),
    supabase
      .from("activity")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const due = (followUps.data ?? []) as FollowUpDue[];
  const outstanding = (openQuotes.data ?? []).reduce(
    (sum, q) => sum + Number(q.amount_inc_gst ?? 0),
    0,
  );
  const decidedRows = decided.data ?? [];
  const accepted = decidedRows.filter((q) => q.status === "accepted").length;
  const winRate = decidedRows.length
    ? Math.round((accepted / decidedRows.length) * 100)
    : null;

  const jobs = (projects.data ?? []) as (Project & { clients: { name: string } | null })[];
  const overdue = jobs.filter((j) => {
    const d = relativeDays(j.deadline);
    return d !== null && d < 0;
  });
  const hoursToApprove = (pendingHours.data ?? []).reduce(
    (s, e) => s + Number(e.hours ?? 0),
    0,
  );

  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHead
        title={`Morning, ${firstName}`}
        subtitle={longDate(today)}
        actions={
          <>
            <Link href="/quotes/new" className="btn btn-ghost">
              New quote
            </Link>
            <Link href="/projects/new" className="btn">
              New job
            </Link>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat
          label="Quotes out"
          value={currency(outstanding)}
          sub={`${openQuotes.data?.length ?? 0} awaiting an answer`}
        />
        <Stat
          label="Need a nudge"
          value={due.length}
          sub={due.length ? "Follow-up overdue" : "All up to date"}
          tone={due.length ? "amber" : undefined}
        />
        <Stat
          label="Win rate"
          value={winRate === null ? "—" : `${winRate}%`}
          sub={`${accepted} of ${decidedRows.length} decided`}
        />
        <Stat
          label="Hours to approve"
          value={hoursLabel(hoursToApprove)}
          sub="This week, unapproved"
        />
      </div>

      <div className="split">
        <div className="stack">
          <Card
            title="Follow-ups due"
            icon={<BellRing size={17} />}
            actions={
              <Link href="/quotes?filter=follow-up" className="btn-quiet">
                Open queue
              </Link>
            }
          >
            {due.length === 0 ? (
              <EmptyState title="Nothing chasing today">
                Every sent quote is either answered or still inside its follow-up window.
              </EmptyState>
            ) : (
              <ul className="list">
                {due.slice(0, 6).map((q) => (
                  <li key={q.quote_id}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link href={`/quotes/${q.quote_id}`} className="strong truncate">
                        {q.title}
                      </Link>
                      <div className="tiny muted">
                        {q.client_name} · {q.reference} · sent {shortDate(q.sent_at)}
                      </div>
                    </div>
                    <span className="mono small">{currency(q.amount_inc_gst)}</span>
                    <Badge tone={q.days_overdue > 3 ? "danger" : "amber"}>
                      {q.days_overdue === 0
                        ? "Due today"
                        : `${q.days_overdue}d late`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Jobs on the go"
            icon={<HardHat size={17} />}
            actions={
              <Link href="/projects" className="btn-quiet">
                All jobs
              </Link>
            }
          >
            {jobs.length === 0 ? (
              <EmptyState title="No live jobs">
                Accept a quote and the job lands here with its steps and materials.
              </EmptyState>
            ) : (
              <div className="stack">
                {jobs.slice(0, 6).map((job) => {
                  const days = relativeDays(job.deadline);
                  const late = days !== null && days < 0;
                  return (
                    <Link key={job.id} href={`/projects/${job.id}`} className="tile-link">
                      <div className="row-between" style={{ marginBottom: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="strong truncate">{job.name}</div>
                          <div className="tiny muted">
                            {job.clients?.name ?? "No client"} · {job.reference}
                          </div>
                        </div>
                        <Badge tone={PROJECT_STATUS_TONE[job.status as ProjectStatus]}>
                          {PROJECT_STATUS_LABEL[job.status as ProjectStatus]}
                        </Badge>
                      </div>
                      <Gauge value={job.progress} />
                      <div
                        className="tiny"
                        style={{ marginTop: 6, color: late ? "var(--danger)" : "var(--ink-soft)" }}
                      >
                        <CalendarClock size={12} style={{ verticalAlign: -2 }}/>{" "}
                        {deadlineLabel(job.deadline)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          {overdue.length > 0 ? (
            <Card title="Past deadline" icon={<AlertTriangle size={17} />}>
              <ul className="list">
                {overdue.map((j) => (
                  <li key={j.id}>
                    <Link href={`/projects/${j.id}`} className="truncate" style={{ flex: 1 }}>
                      {j.name}
                    </Link>
                    <Badge tone="danger">{deadlineLabel(j.deadline)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Flagged missing on site" icon={<PackageX size={17} />}>
            {(missing.data ?? []).length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Nothing flagged. The crew marks materials missing from their job page.
              </p>
            ) : (
              <ul className="list">
                {(missing.data ?? []).map((m: any) => (
                  <li key={m.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small strong truncate">{m.label}</div>
                      <div className="tiny muted">{m.projects?.name}</div>
                    </div>
                    <Link href={`/projects/${m.project_id}`} className="btn-quiet">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Latest activity" icon={<ActivityIcon size={17} />}>
            {(activity.data ?? []).length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Nothing logged yet.
              </p>
            ) : (
              <ul className="list">
                {(activity.data ?? []).map((a: any) => (
                  <li key={a.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small">{a.summary}</div>
                      <div className="tiny muted">
                        {a.profiles?.full_name ?? "System"} · {shortDate(a.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
