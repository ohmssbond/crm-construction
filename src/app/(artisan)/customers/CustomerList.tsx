"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { SearchField } from "@/components/ui/SearchField";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArchivedSection } from "../ArchivedSection";

type Customer = { id: string; name: string; address: string | null; projectCount: number };

export function CustomerList({
  customers,
  archived,
  restoreAction,
  noun,
  nounPlural,
}: {
  customers: Customer[];
  archived: { id: string; name: string }[];
  restoreAction: (id: string) => Promise<void>;
  noun: string;
  nounPlural: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? customers.filter((c) => `${c.name} ${c.address ?? ""}`.toLowerCase().includes(query))
    : customers;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder={`Search ${nounPlural.toLowerCase()}…`} value={q} onChange={setQ} />
        <Link href="/customers/new" className={`${buttonClasses()} hidden lg:inline-flex shrink-0`}>
          ＋ New {noun.toLowerCase()}
        </Link>
      </div>

      {customers.length === 0 ? (
        <EmptyState glyph="🏢" title={`No ${nounPlural.toLowerCase()} yet.`} />
      ) : filtered.length === 0 ? (
        <EmptyState glyph="🔍" title="No matches." />
      ) : (
        <Card>
          {filtered.map((c) => (
            <ListRow
              key={c.id}
              href={`/customers/${c.id}`}
              leading={
                <Thumb>
                  <Building2 size={18} />
                </Thumb>
              }
              title={c.name}
              sub={c.address ?? undefined}
              meta={`${c.projectCount} project${c.projectCount === 1 ? "" : "s"}`}
            />
          ))}
        </Card>
      )}

      <ArchivedSection
        items={archived.map((a) => ({ id: a.id, label: a.name }))}
        restoreAction={restoreAction}
      />
    </div>
  );
}
