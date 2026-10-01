"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { currency, longDate, unitLabel } from "@/lib/format";
import type { Client, Quote, QuoteLine } from "@/lib/types";

type Business = {
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
};

export function QuotePdfButton({
  quote,
  client,
  lines,
  business,
}: {
  quote: Quote;
  client: Client | null;
  lines: QuoteLine[];
  business: Business;
}) {
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const page = doc.internal.pageSize;
      const W = page.getWidth();
      const M = 46;
      let y = M;

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text(business.name, M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110);
      y += 14;
      const bits = [
        business.abn ? `ABN ${business.abn}` : null,
        business.email,
        business.phone,
      ].filter(Boolean);
      if (bits.length) doc.text(bits.join("  ·  "), M, y);

      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("QUOTE", W - M, M + 2, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(quote.reference, W - M, M + 18, { align: "right" });

      y += 26;
      doc.setDrawColor(200);
      doc.line(M, y, W - M, y);
      y += 22;

      // Client / dates
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      doc.text("PREPARED FOR", M, y);
      doc.text("DATE", W - M - 150, y);
      doc.text("VALID UNTIL", W - M, y, { align: "right" });
      y += 13;
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.text(client?.name ?? "—", M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(longDate(quote.issued_on), W - M - 150, y);
      doc.text(quote.valid_until ? longDate(quote.valid_until) : "—", W - M, y, {
        align: "right",
      });

      y += 14;
      doc.setFontSize(9.5);
      doc.setTextColor(90);
      const addr = [client?.contact_name, client?.address, client?.suburb, client?.postcode]
        .filter(Boolean)
        .join(", ");
      if (addr) {
        doc.text(doc.splitTextToSize(addr, 250), M, y);
        y += 12;
      }

      y += 18;
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(quote.title, M, y);
      y += 6;

      if (quote.site_address) {
        y += 12;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(110);
        doc.text(
          `Site: ${[quote.site_address, quote.site_suburb].filter(Boolean).join(", ")}`,
          M,
          y,
        );
      }

      if (quote.description) {
        y += 16;
        doc.setTextColor(60);
        doc.setFontSize(9.5);
        const wrapped = doc.splitTextToSize(quote.description, W - M * 2);
        doc.text(wrapped, M, y);
        y += wrapped.length * 12;
      }

      // Lines
      y += 22;
      const colQty = W - M - 210;
      const colUnit = W - M - 150;
      const colAmount = W - M;

      doc.setFillColor(237, 234, 225);
      doc.rect(M, y - 12, W - M * 2, 20, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(80);
      doc.text("DESCRIPTION", M + 6, y + 2);
      doc.text("QTY", colQty, y + 2);
      doc.text("RATE", colUnit, y + 2);
      doc.text("AMOUNT", colAmount - 6, y + 2, { align: "right" });
      y += 22;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30);

      for (const line of lines) {
        if (y > page.getHeight() - 150) {
          doc.addPage();
          y = M;
        }
        const label = doc.splitTextToSize(line.label, colQty - M - 16);
        doc.text(label, M + 6, y);
        doc.text(`${line.qty} ${unitLabel(line.unit)}`, colQty, y);
        doc.text(currency(line.unit_price), colUnit, y);
        doc.text(currency(line.amount), colAmount - 6, y, { align: "right" });
        y += Math.max(label.length * 12, 14) + 5;
        doc.setDrawColor(230);
        doc.line(M, y - 6, W - M, y - 6);
      }

      if (lines.length === 0) {
        doc.setTextColor(130);
        doc.text("As discussed on site.", M + 6, y);
        y += 20;
      }

      // Totals
      y += 12;
      const labelX = W - M - 150;
      doc.setTextColor(90);
      doc.setFontSize(10);
      doc.text("Subtotal", labelX, y);
      doc.setTextColor(30);
      doc.text(currency(quote.amount_ex_gst), colAmount, y, { align: "right" });
      y += 16;
      doc.setTextColor(90);
      doc.text(`GST (${quote.gst_rate}%)`, labelX, y);
      doc.setTextColor(30);
      doc.text(
        currency(quote.amount_inc_gst - quote.amount_ex_gst),
        colAmount,
        y,
        { align: "right" },
      );
      y += 8;
      doc.setDrawColor(170);
      doc.line(labelX, y, W - M, y);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Total inc GST", labelX, y);
      doc.text(currency(quote.amount_inc_gst), colAmount, y, { align: "right" });

      // Footer
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(130);
      doc.text(
        "Prices held until the valid-until date. Variations quoted separately before work proceeds.",
        M,
        page.getHeight() - 40,
        { maxWidth: W - M * 2 },
      );

      doc.save(`${quote.reference}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={build} disabled={busy}>
      <FileDown size={16} /> {busy ? "Building…" : "Download PDF"}
    </button>
  );
}
