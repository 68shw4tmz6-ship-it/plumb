import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  FileText,
  History,
  Paperclip,
  Send,
  Settings2,
  Trash2,
  XCircle,
  HardHat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Alert, Badge, Card, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { FollowUpPanel } from "../follow-up-panel";
import { QuotePdfButton } from "../quote-pdf-button";
import {
  addQuoteLine,
  deleteQuote,
  deleteQuoteLine,
  setQuoteStatus,
  updateFollowUpSettings,
  updateQuoteLine,
} from "../actions";
import {
  currency,
  followUpEmail,
  longDate,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  shortDate,
  todayIso,
  UNITS,
  unitLabel,
} from "@/lib/format";
import type {
  Client,
  Quote,
  QuoteFollowUp,
  QuoteLine,
  QuoteLineKind,
  QuoteStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<QuoteLineKind, string> = {
  work: "Work",
  material: "Material",
  other: "Other",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireBoss();
  const supabase = createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, clients(*)")
    .eq("id", params.id)
    .maybeSingle();

  if (!quote) notFound();

  const q = quote as Quote & { clients: Client | null };

  const [{ data: lines }, { data: followUps }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", q.id).order("position"),
    supabase
      .from("quote_follow_ups")
      .select("*, profiles(full_name)")
      .eq("quote_id", q.id)
      .order("occurred_at", { ascending: false }),
  ]);

  const lineRows = (lines ?? []) as QuoteLine[];
  const history = (followUps ?? []) as (QuoteFollowUp & {
    profiles: { full_name: string } | null;
  })[];

  let fileUrl: string | null = null;
  if (q.file_path) {
    const { data } = await supabase.storage
      .from("quotes")
      .createSignedUrl(q.file_path, 60 * 60);
    fileUrl = data?.signedUrl ?? null;
  }

  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || "Plumb";
  const email = followUpEmail({
    clientName: q.clients?.name ?? "there",
    contactName: q.clients?.contact_name,
    reference: q.reference,
    title: q.title,
    amount: q.amount_inc_gst,
    sentAt: q.sent_at,
    attempt: q.follow_up_count,
    businessName,
    senderName: profile.full_name,
  });

  const today = todayIso();
  const nudgeDue =
    q.status === "sent" && q.next_follow_up_on !== null && q.next_follow_up_on <= today;
  const editable = q.status === "draft" || q.status === "sent";

  return (
    <>
      <Link href="/quotes" className="btn-quiet" style={{ marginBottom: 6 }}>
        <ArrowLeft size={15} /> Quotes
      </Link>

      <PageHead
        title={q.title}
        subtitle={
          <>
            <span className="mono">{q.reference}</span> ·{" "}
            {q.clients ? (
              <Link href="/clients" className="strong">
                {q.clients.name}
              </Link>
            ) : (
              "No client"
            )}{" "}
            · issued {longDate(q.issued_on)}
          </>
        }
        actions={
          <>
            <QuotePdfButton
              quote={q}
              client={q.clients}
              lines={lineRows}
              business={{
                name: businessName,
                abn: profile.abn,
                email: profile.email,
                phone: profile.phone,
              }}
            />
            {q.project_id ? (
              <Link href={`/projects/${q.project_id}`} className="btn">
                <HardHat size={16} /> Open job
              </Link>
            ) : null}
          </>
        }
      />

      {nudgeDue ? (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="amber">
            <strong>This one&apos;s gone quiet.</strong> Sent {shortDate(q.sent_at)}, follow-up
            was due {shortDate(q.next_follow_up_on)}. The email below is ready to go.
          </Alert>
        </div>
      ) : null}

      <div className="split">
        <div className="stack">
          <Card
            title="What's quoted"
            icon={<FileText size={17} />}
            actions={
              <Badge tone={QUOTE_STATUS_TONE[q.status as QuoteStatus]}>
                {QUOTE_STATUS_LABEL[q.status as QuoteStatus]}
              </Badge>
            }
          >
            {q.description ? (
              <p className="small" style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>
                {q.description}
              </p>
            ) : null}

            {q.source === "uploaded" ? (
              <div className="stack-sm">
                <div className="row-between">
                  <span className="muted small">Uploaded PDF quote</span>
                  <span className="mono strong">{currency(q.amount_inc_gst)} inc GST</span>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>
                  No line items on an uploaded quote — accepting it creates the job with a
                  single &quot;Site set-up&quot; step for the crew to build on.
                </p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ width: 96 }}>Type</th>
                        <th style={{ width: 76 }}>Unit</th>
                        <th style={{ width: 78 }}>Qty</th>
                        <th style={{ width: 104 }}>Rate</th>
                        <th className="num" style={{ width: 96 }}>
                          Amount
                        </th>
                        {editable ? <th style={{ width: 88 }} /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {lineRows.map((line) => (
                        <tr key={line.id}>
                          {editable ? (
                            <>
                              <td colSpan={6} style={{ padding: 8 }}>
                                <form action={updateQuoteLine} className="inline-form">
                                  <input type="hidden" name="line_id" value={line.id} />
                                  <input type="hidden" name="quote_id" value={q.id} />
                                  <input
                                    type="text"
                                    name="label"
                                    defaultValue={line.label}
                                    style={{ flex: "3 1 180px" }}
                                    aria-label="Description"
                                  />
                                  <select
                                    name="kind"
                                    defaultValue={line.kind}
                                    style={{ flex: "0 0 104px" }}
                                    aria-label="Type"
                                  >
                                    {(["work", "material", "other"] as QuoteLineKind[]).map(
                                      (k) => (
                                        <option key={k} value={k}>
                                          {KIND_LABEL[k]}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                  <select
                                    name="unit"
                                    defaultValue={line.unit}
                                    style={{ flex: "0 0 78px" }}
                                    aria-label="Unit"
                                  >
                                    {UNITS.map((u) => (
                                      <option key={u} value={u}>
                                        {unitLabel(u)}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    name="qty"
                                    step="0.01"
                                    min="0"
                                    defaultValue={line.qty}
                                    style={{ flex: "0 0 78px" }}
                                    aria-label="Quantity"
                                  />
                                  <input
                                    type="number"
                                    name="unit_price"
                                    step="0.01"
                                    min="0"
                                    defaultValue={line.unit_price}
                                    style={{ flex: "0 0 104px" }}
                                    aria-label="Unit price"
                                  />
                                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                                    Save
                                  </SubmitButton>
                                </form>
                              </td>
                              <td>
                                <form action={deleteQuoteLine}>
                                  <input type="hidden" name="line_id" value={line.id} />
                                  <input type="hidden" name="quote_id" value={q.id} />
                                  <SubmitButton
                                    className="icon-btn"
                                    pendingLabel="…"
                                    title="Remove line"
                                  >
                                    <Trash2 size={13} />
                                  </SubmitButton>
                                </form>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{line.label}</td>
                              <td className="small muted">{KIND_LABEL[line.kind]}</td>
                              <td className="small">{unitLabel(line.unit)}</td>
                              <td className="mono small">{line.qty}</td>
                              <td className="mono small">{currency(line.unit_price)}</td>
                              <td className="num mono">{currency(line.amount)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {lineRows.length === 0 ? (
                        <tr>
                          <td colSpan={editable ? 7 : 6} className="muted small">
                            No lines yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {editable ? (
                  <form action={addQuoteLine} className="inline-form" style={{ marginTop: 12 }}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <Field label="Add a line" style={{ flex: "3 1 200px" }}>
                      <input type="text" name="label" required placeholder="Description" />
                    </Field>
                    <Field label="Type" style={{ flex: "0 0 108px" }}>
                      <select name="kind" defaultValue="work">
                        {(["work", "material", "other"] as QuoteLineKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
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
                    <Field label="Qty" style={{ flex: "0 0 80px" }}>
                      <input type="number" name="qty" step="0.01" min="0" defaultValue={1} />
                    </Field>
                    <Field label="Rate" style={{ flex: "0 0 104px" }}>
                      <input type="number" name="unit_price" step="0.01" min="0" defaultValue={0} />
                    </Field>
                    <SubmitButton className="btn btn-ghost" pendingLabel="Adding…">
                      Add
                    </SubmitButton>
                  </form>
                ) : null}

                <div
                  className="stack-sm"
                  style={{ marginTop: 16, marginLeft: "auto", maxWidth: 250 }}
                >
                  <div className="row-between small">
                    <span className="muted">Subtotal</span>
                    <span className="mono">{currency(q.amount_ex_gst)}</span>
                  </div>
                  <div className="row-between small">
                    <span className="muted">GST ({q.gst_rate}%)</span>
                    <span className="mono">
                      {currency(q.amount_inc_gst - q.amount_ex_gst)}
                    </span>
                  </div>
                  <div className="divider" style={{ margin: "4px 0" }} />
                  <div className="row-between">
                    <span className="strong">Total inc GST</span>
                    <span className="mono strong" style={{ fontSize: 17 }}>
                      {currency(q.amount_inc_gst)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </Card>

          {q.status === "sent" ? (
            <Card title="Ready-to-send nudge" icon={<BellRing size={17} />}>
              <FollowUpPanel
                quoteId={q.id}
                subject={email.subject}
                body={email.body}
                clientEmail={q.clients?.email ?? null}
                attempt={q.follow_up_count}
                maxFollowUps={q.max_follow_ups}
              />
            </Card>
          ) : null}

          {history.length > 0 ? (
            <Card title="Follow-up history" icon={<History size={17} />}>
              <ul className="list">
                {history.map((h) => (
                  <li key={h.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small strong">
                        {h.channel === "email"
                          ? "Emailed"
                          : h.channel === "phone"
                            ? "Called"
                            : h.channel === "sms"
                              ? "Texted"
                              : "Dropped in"}
                      </div>
                      {h.note ? <div className="tiny muted">{h.note}</div> : null}
                    </div>
                    <span className="tiny muted">
                      {h.profiles?.full_name} · {shortDate(h.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="stack">
          <Card title="Where it's at" icon={<Send size={17} />}>
            <div className="stack-sm">
              {q.status === "draft" ? (
                <form action={setQuoteStatus} className="stack-sm">
                  <input type="hidden" name="quote_id" value={q.id} />
                  <input type="hidden" name="status" value="sent" />
                  <Field label="Sent on">
                    <input type="date" name="sent_on" defaultValue={today} max={today} />
                  </Field>
                  <SubmitButton className="btn btn-block" pendingLabel="Marking…">
                    <Send size={15} /> Mark as sent
                  </SubmitButton>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    Starts the follow-up clock: first nudge {q.follow_up_days} days later.
                  </p>
                </form>
              ) : null}

              {q.status === "sent" || q.status === "expired" ? (
                <>
                  <form action={setQuoteStatus}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <input type="hidden" name="status" value="accepted" />
                    <SubmitButton className="btn btn-ok btn-block" pendingLabel="Creating job…">
                      <CheckCircle2 size={15} /> Client accepted
                    </SubmitButton>
                  </form>
                  <p className="tiny muted" style={{ margin: "2px 0 8px" }}>
                    Creates the job, turns work lines into steps and material lines into the
                    shopping list, and puts it in front of the crew.
                  </p>
                  <form action={setQuoteStatus} className="stack-sm">
                    <input type="hidden" name="quote_id" value={q.id} />
                    <input type="hidden" name="status" value="declined" />
                    <Field label="Reason (optional)">
                      <input type="text" name="decision_note" placeholder="Went with a cheaper mob" />
                    </Field>
                    <SubmitButton className="btn btn-ghost btn-block" pendingLabel="Saving…">
                      <XCircle size={15} /> Client declined
                    </SubmitButton>
                  </form>
                </>
              ) : null}

              {q.status === "accepted" ? (
                <div className="alert alert-ok">
                  Accepted {shortDate(q.decided_at)}.{" "}
                  {q.project_id ? (
                    <Link href={`/projects/${q.project_id}`} className="strong">
                      Open the job →
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {q.status === "declined" ? (
                <div className="alert alert-danger">
                  Declined {shortDate(q.decided_at)}
                  {q.decision_note ? ` — ${q.decision_note}` : ""}.
                  <form action={setQuoteStatus} style={{ marginTop: 8 }}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <input type="hidden" name="status" value="sent" />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                      Reopen
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Follow-up settings" icon={<Settings2 size={17} />}>
            <form action={updateFollowUpSettings} className="stack-sm">
              <input type="hidden" name="quote_id" value={q.id} />
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Field label="Chase after (days)">
                  <input
                    type="number"
                    name="follow_up_days"
                    min="1"
                    max="90"
                    defaultValue={q.follow_up_days}
                  />
                </Field>
                <Field label="Stop after">
                  <input
                    type="number"
                    name="max_follow_ups"
                    min="0"
                    max="10"
                    defaultValue={q.max_follow_ups}
                  />
                </Field>
              </div>
              <Field label="Valid until">
                <input type="date" name="valid_until" defaultValue={q.valid_until ?? ""} />
              </Field>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  name="follow_ups_paused"
                  defaultChecked={q.follow_ups_paused}
                />
                <span className="small">Pause follow-ups on this one</span>
              </label>
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                Save settings
              </SubmitButton>
              <div className="divider" style={{ margin: "6px 0" }} />
              <dl
                className="small"
                style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px" }}
              >
                <dt className="muted">Nudges sent</dt>
                <dd style={{ margin: 0 }}>
                  {q.follow_up_count} of {q.max_follow_ups}
                </dd>
                <dt className="muted">Last nudge</dt>
                <dd style={{ margin: 0 }}>{shortDate(q.last_follow_up_at)}</dd>
                <dt className="muted">Next due</dt>
                <dd style={{ margin: 0 }}>
                  {q.follow_ups_paused ? "Paused" : shortDate(q.next_follow_up_on)}
                </dd>
              </dl>
            </form>
          </Card>

          <Card title="File" icon={<Paperclip size={17} />}>
            {fileUrl ? (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block">
                Open attached PDF
              </a>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Nothing attached. Download the generated PDF above, or upload the signed copy
                from the client.
              </p>
            )}
          </Card>

          <Card>
            <form action={deleteQuote}>
              <input type="hidden" name="quote_id" value={q.id} />
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Deleting…">
                <Trash2 size={14} /> Delete this quote
              </SubmitButton>
              <p className="tiny muted" style={{ margin: "6px 0 0" }}>
                Lines and follow-up history go with it. A job already created stays.
              </p>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
