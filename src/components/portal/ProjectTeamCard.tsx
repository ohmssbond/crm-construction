import { type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { monogram } from "@/lib/data/format";
import type { ProjectTeam, TeamPerson } from "@/lib/data/projectTeam";

function PersonRow({ person }: { person: TeamPerson }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar initials={monogram(person.name)} />
      <div className="flex flex-col">
        <span className="text-body font-semibold">{person.name}</span>
        {person.email && <span className="text-meta text-faint">{person.email}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        {title}
      </span>
      {children}
    </div>
  );
}

export function ProjectTeamCard({
  team,
  orgName,
  clientNoun,
}: {
  team: ProjectTeam;
  orgName: string;
  clientNoun: string;
}) {
  const hasPartners = team.partners.some((g) => g.people.length > 0);
  const hasAny = team.tenant.length > 0 || hasPartners || team.customer.length > 0;
  if (!hasAny) return null;

  return (
    <Card>
      <div className="p-4 flex flex-col gap-5">
        <span className="text-body font-semibold">Your Project Team</span>

        {team.tenant.length > 0 && (
          <Section title={orgName}>
            {team.tenant.map((p) => (
              <PersonRow key={p.email ?? p.name} person={p} />
            ))}
          </Section>
        )}

        {hasPartners && (
          <Section title="Partners">
            {team.partners.map((g) => (
              <div key={g.company ?? "__none__"} className="flex flex-col gap-2">
                {g.company && (
                  <span className="text-meta font-semibold text-faint">{g.company}</span>
                )}
                {g.people.map((p) => (
                  <PersonRow key={p.email ?? p.name} person={p} />
                ))}
              </div>
            ))}
          </Section>
        )}

        {team.customer.length > 0 && (
          <Section title={clientNoun}>
            {team.customer.map((p) => (
              <PersonRow key={p.email ?? p.name} person={p} />
            ))}
          </Section>
        )}
      </div>
    </Card>
  );
}
