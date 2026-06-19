"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { setWorkerName } from "./actions";

export function WorkerNameForm({ userId, initial }: { userId: string; initial: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${fieldInput} max-w-[180px]`}
        />
        <Button
          size="sm"
          type="button"
          disabled={pending || name.trim() === initial.trim()}
          onClick={() => {
            setError(null);
            start(async () => {
              const msg = await setWorkerName(userId, name);
              if (typeof msg === "string") setError(msg);
            });
          }}
        >
          Save
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}
