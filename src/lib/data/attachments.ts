import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaderImages, isImageAttachment, resolveSlot } from "./portfolio";
import type { HeaderImage, HeaderSlot } from "./portfolio";

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
// Cap on simultaneous per-image thumbnail-signing requests within one call to
// withAttachmentUrls — see the comment at its call site below.
const THUMB_BATCH_SIZE = 10;

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
  // so this fans out N Storage round-trips per render. Concurrency is bounded to
  // batches of THUMB_BATCH_SIZE, awaited sequentially, so a large gallery (100s of
  // images, e.g. a staff project list with many covers) can't fire hundreds of
  // simultaneous Storage requests — trading some wall-clock time for staying well
  // under Storage rate limits / tail latency.
  const images = files.filter(isImageAttachment);
  const thumbs: Record<string, string> = {};
  for (let i = 0; i < images.length; i += THUMB_BATCH_SIZE) {
    const batch = images.slice(i, i + THUMB_BATCH_SIZE);
    await Promise.all(
      batch.map(async (r) => {
        const path = r.storage_path as string;
        const url = await signImageVariant(supabase, path, THUMB);
        if (url) thumbs[path] = url;
      })
    );
  }

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

/**
 * Resolve project cover photos in one batch: fetch the referenced attachments,
 * keep the images, sign them, and return them by id (for `resolveSlot`).
 *
 * `sharedOnly` is REQUIRED and differs per surface: the portal passes true (a
 * contact must never resolve an unshared cover), the artisan passes false (staff
 * see their own org's attachments — RLS `artisan_all` is the boundary). It is not
 * defaulted so neither caller can omit it by accident.
 */
export async function resolveCoverHrefs(
  supabase: SupabaseClient,
  coverIds: string[],
  opts: { sharedOnly: boolean }
): Promise<Map<string, { href: string | null; thumbHref: string | null }>> {
  const byId = new Map<string, { href: string | null; thumbHref: string | null }>();
  if (!coverIds.length) return byId;

  let query = supabase
    .from("attachments")
    .select("id, kind, mime_type, url, storage_path")
    .in("id", coverIds);
  if (opts.sharedOnly) query = query.eq("is_shared", true);

  const { data } = await query;
  const images = (data ?? []).filter(isImageAttachment);
  const signed = await withAttachmentUrls(supabase, images);
  signed.forEach((a) => byId.set(a.id, { href: a.href, thumbHref: a.thumbHref }));
  return byId;
}

/** The transform the project header uses — it fills a wide banner. */
const HEADER = { width: 1400, quality: 65, resize: "contain" as const };

/**
 * Resolve and sign all four portfolio slots at header size for the cycling header.
 *
 * Replaces the hero-only signing block that was duplicated across getPortalProject,
 * getProjectPreview, and getProjectDetail. `resolveSlot` runs first so the
 * shared/isolation guard still decides what is visible; only then is a storage_path
 * looked up. A failed variant sign falls back to the slot's own href rather than
 * dropping the image. At most four signs, so they all run concurrently — the batching
 * cap that withAttachmentUrls needs does not apply at this size.
 */
export async function resolveHeaderImages(
  supabase: SupabaseClient,
  slotIds: Record<HeaderSlot, string | null>,
  sharedImagesById: Map<string, { href: string | null; thumbHref: string | null }>,
  signedAttachments: { id: string; storage_path: string | null }[]
): Promise<{ images: HeaderImage[]; startIndex: number }> {
  const slots: HeaderSlot[] = ["cover", "hero", "before", "after"];

  const signedHrefs = await Promise.all(
    slots.map(async (slot): Promise<[HeaderSlot, string | null]> => {
      const id = slotIds[slot];
      const resolved = resolveSlot(id, sharedImagesById);
      if (!resolved) return [slot, null];
      const row = signedAttachments.find((a) => a.id === id);
      if (row?.storage_path) {
        const big = await signImageVariant(supabase, row.storage_path, HEADER);
        if (big) return [slot, big];
      }
      return [slot, resolved.href];
    })
  );

  return buildHeaderImages(
    Object.fromEntries(signedHrefs) as Record<HeaderSlot, string | null>
  );
}
