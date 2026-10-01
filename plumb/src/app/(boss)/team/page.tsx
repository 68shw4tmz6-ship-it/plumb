import { Users, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Alert, Avatar, Badge, Card, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { updateTeamMember } from "@/lib/actions/admin";
import { currency, hoursLabel, longDate } from "@/lib/format";
import type { AppRole, Profile } from "@/lib/types";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

function startOfWeekIso() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function TeamPage() {
  const me = await requireBoss();
  const supabase = createClient();

  const [{ data: profiles }, { data: hours }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active", { ascending: false }).order("full_name"),
    supabase
      .from("timesheet_entries")
      .select("profile_id, hours")
      .gte("work_date", startOfWeekIso()),
    supabase.from("project_members").select("profile_id, projects(name, status)"),
  ]);

  const rows = (profiles ?? []) as Profile[];
  const weekHours = new Map<string, number>();
  for (const h of hours ?? []) {
    weekHours.set(h.profile_id, (weekHours.get(h.profile_id) ?? 0) + Number(h.hours ?? 0));
  }
  const jobsByPerson = new Map<string, string[]>();
  for (const a of (assignments ?? []) as any[]) {
    if (!a.projects || ["done", "cancelled"].includes(a.projects.status)) continue;
    const list = jobsByPerson.get(a.profile_id) ?? [];
    list.push(a.projects.name);
    jobsByPerson.set(a.profile_id, list);
  }

  const bosses = rows.filter((r) => r.role === "boss" && r.is_active).length;

  return (
    <>
      <PageHead
        title="Team"
        subtitle="Who's on the tools, what they cost, and what they can see."
      />

      <div style={{ marginBottom: 14 }}>
        <Alert tone="amber">
          <strong>How access works.</strong> Crew see only the jobs they&apos;re assigned to, and
          never the quotes, the price book or anyone&apos;s pay rate. Someone set to boss sees
          everything. New sign-ups always start as crew.
        </Alert>
      </div>

      <div className="grid grid-2">
        {rows.map((person) => {
          const isMe = person.id === me.id;
          const jobs = jobsByPerson.get(person.id) ?? [];
          return (
            <Card key={person.id} className={person.is_active ? undefined : "no-print"}>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <Avatar name={person.full_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong truncate">
                    {person.full_name}
                    {isMe ? <span className="tiny muted"> (you)</span> : null}
                  </div>
                  <div className="tiny muted truncate">{person.email}</div>
                </div>
                {person.role === "boss" ? (
                  <Badge tone="accent">
                    <ShieldCheck size={12} /> Boss
                  </Badge>
                ) : (
                  <Badge tone="steel">Crew</Badge>
                )}
                {!person.is_active ? <Badge tone="muted">Off</Badge> : null}
              </div>

              <div className="row wrap small muted" style={{ gap: 14, marginBottom: 12 }}>
                <span>This week: {hoursLabel(weekHours.get(person.id) ?? 0)}</span>
                <span>
                  {jobs.length === 0 ? "No live jobs" : `On: ${jobs.slice(0, 2).join(", ")}`}
                  {jobs.length > 2 ? ` +${jobs.length - 2}` : ""}
                </span>
                <span>Joined {longDate(person.created_at)}</span>
              </div>

              <form action={updateTeamMember} className="stack-sm">
                <input type="hidden" name="profile_id" value={person.id} />
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <Field label="Name">
                    <input type="text" name="full_name" defaultValue={person.full_name} required />
                  </Field>
                  <Field label="Trade">
                    <input type="text" name="trade" defaultValue={person.trade ?? ""} />
                  </Field>
                  <Field label="Phone">
                    <input type="tel" name="phone" defaultValue={person.phone ?? ""} />
                  </Field>
                  <Field label="ABN">
                    <input type="text" name="abn" defaultValue={person.abn ?? ""} />
                  </Field>
                  <Field label="Pay rate /hr" hint="What they're paid.">
                    <input
                      type="number"
                      name="hourly_rate"
                      step="0.01"
                      min="0"
                      defaultValue={person.hourly_rate ?? ""}
                    />
                  </Field>
                  <Field label="Charge rate /hr" hint="What the client pays.">
                    <input
                      type="number"
                      name="charge_rate"
                      step="0.01"
                      min="0"
                      defaultValue={person.charge_rate ?? ""}
                    />
                  </Field>
                  <Field label="Access">
                    <select
                      name="role"
                      defaultValue={person.role}
                      disabled={isMe && bosses === 1}
                    >
                      {(["crew", "boss"] as AppRole[]).map((r) => (
                        <option key={r} value={r}>
                          {r === "boss" ? "Boss — sees everything" : "Crew — assigned jobs only"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label=" ">
                    <label className="row" style={{ gap: 8, paddingTop: 8 }}>
                      <input
                        type="checkbox"
                        name="is_active"
                        defaultChecked={person.is_active}
                        disabled={isMe}
                      />
                      <span className="small">Active</span>
                    </label>
                  </Field>
                </div>
                {person.hourly_rate ? (
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {hoursLabel(weekHours.get(person.id) ?? 0)} this week ≈{" "}
                    {currency((weekHours.get(person.id) ?? 0) * Number(person.hourly_rate))} in
                    wages.
                  </p>
                ) : null}
                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                  Save
                </SubmitButton>
                {isMe && bosses === 1 ? (
                  <p className="tiny muted" style={{ margin: 0 }}>
                    You&apos;re the only boss, so your own access is locked to stop you locking
                    yourself out.
                  </p>
                ) : null}
              </form>
            </Card>
          );
        })}
      </div>

      <Card title="Adding someone" icon={<Users size={17} />} className="no-print">
        <p className="small muted" style={{ margin: 0 }}>
          Send them the app link and have them tap <strong>New account</strong> on the sign-in
          screen. They&apos;ll land here as crew, then put them on a job and they&apos;ll see it on
          their phone.
        </p>
      </Card>
    </>
  );
}
