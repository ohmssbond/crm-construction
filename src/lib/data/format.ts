/** Two-letter monogram for a brand/person tile: "J Huber" → "JH". */
export function monogram(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const letters =
    words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** Best display name for a contact: full name, else email, else a fallback. */
export function contactName(c: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.email || "Unnamed contact";
}

/** Two-letter monogram from a contact's display name. */
export const contactInitials = monogram;

/** "2026-06-20" → "Jun 20" (date-only, no timezone shift). */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${month} ${d}`;
}

/** ISO timestamp → "Jun 2 · 4:10pm", rendered in `timeZone` (IANA id). */
export function fmtDateTime(iso: string, timeZone: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleString("en-US", { month: "short", day: "numeric", timeZone });
  const time = dt
    .toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${date} · ${time}`;
}

/** ISO timestamp → "Jun 12": the calendar date in `timeZone` (for completed-at). */
export function fmtZonedDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", timeZone });
}

/** The right-hand date line for a project row, by stage. */
export function projectMeta(p: {
  stage: string;
  start_date: string | null;
  end_date: string | null;
}): string | null {
  const start = fmtDate(p.start_date);
  const end = fmtDate(p.end_date);
  if (p.stage === "in_progress" && start) return end ? `${start} – ${end}` : start;
  if (p.stage === "signed" && start) return `starts ${start}`;
  if (p.stage === "completed" && start && end) return `${start} – ${end}`;
  return null;
}

/** Joins a customer's structured billing-address parts into a one-line string. */
export function fmtAddress(c: {
  bill_line1?: string | null;
  bill_line2?: string | null;
  bill_city?: string | null;
  bill_state?: string | null;
  bill_postal_code?: string | null;
  bill_country?: string | null;
}): string {
  const cityLine = [c.bill_city, c.bill_state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  const cityZip = [cityLine, (c.bill_postal_code ?? "").trim()].filter(Boolean).join(" ");
  return [c.bill_line1, c.bill_line2, cityZip, c.bill_country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
