"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Collapsible "Archived (N)" section with a Restore action per row. Shared by the
 * project/customer/contact lists. `restoreAction` is a Server Action called with
 * the row id; it clears archived_at and revalidates, so the row moves back to the
 * active list on the next render.
 */
export function ArchivedSection({
  items,
  restoreAction,
}: {
  items: { id: string; label: string }[];
  restoreAction: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-meta text-muted font-semibold hover:text-text"
      >
        {open ? "▾" : "▸"} Archived ({items.length})
      </button>
      {open && (
        <Card>
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-3 px-4 py-[11px] border-b border-line-2 last:border-b-0"
            >
              <span className="text-body text-muted truncate">{it.label}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => start(() => restoreAction(it.id))}
              >
                Restore
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
