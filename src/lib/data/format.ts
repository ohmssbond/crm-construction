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

/** Joins generic address parts into a one-line string (skips blanks). */
export function formatAddressParts(p: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const cityLine = [p.city, p.state].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  const cityZip = [cityLine, (p.postalCode ?? "").trim()].filter(Boolean).join(" ");
  return [p.line1, p.line2, cityZip, p.country]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Customer billing address → one line. */
export function fmtAddress(c: {
  bill_line1?: string | null;
  bill_line2?: string | null;
  bill_city?: string | null;
  bill_state?: string | null;
  bill_postal_code?: string | null;
  bill_country?: string | null;
}): string {
  return formatAddressParts({
    line1: c.bill_line1,
    line2: c.bill_line2,
    city: c.bill_city,
    state: c.bill_state,
    postalCode: c.bill_postal_code,
    country: c.bill_country,
  });
}

/** Job site address → one line. */
export function fmtJobLocation(j: {
  job_line1?: string | null;
  job_line2?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_postal_code?: string | null;
  job_country?: string | null;
}): string {
  return formatAddressParts({
    line1: j.job_line1,
    line2: j.job_line2,
    city: j.job_city,
    state: j.job_state,
    postalCode: j.job_postal_code,
    country: j.job_country,
  });
}

/**
 * ISO date → "Nov 15, 2026". Unlike fmtDate this KEEPS the year: a construction
 * schedule spans years, so "Nov 15" would be ambiguous. Parsed as UTC so the day
 * never shifts.
 */
export function fmtScheduleDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The schedule's projected-completion cell: a date, a note, or both. The note absorbs
 * the fuzziness a date column can't hold ("pending survey", "TBD"). Null when empty.
 */
export function fmtProjected(iso: string | null, note: string | null): string | null {
  const date = fmtScheduleDate(iso);
  const trimmed = note?.trim() || null;
  if (date && trimmed) return `${date} · ${trimmed}`;
  return date ?? trimmed;
}
