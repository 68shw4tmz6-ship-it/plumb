import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Card, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { createProject } from "@/lib/actions/projects";
import { PROJECT_STATUS_LABEL } from "@/lib/format";
import type { Client, ProjectStatus } from "@/lib/types";

export const metadata = { title: "New job" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requireBoss();
  const supabase = createClient();
  const { data: clients } = await supabase.from("clients").select("*").order("name");

  return (
    <>
      <Link href="/projects" className="btn-quiet" style={{ marginBottom: 6 }}>
        <ArrowLeft size={15} /> Jobs
      </Link>
      <PageHead
        title="New job"
        subtitle="For work that didn't come through a quote — a repair, a day rate, a favour."
      />

      <form action={createProject} className="stack" style={{ maxWidth: 760 }}>
        <Card title="The basics">
          <div className="grid grid-2">
            <Field label="Job name">
              <input type="text" name="name" required placeholder="Fence repair — Miller St" />
            </Field>
            <Field label="Client">
              <select name="client_id" defaultValue="">
                <option value="">No client</option>
                {((clients ?? []) as Client[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Address">
              <input type="text" name="address" />
            </Field>
            <Field label="Suburb">
              <input type="text" name="suburb" />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="What's involved">
              <textarea name="description" rows={3} />
            </Field>
          </div>
        </Card>

        <Card title="Dates and money">
          <div className="grid grid-3">
            <Field label="Status">
              <select name="status" defaultValue="unstarted">
                {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" name="start_date" />
            </Field>
            <Field label="Deadline">
              <input type="date" name="deadline" />
            </Field>
            <Field label="Budget ex GST">
              <input type="number" name="budget_ex_gst" min="0" step="0.01" />
            </Field>
          </div>
        </Card>

        <div className="row">
          <SubmitButton pendingLabel="Creating…">Create job</SubmitButton>
          <span className="small muted">
            You&apos;ll add steps, materials and crew on the next screen.
          </span>
        </div>
      </form>
    </>
  );
}
