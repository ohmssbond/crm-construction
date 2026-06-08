/**
 * Normalize an embedded PostgREST relation to a single row.
 *
 * supabase-js types many-to-one embeds (e.g. `projects.select("customer:customers(name)")`)
 * as arrays, even though PostgREST returns a single object for them at runtime.
 * `one()` accepts either shape and returns the single row (or null).
 */
export function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
