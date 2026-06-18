/** "HH:MM[:SS]" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Validate a worker-picked clock time. Returns null if OK, else a user-facing
 *  message. `now` and (for "out") `openIn` are "HH:MM[:SS]" in the worker's zone.
 *  Overlap with other segments is intentionally not checked (admin CRUD later). */
export function validateSegmentTime(
  picked: string,
  now: string,
  kind: "in" | "out",
  openIn?: string
): string | null {
  if (timeToMinutes(picked) > timeToMinutes(now)) return "That time is in the future.";
  if (kind === "out" && openIn && timeToMinutes(picked) <= timeToMinutes(openIn))
    return "Clock-out must be after clock-in.";
  return null;
}

/** Parse and validate a worker-entered quantity. Returns the number if it is a
 *  finite value > 0, else null (caller surfaces a user-facing error).
 *  Note: `Number("")` is 0, so empty string is correctly rejected by `<= 0`. */
export function validateQty(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Validate a worker-entered photo label. Returns the trimmed label if non-empty,
 *  else null (caller surfaces a user-facing error). */
export function validateLabel(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Extended cost of a material line = qty × unit_cost, rounded to cents. Non-numeric
 *  inputs (or a null unit cost) yield 0. qty/unitCost may arrive as strings (PostgREST
 *  serializes `numeric` as a string). */
export function materialExtended(
  qty: string | number,
  unitCost: string | number | null
): number {
  const q = Number(qty);
  const u = Number(unitCost);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  // Round to cents: multiply by 100, round, divide by 100.
  // Add a tiny epsilon (0.0001) to handle floating-point precision issues.
  return Math.round(q * u * 100 + 0.0001) / 100;
}

/** Format money as "<CURRENCY> <amount>" with 2 decimals (e.g. "USD 42.50"). */
export function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/** Sum of (out − in)/60 over CLOSED segments only (open ones excluded). */
export function sumSegmentHours(
  segments: { time_in: string; time_out: string | null }[]
): number {
  return segments.reduce((acc, s) => {
    if (!s.time_out) return acc;
    const diff = timeToMinutes(s.time_out) - timeToMinutes(s.time_in);
    return acc + Math.max(0, diff) / 60; // clamp: cross-midnight is out of MVP scope
  }, 0);
}

/** Round to the nearest 0.25 h. */
export function roundQuarterHours(hours: number): number {
  return Math.round(hours / 0.25) * 0.25;
}

/** "HH:MM[:SS]" → "h:MM AM/PM" (empty string for null). */
export function fmtTimeOfDay(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Current time-of-day "HH:MM" in an IANA zone (24h, no midnight quirk). */
export function nowTimeInZone(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Current date "YYYY-MM-DD" in an IANA zone. */
export function todayInZone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
