import Link from "next/link";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Card, EmptyState, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { deletePriceItem, savePriceItem } from "@/lib/actions/admin";
import { currency, UNITS, unitLabel } from "@/lib/format";
import type { PriceItem, QuoteLineKind } from "@/lib/types";

export const metadata = { title: "Price book" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<QuoteLineKind, string> = {
  work: "Work → becomes a job step",
  material: "Material → goes on the shopping list",
  other: "Other → neither",
};

export default async function PriceBookPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  await requireBoss();
  const supabase = createClient();

  const { data } = await supabase
    .from("price_items")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("label");

  const items = (data ?? []) as PriceItem[];
  const editing = items.find((i) => i.id === searchParams.edit) ?? null;

  const grouped = [
    ...items
      .reduce((map, item) => {
        const list = map.get(item.category) ?? [];
        list.push(item);
        map.set(item.category, list);
        return map;
      }, new Map<string, PriceItem[]>())
      .entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <PageHead
        title="Price book"
        subtitle="Your rates, ready to drop into a quote. Only you can see this — the crew can't."
      />

      <div className="split">
        <div className="stack">
          {items.length === 0 ? (
            <Card>
              <EmptyState icon={<BookOpen size={22} />} title="Price book is empty">
                Add your common rates and quoting gets a lot faster. There&apos;s a starter set in
                the seed file if you&apos;d rather begin from that.
              </EmptyState>
            </Card>
          ) : (
            grouped.map(([category, rows]) => (
              <Card key={category} title={category}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ width: 80 }}>Unit</th>
                        <th className="num" style={{ width: 110 }}>
                          Rate
                        </th>
                        <th style={{ width: 90 }}>Type</th>
                        <th style={{ width: 96 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.label}
                            {item.detail ? (
                              <div className="tiny muted">{item.detail}</div>
                            ) : null}
                          </td>
                          <td className="small">{unitLabel(item.unit)}</td>
                          <td className="num mono">{currency(item.unit_price)}</td>
                          <td className="small muted">
                            {item.kind === "work"
                              ? "Work"
                              : item.kind === "material"
                                ? "Material"
                                : "Other"}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              <Link
                                href={`/price-book?edit=${item.id}`}
                                className="btn-quiet tiny"
                              >
                                Edit
                              </Link>
                              <form action={deletePriceItem}>
                                <input type="hidden" name="item_id" value={item.id} />
                                <SubmitButton
                                  className="icon-btn"
                                  pendingLabel="…"
                                  title="Retire this item"
                                >
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
              </Card>
            ))
          )}
        </div>

        <Card title={editing ? "Edit item" : "Add an item"} icon={<Plus size={17} />}>
          <form action={savePriceItem} className="stack-sm" key={editing?.id ?? "new"}>
            {editing ? <input type="hidden" name="item_id" value={editing.id} /> : null}
            <Field label="Description">
              <input
                type="text"
                name="label"
                required
                defaultValue={editing?.label ?? ""}
                placeholder="Turf supply and lay"
              />
            </Field>
            <Field label="Category" hint="Groups items in the quote builder.">
              <input
                type="text"
                name="category"
                defaultValue={editing?.category ?? ""}
                placeholder="Turf"
              />
            </Field>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="Unit">
                <select name="unit" defaultValue={editing?.unit ?? "ea"}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rate ex GST">
                <input
                  type="number"
                  name="unit_price"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.unit_price ?? 0}
                />
              </Field>
            </div>
            <Field label="Type">
              <select name="kind" defaultValue={editing?.kind ?? "work"}>
                {(Object.keys(KIND_LABEL) as QuoteLineKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea name="detail" rows={2} defaultValue={editing?.detail ?? ""} />
            </Field>
            <div className="row">
              <SubmitButton pendingLabel="Saving…">
                {editing ? "Save changes" : "Add item"}
              </SubmitButton>
              {editing ? (
                <Link href="/price-book" className="btn btn-ghost">
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
