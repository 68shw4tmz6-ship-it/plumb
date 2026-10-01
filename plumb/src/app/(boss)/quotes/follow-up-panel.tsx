"use client";

import { useState } from "react";
import { Copy, Check, Mail, Send } from "lucide-react";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { logFollowUp } from "./actions";

export function FollowUpPanel({
  quoteId,
  subject,
  body,
  clientEmail,
  attempt,
  maxFollowUps,
}: {
  quoteId: string;
  subject: string;
  body: string;
  clientEmail: string | null;
  attempt: number;
  maxFollowUps: number;
}) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(body);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const mailto = clientEmail
    ? `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(draft)}`
    : null;

  const quotaLeft = Math.max(0, maxFollowUps - attempt);

  return (
    <div className="stack">
      <div>
        <span className="field-label">Subject</span>
        <input type="text" readOnly value={subject} />
      </div>
      <Field label="Message">
        <textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </Field>

      <div className="row wrap">
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy text"}
        </button>
        {mailto ? (
          <a className="btn btn-ghost btn-sm" href={mailto}>
            <Mail size={14} /> Open in email
          </a>
        ) : (
          <span className="tiny muted">No email on file for this client.</span>
        )}
      </div>

      <div className="divider" />

      <form action={logFollowUp} className="stack-sm">
        <input type="hidden" name="quote_id" value={quoteId} />
        <div className="inline-form">
          <Field label="How did you chase it?" style={{ flex: "1 1 140px" }}>
            <select name="channel" defaultValue="email">
              <option value="email">Email</option>
              <option value="phone">Phone call</option>
              <option value="sms">Text</option>
              <option value="visit">Dropped in</option>
            </select>
          </Field>
          <Field label="Note (optional)" style={{ flex: "2 1 200px" }}>
            <input type="text" name="note" placeholder="Left a message with the office" />
          </Field>
        </div>
        <SubmitButton className="btn btn-sm" pendingLabel="Logging…">
          <Send size={14} /> Log this nudge
        </SubmitButton>
        <p className="tiny muted" style={{ margin: 0 }}>
          Logging pushes the next reminder out by the follow-up window.{" "}
          {quotaLeft === 0
            ? "This was the last one in the quota — the quote will stop chasing."
            : `${quotaLeft} left in the quota.`}
        </p>
      </form>
    </div>
  );
}
