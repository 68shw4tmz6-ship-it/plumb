import { NotebookPen, Camera, CloudSun, AlertTriangle } from "lucide-react";
import { Card, Field, EmptyState, Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { addReport } from "@/lib/actions/projects";
import { longDate, todayIso } from "@/lib/format";
import type { ProjectFile, ProjectReport } from "@/lib/types";

type ReportRow = ProjectReport & { profiles: { full_name: string } | null };

export function ReportsCard({
  projectId,
  reports,
  photosByReport,
  canPost,
}: {
  projectId: string;
  reports: ReportRow[];
  photosByReport: Map<string, (ProjectFile & { url: string })[]>;
  canPost: boolean;
}) {
  return (
    <Card title="Site diary" icon={<NotebookPen size={17} />}>
      {canPost ? (
        <form action={addReport} className="stack-sm" style={{ marginBottom: 16 }}>
          <input type="hidden" name="project_id" value={projectId} />
          <Field label="How did today go?">
            <textarea
              name="content"
              rows={3}
              required
              placeholder="Poured the slab, screeded and floated. Ready for the pergola posts tomorrow."
            />
          </Field>
          <div className="inline-form">
            <Field label="Date" style={{ flex: "0 0 150px" }}>
              <input type="date" name="report_date" defaultValue={todayIso()} />
            </Field>
            <Field label="Weather" style={{ flex: "1 1 130px" }}>
              <input type="text" name="weather" placeholder="Hot, windy" />
            </Field>
            <Field label="Anything holding you up?" style={{ flex: "2 1 200px" }}>
              <input type="text" name="blocker" placeholder="Waiting on the plumber" />
            </Field>
          </div>
          <Field label="Progress pictures" hint="Pick as many as you like.">
            <input type="file" name="photos" accept="image/*" multiple capture="environment" />
          </Field>
          <SubmitButton pendingLabel="Posting…">
            <Camera size={15} /> Post to the diary
          </SubmitButton>
        </form>
      ) : null}

      {reports.length === 0 ? (
        <EmptyState title="Nothing in the diary yet">
          Daily notes and progress pictures from the crew show up here.
        </EmptyState>
      ) : (
        <div className="stack">
          {reports.map((r) => {
            const photos = photosByReport.get(r.id) ?? [];
            return (
              <article key={r.id} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                <div className="row" style={{ gap: 9, marginBottom: 6 }}>
                  <Avatar name={r.profiles?.full_name ?? "?"} />
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong">{r.profiles?.full_name ?? "Someone"}</div>
                    <div className="tiny muted">{longDate(r.report_date)}</div>
                  </div>
                  <div className="spacer" />
                  {r.weather ? (
                    <span className="tiny muted row" style={{ gap: 4 }}>
                      <CloudSun size={13} /> {r.weather}
                    </span>
                  ) : null}
                </div>

                <p className="small" style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
                  {r.content}
                </p>

                {r.blocker ? (
                  <div className="alert alert-amber" style={{ marginBottom: 8, fontSize: 13 }}>
                    <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {r.blocker}
                  </div>
                ) : null}

                {photos.length > 0 ? (
                  <div className="photo-grid">
                    {photos.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={p.caption ?? "Site photo"} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
