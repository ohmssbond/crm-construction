"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { SearchField } from "@/components/ui/SearchField";
import { FilterChips } from "@/components/ui/FilterChips";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { projectMeta } from "@/lib/data/format";
import { ArchivedSection } from "../ArchivedSection";

type Project = {
  id: string;
  name: string;
  stage: string;
  start_date: string | null;
  end_date: string | null;
  customerName: string;
  contactCount: number;
  coverHref: string | null;
};

const STAGE_FILTERS: Record<string, string | null> = {
  All: null,
  Proposal: "proposal",
  Signed: "signed",
  "In progress": "in_progress",
  Completed: "completed",
};

export function ProjectList({
  projects,
  archived,
  restoreAction,
}: {
  projects: Project[];
  archived: { id: string; name: string }[];
  restoreAction: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [stageLabel, setStageLabel] = useState("All");
  const query = q.trim().toLowerCase();
  const stage = STAGE_FILTERS[stageLabel];

  const filtered = projects.filter((p) => {
    if (stage && p.stage !== stage) return false;
    if (query && !`${p.name} ${p.customerName}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder="Search projects…" value={q} onChange={setQ} />
        <Link href="/projects/new" className={`${buttonClasses()} hidden lg:inline-flex shrink-0`}>
          ＋ New project
        </Link>
      </div>
      <FilterChips
        options={Object.keys(STAGE_FILTERS)}
        value={stageLabel}
        onChange={setStageLabel}
      />

      {projects.length === 0 ? (
        <EmptyState glyph="📂" title="No projects yet." />
      ) : filtered.length === 0 ? (
        <EmptyState glyph="🔍" title="No matches." />
      ) : (
        <Card>
          {filtered.map((p) => {
            const meta = projectMeta(p);
            return (
              <ListRow
                key={p.id}
                href={`/projects/${p.id}`}
                leading={
                  p.coverHref ? (
                    <Thumb className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.coverHref}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </Thumb>
                  ) : (
                    <Thumb>
                      <FolderKanban size={18} />
                    </Thumb>
                  )
                }
                title={p.name}
                sub={`${p.customerName} · ${p.contactCount} contact${p.contactCount === 1 ? "" : "s"}`}
                meta={
                  <>
                    <StageChip stage={p.stage as Stage} />
                    {meta && <div className="mt-[5px]">{meta}</div>}
                  </>
                }
              />
            );
          })}
        </Card>
      )}

      <ArchivedSection
        items={archived.map((a) => ({ id: a.id, label: a.name }))}
        restoreAction={restoreAction}
      />
    </div>
  );
}
