"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { TypeChip, LoginChip, type ContactType } from "@/components/ui/Chip";
import { Note } from "@/components/ui/Note";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { contactName, contactInitials } from "@/lib/data/format";

type Attached = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  type: string;
  user_id: string | null;
};
type Available = { id: string; first_name: string | null; last_name: string | null; email: string | null };

export function ContactManager({
  attached,
  available,
  attachAction,
  detachAction,
}: {
  attached: Attached[];
  available: Available[];
  attachAction: (contactId: string) => Promise<void>;
  detachAction: (contactId: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState("");

  const attach = () => {
    if (!selected) return;
    start(async () => {
      await attachAction(selected);
      setSelected("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Note>
        Attaching a contact is what <strong>grants portal access</strong> to this project.
        Detaching removes it.
      </Note>

      {attached.length === 0 ? (
        <EmptyState glyph="👤" title="No contacts attached." />
      ) : (
        <Card>
          {attached.map((c) => {
            const name = contactName(c);
            return (
              <ListRow
                key={c.id}
                leading={<Avatar initials={contactInitials(name)} />}
                title={name}
                sub={c.email ?? undefined}
                meta={
                  <div className="flex items-center gap-2">
                    <TypeChip type={c.type as ContactType} />
                    <LoginChip status={c.user_id ? "active" : "none"} />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(() => detachAction(c.id))}
                    >
                      Remove
                    </Button>
                  </div>
                }
              />
            );
          })}
        </Card>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`${fieldInput} max-w-[280px]`}
          >
            <option value="">Attach an existing contact…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {contactName(c)}
              </option>
            ))}
          </select>
          <Button variant="ghost" disabled={pending || !selected} onClick={attach}>
            Attach
          </Button>
        </div>
      )}
    </div>
  );
}
