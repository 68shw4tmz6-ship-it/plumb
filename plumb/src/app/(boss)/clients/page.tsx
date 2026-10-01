import Link from "next/link";
import { Contact, Plus, Trash2, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Card, EmptyState, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { deleteClient, saveClient } from "@/lib/actions/admin";
import { fullAddress } from "@/lib/format";
import type { Client } from "@/lib/types";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  await requireBoss();
  const supabase = createClient();

  const [{ data: clients }, { data: counts }] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("quotes").select("client_id, status"),
  ]);

  const rows = (clients ?? []) as Client[];
  const editing = rows.find((c) => c.id === searchParams.edit) ?? null;

  const quoteCount = new Map<string, number>();
  const wonCount = new Map<string, number>();
  for (const q of counts ?? []) {
    quoteCount.set(q.client_id, (quoteCount.get(q.client_id) ?? 0) + 1);
    if (q.status === "accepted") {
      wonCount.set(q.client_id, (wonCount.get(q.client_id) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHead title="Clients" subtitle="Who the quotes go to and where the jobs are." />

      <div className="split">
        <div>
          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={<Contact size={22} />} title="No clients yet">
                Add your first one on the right — you need one before you can raise a quote.
              </EmptyState>
            </Card>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Where</th>
                    <th className="num">Quotes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients?edit=${c.id}`} className="strong">
                          {c.name}
                        </Link>
                        {c.contact_name ? (
                          <div className="tiny muted">{c.contact_name}</div>
                        ) : null}
                      </td>
                      <td className="small">
                        {c.email ? (
                          <div className="row" style={{ gap: 5 }}>
                            <Mail size={12} className="muted" />
                            <a href={`mailto:${c.email}`}>{c.email}</a>
                          </div>
                        ) : null}
                        {c.phone ? (
                          <div className="row" style={{ gap: 5 }}>
                            <Phone size={12} className="muted" />
                            <a href={`tel:${c.phone}`}>{c.phone}</a>
                          </div>
                        ) : null}
                        {!c.email && !c.phone ? <span className="muted">—</span> : null}
                      </td>
                      <td className="small muted">{fullAddress(c) || "—"}</td>
                      <td className="num small">
                        {quoteCount.get(c.id) ?? 0}
                        {wonCount.get(c.id) ? (
                          <span className="tiny muted"> ({wonCount.get(c.id)} won)</span>
                        ) : null}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <Link href={`/clients?edit=${c.id}`} className="btn-quiet tiny">
                            Edit
                          </Link>
                          <form action={deleteClient}>
                            <input type="hidden" name="client_id" value={c.id} />
                            <SubmitButton className="icon-btn" pendingLabel="…" title="Delete">
                              <Trash2 size={13} />
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card title={editing ? `Edit ${editing.name}` : "Add a client"} icon={<Plus size={17} />}>
          <form action={saveClient} className="stack-sm" key={editing?.id ?? "new"}>
            {editing ? <input type="hidden" name="client_id" value={editing.id} /> : null}
            <Field label="Business or name">
              <input type="text" name="name" required defaultValue={editing?.name ?? ""} />
            </Field>
            <Field label="Contact person">
              <input type="text" name="contact_name" defaultValue={editing?.contact_name ?? ""} />
            </Field>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="Email">
                <input type="email" name="email" defaultValue={editing?.email ?? ""} />
              </Field>
              <Field label="Phone">
                <input type="tel" name="phone" defaultValue={editing?.phone ?? ""} />
              </Field>
            </div>
            <Field label="Address">
              <input type="text" name="address" defaultValue={editing?.address ?? ""} />
            </Field>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <Field label="Suburb">
                <input type="text" name="suburb" defaultValue={editing?.suburb ?? ""} />
              </Field>
              <Field label="Postcode">
                <input type="text" name="postcode" defaultValue={editing?.postcode ?? ""} />
              </Field>
              <Field label="State">
                <input type="text" name="state" defaultValue={editing?.state ?? ""} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} />
            </Field>
            <div className="row">
              <SubmitButton pendingLabel="Saving…">
                {editing ? "Save changes" : "Add client"}
              </SubmitButton>
              {editing ? (
                <Link href="/clients" className="btn btn-ghost">
                  Cancel
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
