"use client";

import { useState, type ReactNode } from "react";

export type TabPanel = { label: string; content: ReactNode };

/**
 * Tabs take pre-rendered panels (ReactNode), not a render function, so a
 * Server Component can pass them across the client boundary.
 */
export function Tabs({ tabs }: { tabs: TabPanel[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 text-body font-semibold px-[13px] py-[11px] border-b-2 ${
              i === active ? "text-accent border-accent" : "text-muted border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs[active]?.content}</div>
    </div>
  );
}
