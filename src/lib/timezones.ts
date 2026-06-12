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
