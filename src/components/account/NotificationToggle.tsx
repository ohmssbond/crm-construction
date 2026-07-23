"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { setProjectUpdateNotifications } from "@/lib/auth-actions";

/**
 * A single opt-out toggle for project-update emails. Optimistic: flips locally,
 * then persists; reverts on error. Shared by the portal account page and the
 * artisan settings page.
 */
export function NotificationToggle({ defaultOn }: { defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const res = await setProjectUpdateNotifications(next);
      if (res.error) {
        setOn(!next);
        setError(res.error);
      }
    });
  };

  return (
    <Card className="p-4 flex flex-col gap-2">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          onChange={toggle}
          disabled={pending}
          className="accent-[var(--accent)] size-4"
        />
        <span className="text-body">Email me when a project I&rsquo;m on is updated</span>
      </label>
      {error && <p className="text-meta text-[#b42318]">{error}</p>}
    </Card>
  );
}
