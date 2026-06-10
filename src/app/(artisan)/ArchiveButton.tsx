"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Archive control with an inline confirm step (no native dialog, so it's
 * automation- and keyboard-friendly). `action` is a bound archive Server Action
 * that soft-deletes via archived_at and redirects to the list.
 */
export function ArchiveButton({
  action,
  noun = "item",
}: {
  action: () => Promise<void>;
  noun?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Archive
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-meta text-muted">Archive this {noun}?</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-[#b42318] disabled:opacity-60"
        onClick={() => start(() => action())}
      >
        {pending ? "Archiving…" : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}
