import Link from "next/link";
import { Clock, Check, RotateCcw, ChevronLeft, ChevronRight, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHead, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { approveHours, approveWeek, unapproveHours } from "@/lib/actions/timesheets";
import { currency, hoursLabel, longDate, shortDate } from "@/lib/format";
import type { Profile, TimesheetEntry } from "@/lib/types";

export const metadata = { title: "Timesheets" };
export const dynamic = "force-dynamic";

function mondayOf(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shift(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Row = TimesheetEntry & {
  profiles: { full_name: string; hourly_rate: number | null } | null;
  projects: { name: string } | null;
};

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: { week?: string; person?: string };
}) {
  await requireBoss();
  const supabase = createClient();

  const weekStart = mondayOf(searchParams.week);
  const weekEnd = shift(weekStart, 6);

  const [{ data: entries }, { data: people }] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select("*, profiles(full_name, hourly_rate), projects(name)")
      .gte("work_date", iso(weekStart))
      .lte("work_date", iso(weekEnd))
      .order("work_date"),
    supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
  ]);

  const all = (entries ?? []) as Row[];
  const rows = searchParams.person
    ? all.filter((e) => e.profile_id === searchParams.person)
    : all;

  const staff = (people ?? []) as Profile[];
  const totalHours = rows.reduce((s, e) => s + Number(e.hours ?? 0), 0);
  const pending = rows.filter((e) => !e.is_approved);
  const wages = rows.reduce(
    (s, e) => s + Number(e.hours ?? 0) * Number(e.profiles?.hourly_rate ?? 0),
    0,
  );

  const byPerson = [
    ...rows
      .reduce((map, e) => {
        const key = e.profile_id;
        const current = map.get(key) ?? {
          name: e.profiles?.full_name ?? "Unknown",
          rate: Number(e.profiles?.hourly_rate ?? 0),
          days: new Map<string, number>(),
          total: 0,
          pending: 0,
        };
        current.days.set(e.work_date, (current.days.get(e.work_date) ?? 0) + Number(e.hours));
        current.total += Number(e.hours);
        if (!e.is_approved) current.pending += Number(e.hours);
        map.set(key, current);
        return map;
      }, new Map<string, { name: string; rate: number; days: Map<string, number>; total: number; pending: number }>())
      .entries(),
  ].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const weekLabel = `${shortDate(iso(weekStart))} – ${shortDate(iso(weekEnd))}`;

  return (
    <>
      <PageHead
        title="Timesheets"
        subtitle={`Week of ${longDate(iso(weekStart))}`}
        actions={
          <>
            <Link
              href={`/timesheets?week=${iso(shift(weekStart, -7))}${
                searchParams.person ? `&person=${searchParams.person}` : ""
              }`}
              className="btn btn-ghost btn-sm"
            >
              <ChevronLeft size={14} /> Previous
            </Link>
            <Link
              href={`/timesheets?week=${iso(shift(weekStart, 7))}${
                searchParams.person ? `&person=${searchParams.person}` : ""
              }`}
              className="btn btn-ghost btn-sm"
            >
              Next <ChevronRight size={14} />
            </Link>
            {pending.length > 0 ? (
              <form action={approveWeek}>
                <input type="hidden" name="week_start" value={iso(weekStart)} />
                {searchParams.person ? (
                  <input type="hidden" name="profile_id" value={searchParams.person} />
                ) : null}
                <SubmitButton className="btn btn-ok btn-sm" pendingLabel="Approving…">
                  <CheckCheck size={14} /> Approve week
                </SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Hours this week" value={hoursLabel(totalHours)} sub={weekLabel} />
        <Stat
          label="Waiting on you"
          value={hoursLabel(pending.reduce((s, e) => s + Number(e.hours), 0))}
          tone={pending.length ? "amber" : undefined}
          sub={`${pending.length} entr${pending.length === 1 ? "y" : "ies"}`}
        />
        <Stat label="Wages at pay rates" value={currency(wages)} sub="Rates from the Team page" />
        <Stat label="People on site" value={byPerson.length} />
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        <Link
          href={`/timesheets?week=${iso(weekStart)}`}
          className="chip"
          data-active={!searchParams.person}
        >
          Everyone
        </Link>
        {staff.map((s) => (
          <Link
            key={s.id}
            href={`/timesheets?week=${iso(weekStart)}&person=${s.id}`}
            className="chip"
            data-active={searchParams.person === s.id}
          >
            {s.full_name.split(" ")[0]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Clock size={22} />} title="No hours logged this week">
            The crew log their own days from My hours on their phone.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  {DAY_LABELS.map((d, i) => (
                    <th key={d} className="num">
                      {d}
                      <div className="tiny muted" style={{ fontWeight: 400 }}>
                        {shift(weekStart, i).getDate()}
                      </div>
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">Wages</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map(([id, p]) => (
                  <tr key={id}>
                    <td className="strong">
                      {p.name}
                      {p.pending > 0 ? (
                        <div className="tiny" style={{ color: "var(--amber)" }}>
                          {hoursLabel(p.pending)} unapproved
                        </div>
                      ) : null}
                    </td>
                    {DAY_LABELS.map((_, i) => {
                      const dayIso = iso(shift(weekStart, i));
                      const h = p.days.get(dayIso);
                      return (
                        <td key={dayIso} className="num mono small">
                          {h ? hoursLabel(h) : <span className="muted">·</span>}
                        </td>
                      );
                    })}
                    <td className="num mono strong">{hoursLabel(p.total)}</td>
                    <td className="num mono small">
                      {p.rate ? currency(p.total * p.rate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Card title="Every entry" icon={<Clock size={17} />}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Person</th>
                    <th>Job</th>
                    <th>Times</th>
                    <th className="num">Hours</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="small">{shortDate(e.work_date)}</td>
                      <td className="small">{e.profiles?.full_name}</td>
                      <td className="small">{e.projects?.name ?? <span className="muted">—</span>}</td>
                      <td className="small mono">
                        {e.start_time && e.finish_time
                          ? `${e.start_time.slice(0, 5)}–${e.finish_time.slice(0, 5)}`
                          : "—"}
                        {e.break_minutes ? (
                          <span className="tiny muted"> ({e.break_minutes}m break)</span>
                        ) : null}
                      </td>
                      <td className="num mono">{hoursLabel(e.hours)}</td>
                      <td className="small muted">{e.note}</td>
                      <td>
                        {e.is_approved ? (
                          <form action={unapproveHours} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="entry_id" value={e.id} />
                            <Badge tone="ok">
                              <Check size={11} /> Approved
                            </Badge>
                            <SubmitButton
                              className="icon-btn"
                              pendingLabel="…"
                              title="Reopen this entry"
                            >
                              <RotateCcw size={12} />
                            </SubmitButton>
                          </form>
                        ) : (
                          <form action={approveHours}>
                            <input type="hidden" name="entry_id" value={e.id} />
                            <SubmitButton className="btn btn-ok btn-sm" pendingLabel="…">
                              Approve
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>
              Once approved, the person can no longer change the entry — reopen it if something
              needs fixing.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
