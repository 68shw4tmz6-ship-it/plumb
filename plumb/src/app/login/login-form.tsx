"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { HardHat } from "lucide-react";
import { signIn, signUp, type AuthState } from "./actions";
import { SubmitButton } from "@/components/submit";
import { Field } from "@/components/ui";

const EMPTY: AuthState = {};

export function LoginForm({
  businessName,
  next,
}: {
  businessName: string;
  next: string;
}) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [signInState, signInAction] = useFormState(signIn, EMPTY);
  const [signUpState, signUpAction] = useFormState(signUp, EMPTY);
  const state = mode === "in" ? signInState : signUpState;

  return (
    <div className="auth-card">
      <div className="row" style={{ gap: 10, marginBottom: 4 }}>
        <span
          className="avatar"
          style={{ background: "var(--accent)", color: "#fff", width: 34, height: 34 }}
        >
          <HardHat size={18} />
        </span>
        <div>
          <h2 style={{ fontSize: 24 }}>Plumb</h2>
          <div className="tiny muted">{businessName !== "Plumb" ? businessName : "Quotes, jobs, crew and hours"}</div>
        </div>
      </div>

      <div className="chips" style={{ margin: "16px 0 14px" }}>
        <button
          type="button"
          className="chip"
          data-active={mode === "in"}
          onClick={() => setMode("in")}
        >
          Sign in
        </button>
        <button
          type="button"
          className="chip"
          data-active={mode === "up"}
          onClick={() => setMode("up")}
        >
          New account
        </button>
      </div>

      {state.error ? (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          {state.error}
        </div>
      ) : null}
      {state.notice ? (
        <div className="alert alert-ok" style={{ marginBottom: 12 }}>
          {state.notice}
        </div>
      ) : null}

      {mode === "in" ? (
        <form action={signInAction} className="stack">
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <input type="email" name="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input type="password" name="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="btn btn-block" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      ) : (
        <form action={signUpAction} className="stack">
          <Field label="Full name">
            <input type="text" name="full_name" autoComplete="name" required />
          </Field>
          <Field label="Email">
            <input type="email" name="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="8 characters or more.">
            <input type="password" name="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="btn btn-block" pendingLabel="Creating…">
            Create account
          </SubmitButton>
          <p className="tiny muted" style={{ margin: 0 }}>
            New accounts join as crew. The boss switches a role over on the Team page.
          </p>
        </form>
      )}
    </div>
  );
}
