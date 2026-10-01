"use client";

import { useRef, useTransition } from "react";
import { toggleStep } from "@/lib/actions/projects";

export function StepToggle({
  stepId,
  projectId,
  done,
  label,
}: {
  stepId: string;
  projectId: string;
  done: boolean;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await toggleStep(formData);
    });
  }

  return (
    <form ref={formRef} action={submit} style={{ display: "flex", alignItems: "center" }}>
      <input type="hidden" name="step_id" value={stepId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="done" value={done ? "0" : "1"} />
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        aria-label={done ? `Mark "${label}" as not done` : `Mark "${label}" as done`}
        onChange={() => formRef.current?.requestSubmit()}
        style={{ opacity: pending ? 0.5 : 1 }}
      />
    </form>
  );
}
