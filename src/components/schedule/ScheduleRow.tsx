"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";
import { fmtScheduleDate, fmtProjected } from "@/lib/data/format";
import type { ScheduleFields } from "@/lib/data/schedule";

/**
 * One schedule row — a phase or one of its tasks. Both levels carry the same fields,
 * so one component renders both; `variant` controls weight and indent.
 *
 * Editing reuses the shipped inline edit-in-place pattern (TaskRow + updateTodo):
 * click Edit, the row becomes inputs, Save/Cancel. Omitting the action props renders
 * a read-only row — that is how the portal uses it.
 */
export function ScheduleRow({
  variant,
  name,
  projectedDate,
  projectedNote,
  startDate,
  completeDate,
  updateAction,
  deleteAction,
  moveAction,
}: {
  variant: "phase" | "task";
  name: string;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
  updateAction?: (fields: ScheduleFields) => Promise<void>;
  deleteAction?: () => Promise<void>;
  moveAction?: (dir: "up" | "down") => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const [draftName, setDraftName] = useState(name);
  const [draftProjected, setDraftProjected] = useState(projectedDate ?? "");
  const [draftNote, setDraftNote] = useState(projectedNote ?? "");
  const [draftStart, setDraftStart] = useState(startDate ?? "");
  const [draftComplete, setDraftComplete] = useState(completeDate ?? "");

  const isPhase = variant === "phase";
  const done = completeDate !== null;

  const startEdit = () => {
    setDraftName(name);
    setDraftProjected(projectedDate ?? "");
    setDraftNote(projectedNote ?? "");
    setDraftStart(startDate ?? "");
    setDraftComplete(completeDate ?? "");
    setEditing(true);
  };

  const save = () => {
    if (!draftName.trim() || !updateAction) return;
    start(async () => {
      await updateAction({
        name: draftName,
        projectedDate: draftProjected || null,
        projectedNote: draftNote || null,
        startDate: draftStart || null,
        completeDate: draftComplete || null,
      });
      setEditing(false);
    });
  };

  const rowClass = `flex flex-wrap items-center gap-x-4 gap-y-2 px-[15px] py-[11px] border-b border-line-2 last:border-b-0 ${
    isPhase ? "bg-[#fafbfc]" : "pl-[34px]"
  }`;

  if (editing) {
    return (
      <div className={rowClass}>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          disabled={pending}
          aria-label={isPhase ? "Phase name" : "Task name"}
          className={`${fieldInput} flex-1 min-w-[150px]`}
        />
        <input
          type="date"
          value={draftProjected}
          onChange={(e) => setDraftProjected(e.target.value)}
          disabled={pending}
          aria-label="Projected completion date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <input
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          disabled={pending}
          placeholder="note"
          aria-label="Projected completion note"
          className={`${fieldInput} w-[150px] text-meta py-[5px]`}
        />
        <input
          type="date"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
          disabled={pending}
          aria-label="Start date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <input
          type="date"
          value={draftComplete}
          onChange={(e) => setDraftComplete(e.target.value)}
          disabled={pending}
          aria-label="Complete date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !draftName.trim()}
          className="text-meta font-semibold text-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-meta text-faint hover:text-body"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <span
        className={`flex-1 min-w-[140px] ${isPhase ? "text-body font-semibold" : "text-body"} ${
          done ? "text-faint" : ""
        }`}
      >
        {done && <span className="text-accent mr-1">✓</span>}
        {name}
      </span>

      <DateCell label="Projected" value={fmtProjected(projectedDate, projectedNote)} />
      <DateCell label="Start" value={fmtScheduleDate(startDate)} />
      <DateCell label="Complete" value={fmtScheduleDate(completeDate)} />

      {moveAction && (
        <span className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => start(() => moveAction("up"))}
            disabled={pending}
            aria-label={`Move ${variant} up`}
            className="text-meta text-faint hover:text-accent disabled:opacity-60"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => start(() => moveAction("down"))}
            disabled={pending}
            aria-label={`Move ${variant} down`}
            className="text-meta text-faint hover:text-accent disabled:opacity-60"
          >
            ↓
          </button>
        </span>
      )}

      {updateAction && (
        <button
          type="button"
          onClick={startEdit}
          disabled={pending}
          aria-label={`Edit ${variant}`}
          className="text-meta text-faint hover:text-accent disabled:opacity-60"
        >
          Edit
        </button>
      )}

      {deleteAction &&
        (confirming ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-meta text-muted">
              {isPhase ? "Delete this phase and its tasks?" : "Delete this task?"}
            </span>
            <button
              type="button"
              onClick={() => start(() => deleteAction())}
              disabled={pending}
              className="text-meta font-semibold text-[#b42318] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-meta text-faint hover:text-body"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            aria-label={`Delete ${variant}`}
            className="text-meta text-faint hover:text-[#b42318] disabled:opacity-60"
          >
            Delete
          </button>
        ))}
    </div>
  );
}

/** A labeled date cell. Wraps rather than forming a rigid column, so it survives a phone. */
function DateCell({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="text-meta text-faint whitespace-nowrap">
      <span className="text-muted font-semibold">{label}</span> {value ?? "—"}
    </span>
  );
}
