/**
 * A Company Rep is a staff member surfaced as a bridge contact
 * (contacts.type = 'rep'). These helpers keep the rep/customer split pure and
 * testable; the loaders and UI consume them.
 */

/** Split a project's attached contacts into customers (everything else) vs reps. */
export function partitionContacts<T extends { type: string }>(
  contacts: T[]
): { customers: T[]; reps: T[] } {
  const customers: T[] = [];
  const reps: T[] = [];
  for (const c of contacts) {
    if (c.type === "rep") reps.push(c);
    else customers.push(c);
  }
  return { customers, reps };
}

/** Staff not yet assigned as a rep on this project (matched by user_id). */
export function availableStaff<
  S extends { user_id: string },
  R extends { user_id: string | null }
>(staff: S[], reps: R[]): S[] {
  const taken = new Set(reps.map((r) => r.user_id).filter(Boolean));
  return staff.filter((s) => !taken.has(s.user_id));
}
