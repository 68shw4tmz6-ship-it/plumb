import { Package, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Card, Badge, Field, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import {
  addMaterial,
  deleteMaterial,
  setMaterialStatus,
} from "@/lib/actions/projects";
import {
  MATERIAL_STATUS_LABEL,
  MATERIAL_STATUS_TONE,
  shortDate,
  UNITS,
  unitLabel,
} from "@/lib/format";
import type { MaterialStatus, ProjectMaterial } from "@/lib/types";

const NEXT_STATUS: Record<MaterialStatus, MaterialStatus> = {
  to_order: "ordered",
  ordered: "delivered",
  delivered: "delivered",
  missing: "ordered",
};

export function MaterialsCard({
  projectId,
  materials,
  canEdit,
}: {
  projectId: string;
  materials: ProjectMaterial[];
  canEdit: boolean;
}) {
  const missing = materials.filter((m) => m.status === "missing");

  return (
    <Card
      title="Shopping list"
      icon={<Package size={17} />}
      actions={
        missing.length ? (
          <Badge tone="danger">
            <AlertTriangle size={12} /> {missing.length} missing
          </Badge>
        ) : null
      }
    >
      {materials.length === 0 ? (
        <EmptyState title="Nothing on the list">
          Material lines from an accepted quote land here. Anyone on the job can add what&apos;s
          needed.
        </EmptyState>
      ) : (
        <ul className="list">
          {materials.map((m) => (
            <li key={m.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={m.status === "delivered" ? "done-text" : undefined}>
                  <span className="mono">
                    {m.qty} {unitLabel(m.unit)}
                  </span>{" "}
                  {m.label}
                </div>
                <div className="tiny muted">
                  {[
                    m.supplier,
                    m.needed_by ? `needed ${shortDate(m.needed_by)}` : null,
                    m.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <Badge tone={MATERIAL_STATUS_TONE[m.status]}>
                {MATERIAL_STATUS_LABEL[m.status]}
              </Badge>

              {m.status !== "delivered" ? (
                <form action={setMaterialStatus}>
                  <input type="hidden" name="material_id" value={m.id} />
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="status" value={NEXT_STATUS[m.status]} />
                  <SubmitButton className="btn-quiet tiny" pendingLabel="…">
                    {m.status === "to_order"
                      ? "Ordered"
                      : m.status === "missing"
                        ? "On order"
                        : "Delivered"}
                  </SubmitButton>
                </form>
              ) : null}

              {m.status !== "missing" ? (
                <form action={setMaterialStatus}>
                  <input type="hidden" name="material_id" value={m.id} />
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="status" value="missing" />
                  <SubmitButton
                    className="btn-quiet tiny"
                    pendingLabel="…"
                    title="Tell the boss this isn't on site"
                  >
                    Not here
                  </SubmitButton>
                </form>
              ) : null}

              {canEdit ? (
                <form action={deleteMaterial}>
                  <input type="hidden" name="material_id" value={m.id} />
                  <input type="hidden" name="project_id" value={projectId} />
                  <SubmitButton className="icon-btn" pendingLabel="…" title="Remove">
                    <Trash2 size={13} />
                  </SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form action={addMaterial} className="inline-form" style={{ marginTop: 14 }}>
        <input type="hidden" name="project_id" value={projectId} />
        <Field label="Add material" style={{ flex: "3 1 180px" }}>
          <input type="text" name="label" required placeholder="20mm blue metal" />
        </Field>
        <Field label="Qty" style={{ flex: "0 0 80px" }}>
          <input type="number" name="qty" step="0.01" min="0" defaultValue={1} />
        </Field>
        <Field label="Unit" style={{ flex: "0 0 82px" }}>
          <select name="unit" defaultValue="ea">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </Field>
        {canEdit ? (
          <>
            <Field label="Supplier" style={{ flex: "1 1 140px" }}>
              <input type="text" name="supplier" />
            </Field>
            <Field label="Needed by" style={{ flex: "0 0 150px" }}>
              <input type="date" name="needed_by" />
            </Field>
          </>
        ) : null}
        <SubmitButton className="btn btn-ghost" pendingLabel="Adding…">
          <Plus size={14} /> Add
        </SubmitButton>
      </form>
    </Card>
  );
}
