"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { addJobMaterial, updateJobMaterialQty, removeJobMaterial } from "./actions";

type Line = { id: string; item: string; qty: number; material_id: string | null };
type Material = { id: string; name: string };

export function MaterialsControl({
  jobId,
  lines,
  catalog,
}: {
  jobId: string;
  lines: Line[];
  catalog: Material[];
}) {
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const msg = await addJobMaterial(jobId, materialId, qty);
      if (typeof msg === "string") {
        setError(msg);
      } else {
        setMaterialId("");
        setQty("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className={fieldInput}
        >
          <option value="">Add a material…</option>
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={fieldInput}
          />
          <Button type="button" disabled={pending || !materialId || !qty} onClick={add}>
            Add
          </Button>
        </div>
        <FormError message={error} />
      </Card>

      <div className="flex flex-col">
        {lines.length === 0 ? (
          <p className="text-meta text-faint py-2">No materials logged yet.</p>
        ) : (
          lines.map((line) => <MaterialLineRow key={line.id} jobId={jobId} line={line} />)
        )}
      </div>
    </div>
  );
}

function MaterialLineRow({ jobId, line }: { jobId: string; line: Line }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(line.qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const msg = await updateJobMaterialQty(line.id, jobId, qty);
      if (typeof msg === "string") setError(msg);
      else setEditing(false);
    });
  }

  function remove() {
    start(async () => {
      await removeJobMaterial(line.id, jobId);
    });
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-2 border-b border-line-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2 text-meta">
        <span className="flex-1 min-w-0 truncate">{line.item}</span>
        {editing ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-20 rounded-control border border-line bg-surface px-2 py-1 text-body outline-none focus:border-accent"
            />
            <button type="button" disabled={pending} onClick={save} className="text-accent font-semibold">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setQty(String(line.qty));
                setError(null);
              }}
              className="text-faint"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-faint">{line.qty}</span>
            <button type="button" onClick={() => setEditing(true)} className="text-muted hover:text-text">
              Edit
            </button>
            <button type="button" disabled={pending} onClick={remove} className="text-faint hover:text-[#b42318]">
              Remove
            </button>
          </>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}
