import { ListChecks, Plus, Trash2, CornerDownRight } from "lucide-react";
import { Card, Badge, Field, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { StepToggle } from "./step-toggle";
import { addStep, deleteStep, setStepStatus } from "@/lib/actions/projects";
import { shortDate, STEP_STATUS_LABEL } from "@/lib/format";
import type { ProjectStep, TeamMember } from "@/lib/types";

type StepRow = ProjectStep & { profiles?: { full_name: string } | null };

export function StepsCard({
  projectId,
  steps,
  team,
  canEdit,
}: {
  projectId: string;
  steps: StepRow[];
  team: TeamMember[];
  canEdit: boolean;
}) {
  const top = steps.filter((s) => !s.parent_id).sort((a, b) => a.position - b.position);
  const childrenOf = (id: string) =>
    steps.filter((s) => s.parent_id === id).sort((a, b) => a.position - b.position);

  const doneCount = steps.filter(
    (s) => s.status === "done" && !steps.some((c) => c.parent_id === s.id),
  ).length;
  const leafCount = steps.filter((s) => !steps.some((c) => c.parent_id === s.id)).length;

  function row(step: StepRow, isSub: boolean) {
    const kids = childrenOf(step.id);
    const isParent = kids.length > 0;
    const done = step.status === "done";

    return (
      <li key={step.id} className={isSub ? "sub" : undefined}>
        {isParent ? (
          <span className="muted" style={{ width: 19, textAlign: "center" }}>
            {kids.filter((k) => k.status === "done").length}/{kids.length}
          </span>
        ) : (
          <StepToggle
            stepId={step.id}
            projectId={projectId}
            done={done}
            label={step.label}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={done ? "done-text" : undefined}>
            {isSub ? (
              <CornerDownRight
                size={12}
                className="muted"
                style={{ verticalAlign: -1, marginRight: 4 }}
              />
            ) : null}
            {step.label}
          </div>
          <div className="tiny muted">
            {[
              step.profiles?.full_name,
              step.due_date ? `due ${shortDate(step.due_date)}` : null,
              step.detail,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>

        {step.status === "blocked" ? (
          <form action={setStepStatus} className="row" style={{ gap: 6 }}>
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="status" value="todo" />
            <Badge tone="danger">Blocked</Badge>
            <SubmitButton className="btn-quiet tiny" pendingLabel="…">
              Clear
            </SubmitButton>
          </form>
        ) : !isParent && !done ? (
          <form action={setStepStatus}>
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="status" value="blocked" />
            <SubmitButton
              className="btn-quiet tiny"
              pendingLabel="…"
              title="Flag this step as blocked"
            >
              Blocked?
            </SubmitButton>
          </form>
        ) : null}

        {canEdit ? (
          <form action={deleteStep}>
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="project_id" value={projectId} />
            <SubmitButton className="icon-btn" pendingLabel="…" title="Delete step">
              <Trash2 size={13} />
            </SubmitButton>
          </form>
        ) : null}
      </li>
    );
  }

  return (
    <Card
      title="Steps"
      icon={<ListChecks size={17} />}
      actions={
        <span className="small muted">
          {doneCount} of {leafCount} done
        </span>
      }
    >
      {top.length === 0 ? (
        <EmptyState title="No steps yet">
          {canEdit
            ? "Add the stages of the job here — accepted quotes fill this in from their work lines."
            : "The boss hasn't set the steps for this job yet."}
        </EmptyState>
      ) : (
        <ul className="list">
          {top.flatMap((step) => [row(step, false), ...childrenOf(step.id).map((k) => row(k, true))])}
        </ul>
      )}

      <form action={addStep} className="inline-form" style={{ marginTop: 14 }}>
        <input type="hidden" name="project_id" value={projectId} />
        <Field label={canEdit ? "Add a step" : "Add a substep"} style={{ flex: "3 1 200px" }}>
          <input type="text" name="label" required placeholder="Strip topsoil and set levels" />
        </Field>
        {canEdit ? (
          <>
            <Field label="Under" style={{ flex: "1 1 150px" }}>
              <select name="parent_id" defaultValue="">
                <option value="">Top level</option>
                {top.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Who" style={{ flex: "1 1 130px" }}>
              <select name="assignee_id" defaultValue="">
                <option value="">Anyone</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due" style={{ flex: "0 0 150px" }}>
              <input type="date" name="due_date" />
            </Field>
          </>
        ) : (
          <Field label="Under" style={{ flex: "1 1 150px" }}>
            <select name="parent_id" required defaultValue="">
              <option value="" disabled>
                Pick a step…
              </option>
              {top.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <SubmitButton className="btn btn-ghost" pendingLabel="Adding…">
          <Plus size={14} /> Add
        </SubmitButton>
      </form>
    </Card>
  );
}
