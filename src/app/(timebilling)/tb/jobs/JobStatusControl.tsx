"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";
import { setJobStatus } from "./actions";

export function JobStatusControl({ jobId, status }: { jobId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        start(() => setJobStatus(jobId, next));
      }}
      aria-label="Job status"
      className={`${fieldInput} max-w-[180px]`}
    >
      <option value="open">Open</option>
      <option value="in_progress">In progress</option>
      <option value="completed">Completed</option>
    </select>
  );
}
