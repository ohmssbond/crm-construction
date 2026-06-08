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
