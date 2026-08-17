// The one place contact types are enumerated. Before this module the list was spelled
// out in five places (the form's options, the list's filter chips, and two validation
// allowlists) and the Company rule in three — so adding a type meant editing eight
// sites, and a missed allowlist would let the form offer a type the server rejects.
//
// `rep` is deliberately absent: it is a bridge row created only by assignRep, and must
// never be selectable in the contact form. Chip.tsx widens its own type to include it
// for display.

export type SelectableContactType =
  | "customer"
  | "partner"
  | "prospect"
  | "government"
  | "other";

/** Selectable types, in the order the form and the filter chips present them. */
export const CONTACT_TYPES: { value: SelectableContactType; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "partner", label: "Partner" },
  { value: "prospect", label: "Prospect" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

/**
 * Types that carry a Company. An agency name needs somewhere to live that isn't the
 * last-name field. A customer is a person and a rep is the tenant's own staff, so
 * neither gets one.
 */
const WITH_COMPANY = new Set<string>(["partner", "government", "other"]);

export function typeHasCompany(type: string): boolean {
  return WITH_COMPANY.has(type);
}

/** Whether a submitted string is a type a user may choose. Excludes `rep`. */
export function isSelectableContactType(type: string): boolean {
  return CONTACT_TYPES.some((t) => t.value === type);
}
