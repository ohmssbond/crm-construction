import type { SupabaseClient } from "@supabase/supabase-js";
import { isImageAttachment } from "./portfolio";

type AttachmentRef = {
  kind: string;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
};

const BUCKET = "project-files";
const SIGNED_URL_TTL = 60 * 60; // 1h
// resize:"contain" scales proportionally to fit the width, preserving aspect
// ratio. Without it Supabase defaults to "cover", which — given only a width —
// pins the width but keeps the original height, squishing the image (e.g. a
// 4080x3072 photo becomes 600x3072). CSS object-cover then crops from a correctly
// proportioned image.
const THUMB = { width: 600, quality: 60, resize: "contain" as const };

/** Sign a single transformed (resized) image variant — /render/image/ URL. */
export async function signImageVariant(
  supabase: SupabaseClient,
  storagePath: string,
  transform: { width: number; quality: number; resize?: "cover" | "contain" | "fill" }
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL, { transform });
  return data?.signedUrl ?? null;
}

/**
 * Resolves a viewable `href` (raw URL for links, batched full-res signed URL for
 * files) and, for image files, a small `thumbHref` (600px transformed URL) for
 * grids/tiles. Full URLs are signed in one batch; thumbnails are signed per-image
 * because the batch endpoint ignores the transform option.
 */
export async function withAttachmentUrls<T extends AttachmentRef>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<(T & { href: string | null; thumbHref: string | null })[]> {
  const files = rows.filter((r) => r.kind === "file" && r.storage_path);
  const filePaths = files.map((r) => r.storage_path as string);

  const signed: Record<string, string> = {};
  if (filePaths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(filePaths, SIGNED_URL_TTL);
    data?.forEach((s) => {
      if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
    });
  }

  // Thumbnails are signed one-per-image (the batch endpoint ignores transforms),
  // so this fans out N Storage round-trips per render — fine for today's modest
  // galleries (a handful to a few dozen), all in parallel (~one RTT wall-clock).
  // Concurrency is unbounded: if galleries ever grow large (100s), cap it (chunk
  // or p-limit) before Storage rate limits / tail latency bite.
  const thumbs: Record<string, string> = {};
  await Promise.all(
    files.filter(isImageAttachment).map(async (r) => {
      const path = r.storage_path as string;
      const url = await signImageVariant(supabase, path, THUMB);
      if (url) thumbs[path] = url;
    })
  );

  return rows.map((r) => ({
    ...r,
    href: r.kind === "link" ? r.url : r.storage_path ? (signed[r.storage_path] ?? null) : null,
    thumbHref:
      r.kind === "file" && r.storage_path ? (thumbs[r.storage_path] ?? null) : null,
  }));
}

type Categorized = { category: string };
type CategoryRef = { key: string; label: string };

/**
 * Groups attachments by their category for display. Builds a group only for
 * categories present in `attachments` (empty categories are omitted), resolves
 * each group's display `label` from `categories` (falling back to the raw key),
 * and returns the groups ordered alphabetically by label. Item order within a
 * group is preserved from the input — callers pass attachments already sorted
 * newest-first, so groups inherit that order.
 */
export function groupAttachmentsByType<T extends Categorized>(
  attachments: T[],
  categories: CategoryRef[]
): { key: string; label: string; items: T[] }[] {
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const order: string[] = [];
  const byKey = new Map<string, T[]>();

  for (const a of attachments) {
    let bucket = byKey.get(a.category);
    if (!bucket) {
      bucket = [];
      byKey.set(a.category, bucket);
      order.push(a.category);
    }
    bucket.push(a);
  }

  return order
    .map((key) => ({
      key,
      label: labelByKey.get(key) ?? key,
      items: byKey.get(key) as T[],
    }))
    .sort((x, y) =>
      x.label.localeCompare(y.label, undefined, { sensitivity: "base" })
    );
}
