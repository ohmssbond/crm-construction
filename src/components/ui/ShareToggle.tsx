"use client";

import { useState } from "react";

/**
 * The one control for `is_shared`. New content defaults to Private.
 * Optimistic local flip; persistence wires in with the real data layer.
 */
export function ShareToggle({
  defaultShared = false,
  compact = false,
}: {
  defaultShared?: boolean;
  compact?: boolean;
}) {
  const [on, setOn] = useState(defaultShared);
  const text = compact ? (on ? "◉" : "○") : on ? "◉ Shared" : "○ Private";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      className={`inline-flex items-center gap-[6px] rounded-full text-chip font-semibold px-[10px] py-[4px] border ${
        on ? "bg-accent text-white border-transparent" : "bg-surface text-muted border-line"
      }`}
    >
      {text}
    </button>
  );
}
