"use client";

import { useState, useTransition } from "react";

type Slot = "cover" | "hero" | "before" | "after";
export type PhotoPick = { id: string; filename: string | null; href: string | null };

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "cover", label: "Cover" },
  { slot: "hero", label: "Hero (current)" },
  { slot: "before", label: "Before" },
  { slot: "after", label: "After" },
];

/**
 * The "Customer portfolio" panel: four named headline slots the customer's
 * portal leads with. Each shows its current photo (or empty) and a picker to
 * choose from the project's photos or clear it.
 */
export function PortfolioSlots({
  photos,
  values,
  action,
}: {
  photos: PhotoPick[];
  values: Record<Slot, string | null>;
  action: (slot: Slot, attachmentId: string | null) => Promise<{ error: string | null }>;
}) {
  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-body font-semibold">Customer portfolio</h4>
        <p className="text-meta text-faint">
          Choose the four photos that headline this project in the customer&apos;s portal.
          Picking a photo shares it automatically.
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SLOTS.map(({ slot, label }) => (
          <SlotPicker
            key={slot}
            label={label}
            photos={photos}
            value={values[slot]}
            action={(id) => action(slot, id)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotPicker({
  label,
  photos,
  value,
  action,
}: {
  label: string;
  photos: PhotoPick[];
  value: string | null;
  action: (attachmentId: string | null) => Promise<{ error: string | null }>;
}) {
  const [selected, setSelected] = useState<string | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = photos.find((p) => p.id === selected);

  const choose = (id: string | null) => {
    if (pending) return;
    const prev = selected;
    setSelected(id);
    setError(null);
    start(async () => {
      const res = await action(id);
      if (res.error) {
        setSelected(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        {label}
      </span>
      <div className="aspect-[4/3] rounded-[8px] border border-line overflow-hidden bg-line-2 grid place-items-center">
        {current?.href ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.href} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-meta text-faint">Empty</span>
        )}
      </div>
      <select
        value={selected ?? ""}
        disabled={pending}
        onChange={(e) => choose(e.target.value || null)}
        className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent disabled:opacity-60"
      >
        <option value="">— none —</option>
        {photos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.filename ?? "Photo"}
          </option>
        ))}
      </select>
      {error && <span className="text-chip text-[#b42318]">{error}</span>}
    </div>
  );
}
