import type { SupabaseClient } from "@supabase/supabase-js";

type AttachmentRef = {
  kind: string;
  url: string | null;
  storage_path: string | null;
};

const BUCKET = "project-files";
const SIGNED_URL_TTL = 60 * 60; // 1h

/**
 * Resolves a viewable `href` for each attachment: the raw URL for links, and a
 * short-lived signed URL for files in the private `project-files` bucket. File
 * URLs are signed in one batch call.
 */
export async function withAttachmentUrls<T extends AttachmentRef>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<(T & { href: string | null })[]> {
  const filePaths = rows
    .filter((r) => r.kind === "file" && r.storage_path)
    .map((r) => r.storage_path as string);

  const signed: Record<string, string> = {};
  if (filePaths.length) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(filePaths, SIGNED_URL_TTL);
    data?.forEach((s) => {
      if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
    });
  }

  return rows.map((r) => ({
    ...r,
    href:
      r.kind === "link"
        ? r.url
        : r.storage_path
          ? (signed[r.storage_path] ?? null)
          : null,
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
