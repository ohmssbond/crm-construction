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
  // How far the target zone runs from UTC at that instant. Deliberately NOT the
  // `new Date(x.toLocaleString("en-US", { timeZone }))` round-trip idiom: that
  // parses a locale string back into a Date using the HOST runtime's OWN default
  // timezone, relying on that offset cancelling out between two such parses. It
  // silently breaks when the host's default zone (not the target zone) has a
  // spring-forward transition on the same calendar date and the intermediate
  // wall-clock string falls in the skipped hour — Node then parses it under
  // whichever offset it falls back to, which is wrong. Reading the target zone's
  // wall-clock directly via Intl.DateTimeFormat + formatToParts and computing the
  // offset arithmetically sidesteps the host zone entirely.
  const offsetMs = zoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offsetMs).toISOString();
}

/**
 * The target zone's UTC offset (in ms, positive when the zone is ahead of UTC)
 * at the given instant, computed by reading how the zone renders that instant's
 * wall-clock and comparing it to the instant itself — no host-timezone round-trip.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // hour12:false can render midnight as "24" instead of "00" — normalize.
  const hour = Number(get("hour")) % 24;
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    hour,
    Number(get("minute")),
    Number(get("second"))
  );
  return asUtc - instant.getTime();
}

/** Today's calendar date in that zone, as "YYYY-MM-DD" (en-CA renders ISO order). */
export function todayInZone(timeZone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}
