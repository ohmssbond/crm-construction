"use client";

import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const STAGE_OPTIONS = [
  { value: "proposal", label: "Proposal" },
  { value: "signed", label: "Signed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

/** Stage picker that persists each change via the bound Server Action. */
export function StageControl({
  current,
  action,
}: {
  current: string;
  action: (stage: string) => Promise<void>;
}) {
  const [, start] = useTransition();
  return (
    <SegmentedControl
      options={STAGE_OPTIONS}
      defaultValue={current}
      onChange={(v) => start(() => action(v))}
    />
  );
}
