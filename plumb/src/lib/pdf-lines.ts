import type { QuoteLineKind } from "@/lib/types";

/**
 * Reads line items (description / qty / unit / rate / amount) out of a text-based
 * quote PDF. It's a heuristic: it groups the words on the page into rows, spots rows
 * that end in dollar amounts, and uses section headings ("Labour and works",
 * "Materials") to decide whether a row is work or material. A scanned (image-only)
 * PDF has no text to read and returns nothing.
 */

export type ExtractedLine = {
  kind: QuoteLineKind;
  label: string;
  detail: string | null;
  unit: string;
  qty: number;
  unit_price: number;
};

type Item = { str: string; x: number; y: number };
type Row = { y: number; page: number; text: string };

const UNIT_ALIASES: Record<string, string> = {
  ea: "ea", each: "ea", no: "ea", nos: "ea", item: "ea", items: "ea", unit: "ea", units: "ea",
  pc: "ea", pcs: "ea", bag: "ea", bags: "ea", length: "ea", lengths: "ea",
  hr: "hr", hrs: "hr", hour: "hr", hours: "hr", h: "hr",
  m: "m", lm: "m", mtr: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  m2: "m2", sqm: "m2", "sq.m": "m2", sqmt: "m2", "m²": "m2",
  m3: "m3", cum: "m3", "cu.m": "m3", "m³": "m3",
  t: "t", tn: "t", tonne: "t", tonnes: "t", ton: "t", tons: "t",
  lot: "lot", ls: "lot", sum: "lot", job: "lot", allow: "lot",
  day: "day", days: "day",
};

const UNIT_WORD = Object.keys(UNIT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.\\^$*+?()[\]{}|]/g, "\\$&"))
  .join("|");

const MONEY = /-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\$?\s?\d+\.\d{2}\b/g;
const QTY_UNIT_TAIL = new RegExp(
  `^(.*?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORD})?\\s*$`,
  "i",
);

const SKIP_ROW =
  /^(description|item|qty|quantity|rate|amount|unit|price|total|sub-?total|gst|deposit|balance|terms|notes?|payment|to accept|thank|abn|quote\b|prepared for|quote number|date|valid until|project:?|page \d)/i;
const TOTAL_ROW =
  /(sub-?total|total\b|gst\b|grand total|amount due|deposit|balance|discount)/i;

const MATERIAL_HEADING = /\b(materials?|supplies|supply only|goods|plant)\b/;
const WORK_HEADING = /\b(labou?r|works?|services?|install(ation)?|scope|preliminar|site)\b/;

function toNumber(s: string) {
  return Number(s.replace(/[$,\s]/g, ""));
}

function normaliseUnit(raw: string | undefined | null) {
  if (!raw) return null;
  const k = raw.toLowerCase().replace(/\s+/g, "");
  return UNIT_ALIASES[k] ?? null;
}

function buildRows(pages: Item[][]): Row[] {
  const rows: Row[] = [];
  pages.forEach((items, pageIndex) => {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: Item[][] = [];
    for (const item of sorted) {
      const g = groups.find((grp) => Math.abs(grp[0].y - item.y) <= 6);
      if (g) g.push(item);
      else groups.push([item]);
    }
    groups.sort((a, b) => b[0].y - a[0].y);
    for (const g of groups) {
      g.sort((a, b) => a.x - b.x);
      let text = g.map((i) => i.str.trim()).filter(Boolean).join(" ");
      text = text
        .replace(/\b(m)\s+([23])(?=\s|$)/gi, "$1$2") // superscript 2 / 3 split off from "m"
        .replace(/\s+/g, " ")
        .trim();
      if (text) rows.push({ y: g[0].y, page: pageIndex, text });
    }
  });
  return rows;
}

function parseRows(rows: Row[]): ExtractedLine[] {
  const lines: ExtractedLine[] = [];
  let kind: QuoteLineKind | null = null;
  let last: { line: ExtractedLine; row: Row } | null = null;

  for (const row of rows) {
    const text = row.text;
    const moneyMatches = text.match(MONEY);

    // --- heading? (no money, short, mostly capitals)
    if (!moneyMatches) {
      const letters = text.replace(/[^A-Za-z]/g, "");
      const isHeading =
        letters.length >= 3 &&
        letters.length <= 40 &&
        text === text.toUpperCase() &&
        !SKIP_ROW.test(text);
      if (isHeading) {
        const lower = text.toLowerCase();
        if (MATERIAL_HEADING.test(lower)) kind = "material";
        else if (WORK_HEADING.test(lower)) kind = "work";
        last = null;
        continue;
      }
      // continuation of the previous line's description
      if (
        last &&
        last.row.page === row.page &&
        last.row.y - row.y <= 16 &&
        !SKIP_ROW.test(text) &&
        text.length < 140
      ) {
        last.line.detail = last.line.detail ? `${last.line.detail} ${text}` : text;
        last.row = row;
      } else {
        last = null;
      }
      continue;
    }

    // --- rows with money
    if (SKIP_ROW.test(text) || TOTAL_ROW.test(text)) {
      last = null;
      continue;
    }

    const firstMoney = text.search(MONEY);
    const head = text.slice(0, firstMoney).replace(/\$\s*$/, "").trim();
    const amounts = moneyMatches.map(toNumber);
    const amount = amounts[amounts.length - 1];
    const rate = amounts.length >= 2 ? amounts[amounts.length - 2] : null;
    if (!head) {
      last = null;
      continue;
    }

    let label = head;
    let qty = 1;
    let unit = "lot";

    const m = head.match(QTY_UNIT_TAIL);
    if (m && rate !== null) {
      label = m[1].trim();
      qty = Number(m[2].replace(",", ".")) || 1;
      unit = normaliseUnit(m[3]) ?? "ea";
    } else if (m && amounts.length === 1 && m[3]) {
      // "Treated pine 40 ea $1,920.00" with no rate column
      label = m[1].trim();
      qty = Number(m[2].replace(",", ".")) || 1;
      unit = normaliseUnit(m[3]) ?? "ea";
    }

    let unitPrice = rate ?? amount;
    if (rate === null) unitPrice = qty ? amount / qty : amount;
    if (rate !== null && qty && Math.abs(rate * qty - amount) > 0.05 * Math.max(1, amount)) {
      // columns didn't add up, trust the amount
      unitPrice = qty ? amount / qty : amount;
    }
    if (!label) label = head;

    const line: ExtractedLine = {
      kind: kind ?? "work",
      label,
      detail: null,
      unit,
      qty,
      unit_price: Math.round(unitPrice * 100) / 100,
    };
    lines.push(line);
    last = { line, row };
  }
  return lines;
}

export async function extractQuoteLines(
  data: ArrayBuffer | Uint8Array,
): Promise<{ lines: ExtractedLine[]; hadText: boolean }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const pages: Item[][] = [];
  let textCount = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    textCount += items.length;
    pages.push(items);
  }
  return { lines: parseRows(buildRows(pages)), hadText: textCount > 0 };
}
