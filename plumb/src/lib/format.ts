import type {
  MaterialStatus,
  ProjectStatus,
  QuoteStatus,
  StepStatus,
} from "@/lib/types";

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

export const currency = (n: number | null | undefined) => money.format(Number(n ?? 0));

export const currencyShort = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 100) / 10}k`;
  return money.format(v);
};

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function longDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeDays(iso: string | null | undefined) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function deadlineLabel(iso: string | null | undefined) {
  const days = relativeDays(iso);
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 14) return `${days}d left`;
  return `Due ${shortDate(iso)}`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function hoursLabel(h: number | null | undefined) {
  const v = Number(h ?? 0);
  if (!v) return "0h";
  const whole = Math.floor(v);
  const mins = Math.round((v - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole}h`;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  unstarted: "Unstarted",
  next: "Next one",
  in_progress: "In progress",
  on_hold: "On hold",
  done: "Done",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, string> = {
  unstarted: "steel",
  next: "amber",
  in_progress: "accent",
  on_hold: "amber",
  done: "ok",
  cancelled: "muted",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
  blocked: "Blocked",
};

export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  to_order: "To order",
  ordered: "Ordered",
  delivered: "Delivered",
  missing: "Missing",
};

export const MATERIAL_STATUS_TONE: Record<MaterialStatus, string> = {
  to_order: "steel",
  ordered: "amber",
  delivered: "ok",
  missing: "danger",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  draft: "muted",
  sent: "accent",
  accepted: "ok",
  declined: "danger",
  expired: "steel",
};

export const UNITS = ["ea", "hr", "m", "m2", "m3", "t", "lot", "day"];

export function unitLabel(unit: string) {
  if (unit === "m2") return "m²";
  if (unit === "m3") return "m³";
  return unit;
}

/** Pre-written follow-up email for a quote that has gone quiet. */
export function followUpEmail(opts: {
  clientName: string;
  contactName?: string | null;
  reference: string;
  title: string;
  amount: number;
  sentAt: string | null;
  attempt: number;
  businessName: string;
  senderName: string;
}) {
  const greeting = opts.contactName?.split(" ")[0] || opts.clientName;
  const sent = opts.sentAt ? longDate(opts.sentAt) : "recently";
  const subject =
    opts.attempt <= 1
      ? `Following up: ${opts.title} (${opts.reference})`
      : `Still keen? ${opts.title} (${opts.reference})`;

  const body =
    opts.attempt <= 1
      ? `Hi ${greeting},

Just checking in on the quote I sent through on ${sent} for ${opts.title} — ${currency(opts.amount)} including GST, reference ${opts.reference}.

Happy to walk you through any of it, or adjust the scope if the number is not sitting where you need it. If you'd like to go ahead, a reply here is enough and I'll get you into the schedule.

Cheers,
${opts.senderName}
${opts.businessName}`
      : `Hi ${greeting},

Following up once more on ${opts.reference} — ${opts.title}, ${currency(opts.amount)} including GST.

If the job is on hold or you've gone another way, no hard feelings at all, just let me know and I'll close it off. If the timing is the issue, tell me roughly when suits and I'll hold a spot.

Cheers,
${opts.senderName}
${opts.businessName}`;

  return { subject, body };
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function fullAddress(p: {
  address?: string | null;
  suburb?: string | null;
  postcode?: string | null;
}) {
  return [p.address, p.suburb, p.postcode].filter(Boolean).join(", ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
