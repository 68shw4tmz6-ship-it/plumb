import { FolderOpen, Upload, Trash2, FileText } from "lucide-react";
import { Card, Field, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { deleteProjectFile, uploadProjectFile } from "@/lib/actions/projects";
import { shortDate } from "@/lib/format";
import type { ProjectFile } from "@/lib/types";

export function FilesCard({
  projectId,
  files,
  canDelete,
}: {
  projectId: string;
  files: (ProjectFile & { url: string })[];
  canDelete: boolean;
}) {
  const docs = files.filter((f) => f.kind !== "photo");
  const photos = files.filter((f) => f.kind === "photo" && !f.report_id);

  return (
    <Card title="Plans and files" icon={<FolderOpen size={17} />}>
      {docs.length === 0 && photos.length === 0 ? (
        <EmptyState title="No files yet">
          Drawings, permits, the signed quote — anything the crew might need on site.
        </EmptyState>
      ) : (
        <>
          {docs.length > 0 ? (
            <ul className="list">
              {docs.map((f) => (
                <li key={f.id}>
                  <FileText size={15} className="muted" />
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate"
                    style={{ flex: 1 }}
                  >
                    {f.file_name ?? f.kind}
                  </a>
                  <span className="tiny muted">{shortDate(f.created_at)}</span>
                  {canDelete ? (
                    <form action={deleteProjectFile}>
                      <input type="hidden" name="file_id" value={f.id} />
                      <input type="hidden" name="project_id" value={projectId} />
                      <input type="hidden" name="storage_path" value={f.storage_path} />
                      <SubmitButton className="icon-btn" pendingLabel="…" title="Delete file">
                        <Trash2 size={13} />
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {photos.length > 0 ? (
            <div className="photo-grid" style={{ marginTop: docs.length ? 12 : 0 }}>
              {photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? "Photo"} loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
        </>
      )}

      <form action={uploadProjectFile} className="inline-form" style={{ marginTop: 14 }}>
        <input type="hidden" name="project_id" value={projectId} />
        <Field label="Add files" style={{ flex: "2 1 200px" }}>
          <input type="file" name="files" multiple />
        </Field>
        <Field label="Kind" style={{ flex: "0 0 130px" }}>
          <select name="kind" defaultValue="plan">
            <option value="plan">Plan</option>
            <option value="photo">Photo</option>
            <option value="invoice">Invoice</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <SubmitButton className="btn btn-ghost" pendingLabel="Uploading…">
          <Upload size={14} /> Upload
        </SubmitButton>
      </form>
    </Card>
  );
}
