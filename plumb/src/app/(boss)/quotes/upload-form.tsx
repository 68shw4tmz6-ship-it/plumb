"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { currency, todayIso } from "@/lib/format";
import type { Client } from "@/lib/types";
import { uploadQuote } from "./actions";

export function UploadQuoteForm({ clients }: { clients: Client[] }) {
  const [amount, setAmount] = useState(0);
  const [gstRate, setGstRate] = useState(10);
  const [alreadySent, setAlreadySent] = useState(true);

  return (
    <form action={uploadQuote} className="stack">
      <section className="card">
        <div className="card-head">
          <h3>
            <UploadCloud size={17} /> The quote you sent
          </h3>
        </div>
        <div className="grid grid-2">
          <Field label="Client">
            <select name="client_id" required defaultValue="">
              <option value="" disabled>
                Choose a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job title">
            <input type="text" name="title" required placeholder="Front fence and gate" />
          </Field>
          <Field label="Site address">
            <input type="text" name="site_address" />
          </Field>
          <Field label="PDF" hint="Optional, but handy — it follows the job through.">
            <input type="file" name="file" accept="application/pdf,image/*" />
          </Field>
          <Field label="Amount excluding GST">
            <input
              type="number"
              name="amount_ex_gst"
              min="0"
              step="0.01"
              required
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="GST %">
            <input
              type="number"
              name="gst_rate"
              min="0"
              max="30"
              step="0.5"
              value={gstRate}
              onChange={(e) => setGstRate(Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Total inc GST:{" "}
          <span className="mono strong">{currency(amount * (1 + gstRate / 100))}</span>
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Status and follow-ups</h3>
        </div>
        <label className="row" style={{ gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            name="already_sent"
            checked={alreadySent}
            onChange={(e) => setAlreadySent(e.target.checked)}
          />
          <span className="small">
            I&apos;ve already sent this to the client — start the follow-up clock
          </span>
        </label>

        <div className="grid grid-3">
          {alreadySent ? (
            <Field label="Sent on">
              <input type="date" name="sent_on" defaultValue={todayIso()} max={todayIso()} />
            </Field>
          ) : null}
          <Field label="Chase after (days)">
            <input type="number" name="follow_up_days" min="1" max="90" defaultValue={7} />
          </Field>
          <Field label="Stop after (nudges)">
            <input type="number" name="max_follow_ups" min="0" max="10" defaultValue={3} />
          </Field>
          <Field label="Valid until">
            <input type="date" name="valid_until" />
          </Field>
        </div>
      </section>

      <div className="row">
        <SubmitButton pendingLabel="Uploading…">Save quote</SubmitButton>
      </div>
    </form>
  );
}
