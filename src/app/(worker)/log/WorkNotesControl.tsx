"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { addJobWorkNote, updateJobWorkNote, removeJobWorkNote } from "./actions";

type Note = { id: string; body: string; dateLabel: string };

export function WorkNotesControl({ jobId, notes }: { jobId: string; notes: Note[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const msg = await addJobWorkNote(jobId, body);
      if (typeof msg === "string") setError(msg);
      else setBody("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <textarea
          placeholder="What did you do? (e.g. Primary Bedroom - Rough wired)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className={`${fieldInput} resize-y`}
        />
        <Button type="button" disabled={pending || !body.trim()} onClick={add} className="self-end">
          Add note
        </Button>
        <FormError message={error} />
      </Card>

      <div className="flex flex-col">
        {notes.length === 0 ? (
          <p className="text-meta text-faint py-2">No notes yet.</p>
        ) : (
          notes.map((n) => <WorkNoteRow key={n.id} jobId={jobId} note={n} />)
        )}
      </div>
    </div>
  );
}

function WorkNoteRow({ jobId, note }: { jobId: string; note: Note }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const msg = await updateJobWorkNote(note.id, jobId, body);
      if (typeof msg === "string") setError(msg);
      else setEditing(false);
    });
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-2 border-b border-line-2 last:border-b-0">
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
          <div className="flex items-center gap-3 self-end text-meta">
            <button type="button" disabled={pending || !body.trim()} onClick={save} className="text-accent font-semibold">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBody(note.body);
                setError(null);
              }}
              className="text-faint"
            >
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="text-body flex-1 min-w-0 whitespace-pre-wrap">{note.body}</span>
            <div className="flex items-center gap-3 text-meta shrink-0">
              <button type="button" onClick={() => setEditing(true)} className="text-muted hover:text-text">
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await removeJobWorkNote(note.id, jobId); })}
                className="text-faint hover:text-[#b42318]"
              >
                Remove
              </button>
            </div>
          </div>
          <span className="text-[11px] text-faint">{note.dateLabel}</span>
        </>
      )}
    </div>
  );
}
