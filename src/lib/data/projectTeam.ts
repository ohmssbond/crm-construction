export type TeamPerson = { name: string; email: string | null };
export type PartnerGroup = { company: string | null; people: TeamPerson[] };
export type ProjectTeam = {
  tenant: TeamPerson[];
  partners: PartnerGroup[];
  customer: TeamPerson[];
};

/** Raw row shape returned by the `portal_project_team` RPC. */
export type TeamRow = {
  id: string;
  name: string;
  email: string | null;
  type: string;
  company: string | null;
};

const byName = (a: TeamPerson, b: TeamPerson) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const person = (r: TeamRow): TeamPerson => ({ name: r.name, email: r.email });

/**
 * Shape flat project-team rows into the three portal sections:
 *   - tenant   (type='rep'), sorted by name
 *   - partners (type='partner'), grouped by company then sorted by name;
 *     companies sorted case-insensitively with the no-company group last
 *   - customer (type='customer'), sorted by name
 * Rows of any other type (e.g. 'prospect') are ignored.
 */
export function groupProjectTeam(rows: TeamRow[]): ProjectTeam {
  const tenant = rows.filter((r) => r.type === "rep").map(person).sort(byName);
  const customer = rows.filter((r) => r.type === "customer").map(person).sort(byName);

  const byCompany = new Map<string | null, TeamPerson[]>();
  for (const r of rows.filter((r) => r.type === "partner")) {
    const company = r.company?.trim() ? r.company.trim() : null;
    const bucket = byCompany.get(company) ?? [];
    bucket.push(person(r));
    byCompany.set(company, bucket);
  }

  const named = [...byCompany.keys()]
    .filter((c): c is string => c !== null)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const order: (string | null)[] = byCompany.has(null) ? [...named, null] : named;

  const partners: PartnerGroup[] = order.map((company) => ({
    company,
    people: (byCompany.get(company) ?? []).sort(byName),
  }));

  return { tenant, partners, customer };
}
