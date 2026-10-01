import Link from "next/link";
import {
  Clock,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Badge, Card, EmptyState, Field, PageHead, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { deleteHours, logHours } from "@/lib/actions/timesheets";
import { TimesheetPdfButton } from "./timesheet-pdf-button";
import { currency, hoursLabel, longDate, shortDate, todayIso } from "@/lib/format";
import type { Project, TimesheetEntry } from "@/lib/types";

export const metadata = { title: "My hours" };
export const dynamic = "force-dynamic";

function mondayOf(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
function shift(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Row = TimesheetEntry & { projects: { name: string } | null };

export default async function MyHoursPage({
  searchParams,
}: {
  searchParams: { week?: string; job?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const weekStart = mondayOf(searchParams.week);
  const weekEnd = shift(weekStart, 6);

  const [{ data: entries }, { data: projects }] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select("*, projects(name)")
      .eq("profile_id", profile.id)
      .gte("work_date", iso(weekStart))
      .lte("work_date", iso(weekEnd))
      .order("work_date"),
    supabase
      .from("projects")
      .select("id, name, status")
      .not("status", "in", "(done,cancelled)")
      .order("name"),
  ]);

  const rows = (entries ?? []) as Row[];
  const jobs = (projects ?? []) as Pick<Project, "id" | "name" | "status">[];
  const total = rows.reduce((s, e) => s + Number(e.hours ?? 0), 0);
  const approved = rows.filter((e) => e.is_approved).reduce((s, e) => s + Number(e.hours), 0);

  const byDay = new Map<string, Row[]>();
  for (const e of rows) {
    const list = byDay.get(e.work_date) ?? [];
    list.push(e);
    byDay.set(e.work_date, list);
  }

  return (
    <>
      <PageHead
        title="My hours"
        subtitle={`Week of ${longDate(iso(weekStart))}`}
        actions={
          <>
            <Link
              href={`/my-hours?week=${iso(shift(weekStart, -7))}`}
              className="btn btn-ghost btn-sm"
            >
              <ChevronLeft size={14} /> Previous
            </Link>
            <Link
              href={`/my-hours?week=${iso(shift(weekStart, 7))}`}
              className="btn btn-ghost btn-sm"
            >
              Next <ChevronRight size={14} />
            </Link>
          </>
        }
      />

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="This week" value={hoursLabel(total)} />
        <Stat label="Approved" value={hoursLabel(approved)} tone="ok" />
        <Stat
          label="At your rate"
          value={profile.hourly_rate ? currency(total * Number(profile.hourly_rate)) : "—"}
          sub={profile.hourly_rate ? `${currency(profile.hourly_rate)}/hr` : "No rate set"}
        />
      </div>

      <div className="split">
        <div className="stack">
          <Card title="Log a day" icon={<Clock size={17} />}>
            <form action={logHours} className="stack-sm">
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Field label="Date">
                  <input type="date" name="work_date" required defaultValue={todayIso()} />
                </Field>
                <Field label="Job">
                  <select name="project_id" defaultValue={searchParams.job ?? ""}>
                    <option value="">No job / yard</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start">
                  <input type="time" name="start_time" defaultValue="07:00" />
                </Field>
                <Field label="Finish">
                  <input type="time" name="finish_time" defaultValue="15:30" />
                </Field>
                <Field label="Break (minutes)">
                  <input type="number" name="break_minutes" min="0" max="480" defaultValue={30} />
                </Field>
                <Field label="Or just hours" hint="Leave the times blank to use this.">
                  <input type="number" name="hours" step="0.25" min="0" max="24" />
                </Field>
              </div>
              <Field label="Note">
                <input type="text" name="note" placeholder="Slab prep and pour" />
              </Field>
              <SubmitButton pendingLabel="Saving…">Log it</SubmitButton>
            </form>
          </Card>

          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={<Clock size={22} />} title="Nothing logged this week">
                Log your day above. Once the boss approves an entry it locks.
              </EmptyState>
            </Card>
          ) : (
            <Card title="This week's entries">
              <div className="stack">
                {DAY_LABELS.map((label, i) => {
                  const dayIso = iso(shift(weekStart, i));
                  const list = byDay.get(dayIso) ?? [];
                  if (list.length === 0) return null;
                  const dayTotal = list.reduce((s, e) => s + Number(e.hours), 0);
                  return (
                    <div key={dayIso}>
                      <div className="row-between" style={{ marginBottom: 4 }}>
                        <span className="eyebrow">
                          {label} {shortDate(dayIso)}
                        </span>
                        <span className="mono small strong">{hoursLabel(dayTotal)}</span>
                      </div>
                      <ul className="list">
                        {list.map((e) => (
                          <li key={e.id}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="small">
                                {e.projects?.name ?? "No job"}
                                {e.start_time && e.finish_time ? (
                                  <span className="tiny muted mono">
                                    {" "}
                                    {e.start_time.slice(0, 5)}–{e.finish_time.slice(0, 5)}
                                  </span>
                                ) : null}
                              </div>
                              {e.note ? <div className="tiny muted">{e.note}</div> : null}
                            </div>
                            <span className="mono small">{hoursLabel(e.hours)}</span>
                            {e.is_approved ? (
                              <Badge tone="ok">
                                <Check size={11} /> Locked
                              </Badge>
                            ) : (
                              <form action={deleteHours}>
                                <input type="hidden" name="entry_id" value={e.id} />
                                <SubmitButton
                                  className="icon-btn"
                                  pendingLabel="…"
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </SubmitButton>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Send it on" icon={<FileDown size={17} />}>
            <p className="small muted" style={{ marginTop: 0 }}>
              A one-page PDF of this week, ready for the office or your own records.
            </p>
            <TimesheetPdfButton
              name={profile.full_name}
              abn={profile.abn}
              rate={profile.hourly_rate}
              weekStart={iso(weekStart)}
              weekEnd={iso(weekEnd)}
              entries={rows.map((e) => ({
                date: e.work_date,
                job: e.projects?.name ?? "No job",
                start: e.start_time,
                finish: e.finish_time,
                breakMinutes: e.break_minutes,
                hours: Number(e.hours),
                note: e.note,
                approved: e.is_approved,
              }))}
              businessName={process.env.NEXT_PUBLIC_BUSINESS_NAME || "Plumb"}
            />
          </Card>

          <Card title="How approval works">
            <p className="small muted" style={{ margin: 0 }}>
              Log your own hours as you go. The boss approves them each week — after that the entry
              is locked and you&apos;ll need them to reopen it if something&apos;s wrong.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
