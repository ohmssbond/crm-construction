import { describe, expect, test } from "vitest";
import { groupProjectTeam, type TeamRow } from "./projectTeam";

const rep = (name: string): TeamRow => ({ name, email: `${name}@t.co`, type: "rep", company: null });
const cust = (name: string): TeamRow => ({ name, email: `${name}@c.co`, type: "customer", company: null });
const partner = (name: string, company: string | null): TeamRow => ({
  name, email: `${name}@p.co`, type: "partner", company,
});

describe("groupProjectTeam", () => {
  test("splits rows into tenant / partners / customer by type", () => {
    const team = groupProjectTeam([rep("Rae"), cust("Cam"), partner("Pat", "ABC")]);
    expect(team.tenant.map((p) => p.name)).toEqual(["Rae"]);
    expect(team.customer.map((p) => p.name)).toEqual(["Cam"]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC"]);
    expect(team.partners[0].people.map((p) => p.name)).toEqual(["Pat"]);
  });

  test("groups partners by company, sorted case-insensitively", () => {
    const team = groupProjectTeam([
      partner("Sam", "zeta"),
      partner("Mike", "ABC"),
      partner("Sara", "ABC"),
    ]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC", "zeta"]);
    expect(team.partners[0].people.map((p) => p.name)).toEqual(["Mike", "Sara"]);
  });

  test("partners with blank/null company collect into a trailing null group", () => {
    const team = groupProjectTeam([
      partner("NoCo", "   "),
      partner("Mike", "ABC"),
      partner("Nullish", null),
    ]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC", null]);
    expect(team.partners[1].people.map((p) => p.name)).toEqual(["NoCo", "Nullish"]);
  });

  test("sorts people by name within each group", () => {
    const team = groupProjectTeam([rep("Zed"), rep("Ana")]);
    expect(team.tenant.map((p) => p.name)).toEqual(["Ana", "Zed"]);
  });

  test("returns empty groups for empty input", () => {
    expect(groupProjectTeam([])).toEqual({ tenant: [], partners: [], customer: [] });
  });

  test("drops prospect-type rows entirely", () => {
    const prospect: TeamRow = { name: "Prue", email: "prue@x.co", type: "prospect", company: null };
    const withProspect = groupProjectTeam([rep("Rae"), cust("Cam"), partner("Pat", "ABC"), prospect]);
    const withoutProspect = groupProjectTeam([rep("Rae"), cust("Cam"), partner("Pat", "ABC")]);
    expect(withProspect).toEqual(withoutProspect);
    expect(withProspect.tenant.map((p) => p.name)).toEqual(["Rae"]);
    expect(withProspect.customer.map((p) => p.name)).toEqual(["Cam"]);
    expect(withProspect.partners.map((g) => g.company)).toEqual(["ABC"]);
  });

  test("sorts customer group by name", () => {
    const team = groupProjectTeam([cust("Zed"), cust("Ana")]);
    expect(team.customer.map((p) => p.name)).toEqual(["Ana", "Zed"]);
  });
});
