import Link from "next/link";
import { FileText, Plus, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHead, Stat } from "@/components/ui";
import {
  currency,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  shortDate,
  todayIso,
} from "@/lib/format";
import type { Quote, QuoteStatus } from "@/lib/types";

export const metadata = { title: "Quotes" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Out with client" },
  { key: "follow-up", label: "Needs a nudge" },
  { key: "accepted", label: "Won" },
  { key: "declined", label: "Lost" },
] as const;

type Row = Quote & { clients: { name: string } | null };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireBoss();
  const supabase = createClient();
  const filter = searchParams.filter ?? "all";
  const today = todayIso();

  let query = supabase
    .from("quotes")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });

  if (filter === "draft") query = query.eq("status", "draft");
  if (filter === "sent") query = query.eq("status", "sent");
  if (filter === "accepted") query = query.eq("status", "accepted");
  if (filter === "declined") query = query.in("status", ["declined", "expired"]);
  if (filter === "follow-up") {
    query = query
      .eq("status", "sent")
      .not("next_follow_up_on", "is", null)
      .lte("next_follow_up_on", today);
  }

  const [{ data, error }, totals] = await Promise.all([
    query,
    supabase.from("quotes").select("status, amount_inc_gst, next_follow_up_on"),
  ]);

  const rows = (data ?? []) as Row[];
  const all = totals.data ?? [];
  const sent = all.filter((q) => q.status === "sent");
  const dueCount = sent.filter(
    (q) => q.next_follow_up_on !== null && q.next_follow_up_on <= today,
  ).length;
  const wonValue = all
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + Number(q.amount_inc_gst ?? 0), 0);

  return (
    <>
      <PageHead
        title="Quotes"
        subtitle="Build one here or drop in the PDF you already sent — either way the follow-ups are automatic."
        actions={
          <Link href="/quotes/new" className="btn">
            <Plus size={16} /> New quote
          </Link>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Drafts" value={all.filter((q) => q.status === "draft").length} />
        <Stat
          label="Out with client"
          value={currency(sent.reduce((s, q) => s + Number(q.amount_inc_gst ?? 0), 0))}
          sub={`${sent.length} quote${sent.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Needs a nudge"
          value={dueCount}
          tone={dueCount ? "amber" : undefined}
          sub={dueCount ? "Follow-up due or overdue" : "Nothing overdue"}
        />
        <Stat label="Won" value={currency(wonValue)} sub="Accepted, inc GST" />
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/quotes" : `/quotes?filter=${f.key}`}
            className="chip"
            data-active={filter === f.key}
          >
            {f.label}
            {f.key === "follow-up" && dueCount ? ` (${dueCount})` : ""}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="alert alert-danger">Couldn&apos;t load quotes: {error.message}</div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={22} />} title="No quotes here yet">
            {filter === "follow-up"
              ? "Nothing is overdue for a nudge. Quotes appear here once they've been sitting longer than their follow-up window."
              : "Start one from scratch with your price book, or upload a PDF you've already sent."}
          </EmptyState>
        </Card>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Job</th>
                <th>Client</th>
                <th className="num">Inc GST</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Next nudge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const overdue =
                  q.status === "sent" &&
                  q.next_follow_up_on !== null &&
                  q.next_follow_up_on <= today;
                return (
                  <tr key={q.id}>
                    <td className="mono small">
                      <Link href={`/quotes/${q.id}`} className="strong">
                        {q.reference}
                      </Link>
                      {q.source === "uploaded" ? (
                        <div className="tiny muted">PDF</div>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/quotes/${q.id}`}>{q.title}</Link>
                      {q.project_id ? (
                        <div className="tiny muted">
                          <Link href={`/projects/${q.project_id}`}>Job created →</Link>
                        </div>
                      ) : null}
                    </td>
                    <td className="small">{q.clients?.name ?? "—"}</td>
                    <td className="num mono">{currency(q.amount_inc_gst)}</td>
                    <td>
                      <Badge tone={QUOTE_STATUS_TONE[q.status as QuoteStatus]}>
                        {QUOTE_STATUS_LABEL[q.status as QuoteStatus]}
                      </Badge>
                    </td>
                    <td className="small">{shortDate(q.sent_at)}</td>
                    <td className="small">
                      {q.status !== "sent" ? (
                        <span className="muted">—</span>
                      ) : q.follow_ups_paused ? (
                        <span className="muted">Paused</span>
                      ) : q.next_follow_up_on === null ? (
                        <span className="muted">Quota used</span>
                      ) : overdue ? (
                        <span className="row" style={{ gap: 5, color: "var(--amber)" }}>
                          <BellRing size={13} /> {shortDate(q.next_follow_up_on)}
                        </span>
                      ) : (
                        shortDate(q.next_follow_up_on)
                      )}
                      {q.follow_up_count > 0 ? (
                        <div className="tiny muted">
                          {q.follow_up_count} sent
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
