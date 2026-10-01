"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { currency, UNITS, unitLabel } from "@/lib/format";
import type { Client, PriceItem, QuoteLineKind } from "@/lib/types";
import { createQuote } from "./actions";

type Draft = {
  key: string;
  kind: QuoteLineKind;
  label: string;
  unit: string;
  qty: number;
  unit_price: number;
  price_item_id: string | null;
};

const KIND_LABEL: Record<QuoteLineKind, string> = {
  work: "Work",
  material: "Material",
  other: "Other",
};

let counter = 0;
const nextKey = () => `l${++counter}`;

export function QuoteBuilder({
  clients,
  priceItems,
  defaultFollowUpDays,
}: {
  clients: Client[];
  priceItems: PriceItem[];
  defaultFollowUpDays: number;
}) {
  const [lines, setLines] = useState<Draft[]>([]);
  const [gstRate, setGstRate] = useState(10);
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState(1);

  const categories = useMemo(() => {
    const map = new Map<string, PriceItem[]>();
    for (const item of priceItems) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [priceItems]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const gst = Math.round(subtotal * (gstRate / 100) * 100) / 100;

  function addFromPriceBook() {
    const item = priceItems.find((p) => p.id === pick);
    if (!item) return;
    setLines((cur) => [
      ...cur,
      {
        key: nextKey(),
        kind: item.kind,
        label: item.label,
        unit: item.unit,
        qty: pickQty || 1,
        unit_price: Number(item.unit_price),
        price_item_id: item.id,
      },
    ]);
    setPick("");
    setPickQty(1);
  }

  function addBlank() {
    setLines((cur) => [
      ...cur,
      {
        key: nextKey(),
        kind: "work",
        label: "",
        unit: "ea",
        qty: 1,
        unit_price: 0,
        price_item_id: null,
      },
    ]);
  }

  function patch(key: string, changes: Partial<Draft>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  function remove(key: string) {
    setLines((cur) => cur.filter((l) => l.key !== key));
  }

  function move(key: string, delta: number) {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const copy = [...cur];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  const payload = JSON.stringify(
    lines.map(({ key, ...rest }) => rest),
  );

  return (
    <form action={createQuote} className="stack">
      <input type="hidden" name="lines" value={payload} />

      <section className="card">
        <div className="card-head">
          <h3>Who and what</h3>
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
          <Field label="Job title" hint="This becomes the job name once accepted.">
            <input
              type="text"
              name="title"
              required
              placeholder="Rear yard landscaping — retaining and turf"
            />
          </Field>
          <Field label="Site address">
            <input type="text" name="site_address" placeholder="14 Baker St" />
          </Field>
          <Field label="Suburb">
            <input type="text" name="site_suburb" placeholder="Paddington" />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Scope notes" hint="Shown on the quote and copied to the job brief.">
            <textarea
              name="description"
              rows={3}
              placeholder="Inclusions, exclusions, access notes, who supplies what…"
            />
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Line items</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addBlank}>
            <Plus size={14} /> Blank line
          </button>
        </div>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>From the price book</legend>
          <div className="inline-form">
            <Field label="Item" style={{ flex: "3 1 260px" }}>
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Pick an item…</option>
                {categories.map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} — {currency(item.unit_price)}/{unitLabel(item.unit)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Qty" style={{ flex: "0 0 90px" }}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pickQty}
                onChange={(e) => setPickQty(Number(e.target.value))}
              />
            </Field>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={addFromPriceBook}
              disabled={!pick}
            >
              Add
            </button>
          </div>
          {priceItems.length === 0 ? (
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              Your price book is empty. Add items on the Price book page and they&apos;ll show up
              here.
            </p>
          ) : null}
        </fieldset>

        {lines.length === 0 ? (
          <div className="empty">
            <h4>No lines yet</h4>
            <div className="small">
              Add items from the price book above, or start a blank line. Work lines become
              job steps, material lines become the shopping list.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Description</th>
                  <th style={{ width: 110 }}>Type</th>
                  <th style={{ width: 84 }}>Unit</th>
                  <th style={{ width: 90 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit price</th>
                  <th className="num" style={{ width: 100 }}>
                    Amount
                  </th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="muted">
                      <GripVertical size={14} />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={l.label}
                        placeholder="Description"
                        onChange={(e) => patch(l.key, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={l.kind}
                        onChange={(e) =>
                          patch(l.key, { kind: e.target.value as QuoteLineKind })
                        }
                      >
                        {(["work", "material", "other"] as QuoteLineKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={l.unit}
                        onChange={(e) => patch(l.key, { unit: e.target.value })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {unitLabel(u)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.qty}
                        onChange={(e) => patch(l.key, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.unit_price}
                        onChange={(e) => patch(l.key, { unit_price: Number(e.target.value) })}
                      />
                    </td>
                    <td className="num mono">{currency(l.qty * l.unit_price)}</td>
                    <td>
                      <div className="row" style={{ gap: 3 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => move(l.key, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => move(l.key, 1)}
                          disabled={i === lines.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => remove(l.key)}
                          aria-label="Remove line"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="stack-sm"
          style={{ marginTop: 14, marginLeft: "auto", maxWidth: 260 }}
        >
          <div className="row-between small">
            <span className="muted">Subtotal</span>
            <span className="mono">{currency(subtotal)}</span>
          </div>
          <div className="row-between small">
            <span className="muted">
              GST
              <input
                type="number"
                name="gst_rate"
                value={gstRate}
                min="0"
                max="30"
                step="0.5"
                onChange={(e) => setGstRate(Number(e.target.value))}
                style={{ width: 62, marginLeft: 8, padding: "3px 6px", fontSize: 13 }}
              />
              %
            </span>
            <span className="mono">{currency(gst)}</span>
          </div>
          <div className="divider" style={{ margin: "4px 0" }} />
          <div className="row-between">
            <span className="strong">Total inc GST</span>
            <span className="mono strong" style={{ fontSize: 17 }}>
              {currency(subtotal + gst)}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Follow-ups</h3>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          If the client goes quiet, this quote shows up in your nudge queue with an email
          already written. Nothing is sent behind your back.
        </p>
        <div className="grid grid-3">
          <Field label="Chase after (days)">
            <input
              type="number"
              name="follow_up_days"
              min="1"
              max="90"
              defaultValue={defaultFollowUpDays}
            />
          </Field>
          <Field label="Stop after (nudges)">
            <input type="number" name="max_follow_ups" min="0" max="10" defaultValue={3} />
          </Field>
          <Field label="Valid until" hint="Defaults to 30 days out.">
            <input type="date" name="valid_until" />
          </Field>
        </div>
      </section>

      <div className="row wrap">
        <SubmitButton pendingLabel="Saving draft…">Save as draft</SubmitButton>
        <span className="small muted">
          You can edit lines, download the PDF and mark it sent on the next screen.
        </span>
      </div>
    </form>
  );
}
