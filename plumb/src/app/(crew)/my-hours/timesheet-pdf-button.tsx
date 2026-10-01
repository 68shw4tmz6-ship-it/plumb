"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { currency, hoursLabel, longDate, shortDate } from "@/lib/format";

type Entry = {
  date: string;
  job: string;
  start: string | null;
  finish: string | null;
  breakMinutes: number;
  hours: number;
  note: string | null;
  approved: boolean;
};

export function TimesheetPdfButton({
  name,
  abn,
  rate,
  weekStart,
  weekEnd,
  entries,
  businessName,
}: {
  name: string;
  abn: string | null;
  rate: number | null;
  weekStart: string;
  weekEnd: string;
  entries: Entry[];
  businessName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const M = 46;
      let y = M;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Timesheet", M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(businessName, W - M, y, { align: "right" });

      y += 22;
      doc.setTextColor(30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(name, M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(110);
      y += 13;
      const meta = [abn ? `ABN ${abn}` : null, rate ? `${currency(rate)}/hr` : null]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) doc.text(meta, M, y);
      doc.text(
        `${longDate(weekStart)} — ${longDate(weekEnd)}`,
        W - M,
        y,
        { align: "right" },
      );

      y += 20;
      doc.setDrawColor(200);
      doc.line(M, y, W - M, y);
      y += 20;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text("DATE", M, y);
      doc.text("JOB", M + 76, y);
      doc.text("TIMES", M + 280, y);
      doc.text("HOURS", W - M, y, { align: "right" });
      y += 6;
      doc.setDrawColor(230);
      doc.line(M, y, W - M, y);
      y += 14;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30);

      for (const e of entries) {
        doc.text(shortDate(e.date), M, y);
        doc.text(doc.splitTextToSize(e.job, 190)[0] ?? "", M + 76, y);
        doc.text(
          e.start && e.finish
            ? `${e.start.slice(0, 5)}–${e.finish.slice(0, 5)}${
                e.breakMinutes ? ` (-${e.breakMinutes}m)` : ""
              }`
            : "—",
          M + 280,
          y,
        );
        doc.text(hoursLabel(e.hours), W - M, y, { align: "right" });
        y += 15;
        if (e.note) {
          doc.setFontSize(8.5);
          doc.setTextColor(130);
          doc.text(doc.splitTextToSize(e.note, 300)[0] ?? "", M + 76, y);
          doc.setFontSize(10);
          doc.setTextColor(30);
          y += 13;
        }
        if (y > doc.internal.pageSize.getHeight() - 120) {
          doc.addPage();
          y = M;
        }
      }

      const total = entries.reduce((s, e) => s + e.hours, 0);
      y += 6;
      doc.setDrawColor(170);
      doc.line(M + 280, y, W - M, y);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Total hours", M + 280, y);
      doc.text(hoursLabel(total), W - M, y, { align: "right" });

      if (rate) {
        y += 18;
        doc.setFontSize(11);
        doc.text("At rate", M + 280, y);
        doc.text(currency(total * rate), W - M, y, { align: "right" });
      }

      y += 40;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(130);
      doc.text(
        `${entries.filter((e) => e.approved).length} of ${entries.length} entries approved at time of export.`,
        M,
        y,
      );

      doc.save(`timesheet-${weekStart}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-block"
      onClick={build}
      disabled={busy || entries.length === 0}
    >
      <FileDown size={15} /> {busy ? "Building…" : "Download this week"}
    </button>
  );
}
