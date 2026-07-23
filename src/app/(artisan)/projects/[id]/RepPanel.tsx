"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { Note } from "@/components/ui/Note";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { contactInitials } from "@/lib/data/format";

type Rep = {
  id: string;
  name: string;
  email: string | null;
};
type Staff = { user_id: string; full_name: string; email: string };

export function RepPanel({
  reps,
  availableStaff,
  assignAction,
  removeAction,
}: {
  reps: Rep[];
  availableStaff: Staff[];
  assignAction: (userId: string) => Promise<void>;
  removeAction: (contactId: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState("");

  const assign = () => {
    if (!selected) return;
    start(async () => {
      await assignAction(selected);
      setSelected("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Note>
        Company Reps are your <strong>staff</strong> assigned to this project. They can be
        given tasks and are shown to the customer as their point of contact.
      </Note>

      {reps.length === 0 ? (
        <EmptyState glyph="👷" title="No reps assigned." />
      ) : (
        <Card>
          {reps.map((r) => {
            const name = r.name;
            return (
              <ListRow
                key={r.id}
                leading={<Avatar initials={contactInitials(name)} />}
                title={name}
                sub={r.email ?? undefined}
                meta={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => start(() => removeAction(r.id))}
                  >
                    Remove
                  </Button>
                }
              />
            );
          })}
        </Card>
      )}

      {availableStaff.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`${fieldInput} max-w-[280px]`}
          >
            <option value="">Assign a staff member…</option>
            {availableStaff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <Button variant="ghost" disabled={pending || !selected} onClick={assign}>
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}
