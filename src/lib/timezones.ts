export type TimezoneOption = { value: string; label: string };

/** Curated US timezones offered in Settings. `value` is an IANA zone id. */
export const TIMEZONES: TimezoneOption[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain – no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export const DEFAULT_TIMEZONE = "America/New_York";

export function isValidTimezone(value: string): boolean {
  return TIMEZONES.some((t) => t.value === value);
}

/**
 * "2026-08-01" + an IANA zone → the UTC ISO instant of NOON that day in that zone.
 *
 * Noon is deliberate. It sits far from both midnight and any DST transition, so the
 * single offset correction below is always right and the rendered date can never slip
 * a day for a viewer in a neighbouring zone. Anchoring at midnight would be fragile on
 * both counts.
 */
export function noonInZone(date: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // How far the target zone runs from UTC at that instant.
  const asZone = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (asZone.getTime() - asUtc.getTime())).toISOString();
}

/** Today's calendar date in that zone, as "YYYY-MM-DD" (en-CA renders ISO order). */
export function todayInZone(timeZone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}
