"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchField } from "@/components/ui/SearchField";
import { FilterChips } from "@/components/ui/FilterChips";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { TypeChip, LoginChip, type ContactType } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { contactName, contactInitials } from "@/lib/data/format";
import { ArchivedSection } from "../ArchivedSection";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  type: string;
  user_id: string | null;
};
type ArchivedContact = { id: string; first_name: string | null; last_name: string | null; email: string | null };

const TYPE_FILTERS: Record<string, string | null> = {
  All: null,
  Partner: "partner",
  Prospect: "prospect",
  Customer: "customer",
};

export function ContactList({
  contacts,
  archived,
  restoreAction,
}: {
  contacts: Contact[];
  archived: ArchivedContact[];
  restoreAction: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [typeLabel, setTypeLabel] = useState("All");
  const query = q.trim().toLowerCase();
  const type = TYPE_FILTERS[typeLabel];

  const filtered = contacts.filter((c) => {
    if (type && c.type !== type) return false;
    if (query && !`${contactName(c)} ${c.email ?? ""}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder="Search contacts…" value={q} onChange={setQ} />
        <Link href="/contacts/new" className={`${buttonClasses()} hidden lg:inline-flex shrink-0`}>
          ＋ New contact
        </Link>
      </div>
      <FilterChips options={Object.keys(TYPE_FILTERS)} value={typeLabel} onChange={setTypeLabel} />

      {contacts.length === 0 ? (
        <EmptyState glyph="👤" title="No contacts yet." />
      ) : filtered.length === 0 ? (
        <EmptyState glyph="🔍" title="No matches." />
      ) : (
        <Card>
          {filtered.map((c) => {
            const name = contactName(c);
            return (
              <ListRow
                key={c.id}
                href={`/contacts/${c.id}`}
                leading={<Avatar initials={contactInitials(name)} />}
                title={name}
                sub={c.email ?? undefined}
                meta={
                  <div className="flex items-center gap-2">
                    <TypeChip type={c.type as ContactType} />
                    <LoginChip status={c.user_id ? "active" : "none"} />
                  </div>
                }
              />
            );
          })}
        </Card>
      )}

      <ArchivedSection
        items={archived.map((a) => ({ id: a.id, label: contactName(a) }))}
        restoreAction={restoreAction}
      />
    </div>
  );
}
