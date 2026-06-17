/** "HH:MM[:SS]" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
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
