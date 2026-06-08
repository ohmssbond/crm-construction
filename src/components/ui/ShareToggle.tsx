"use client";

import { useState, useTransition } from "react";

/**
 * The one control for `is_shared`. New content defaults to Private.
 *
 * - Uncontrolled (default): manages its own optimistic state. Pass `action` to
 *   persist each flip (e.g. a bound Server Action).
 * - Controlled: pass `shared` and the parent owns the value (Composer uses this
 *   so it can read the value at submit time); `action` receives the next value.
 */
export function ShareToggle({
  defaultShared = false,
  shared: controlled,
  compact = false,
  action,
}: {
  defaultShared?: boolean;
  shared?: boolean;
  compact?: boolean;
  action?: (shared: boolean) => void | Promise<void>;
}) {
  const [internal, setInternal] = useState(defaultShared);
  const [pending, start] = useTransition();
  const on = controlled ?? internal;
  const text = compact ? (on ? "◉" : "○") : on ? "◉ Shared" : "○ Private";

  const flip = () => {
    const next = !on;
    if (controlled === undefined) setInternal(next);
    if (action) start(() => void action(next));
  };

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      onClick={flip}
      className={`inline-flex items-center gap-[6px] rounded-full text-chip font-semibold px-[10px] py-[4px] border disabled:opacity-60 ${
        on ? "bg-accent text-white border-transparent" : "bg-surface text-muted border-line"
      }`}
    >
      {text}
    </button>
  );
}
