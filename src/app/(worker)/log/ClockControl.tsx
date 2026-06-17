"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { fmtTimeOfDay } from "@/lib/data/worktime";
import { clockIn, clockOut } from "./actions";

/** Browser-local "HH:MM" used only as a convenience default for the picker. */
function localNowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ClockControl({
  jobId,
  openSegment,
}: {
  jobId: string;
  openSegment: { time_in: string } | null;
}) {
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const out = !!openSegment;
  const label = out ? "Clock out" : "Clock in";
  const variant = out ? "ghost" : "primary";

  function run(atTime?: string) {
    setError(null);
    start(async () => {
      const msg = out ? await clockOut(jobId, atTime) : await clockIn(jobId, atTime);
      if (typeof msg === "string") {
        setError(msg);
      } else {
        setPicking(false);
        setTime("");
      }
    });
  }

  function openPicker() {
    setError(null);
    setTime(localNowHHMM());
    setPicking(true);
  }

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={out ? "text-meta text-accent font-semibold" : "text-meta text-muted"}>
          {out ? `On the job since ${fmtTimeOfDay(openSegment.time_in)}` : "Not on the job right now"}
        </span>
        {!picking && (
          <Button size="sm" variant={variant} type="button" disabled={pending} onClick={() => run()}>
            {label}
          </Button>
        )}
      </div>

      {!picking ? (
        <button
          type="button"
          className="text-meta text-faint hover:text-muted self-end"
          onClick={openPicker}
        >
          pick a time
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldInput}
            />
            <Button
              size="sm"
              variant={variant}
              type="button"
              disabled={pending || !time}
              onClick={() => run(time)}
            >
              {label}
            </Button>
            <button
              type="button"
              className="text-meta text-faint hover:text-muted"
              onClick={() => {
                setPicking(false);
                setError(null);
              }}
            >
              cancel
            </button>
          </div>
          <FormError message={error} />
        </div>
      )}
    </Card>
  );
}
