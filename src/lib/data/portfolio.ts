// Pure transforms + validation for the customer-portal photo portfolio.
// No I/O — loaders and server actions do the DB work and pass rows in.

export type PortfolioStatus = {
  label: string;
  tone: "proposal" | "signed" | "active" | "completed";
};

/** Map a project stage to the portal status pill's label + palette tone. */
export function stageToStatus(stage: string): PortfolioStatus {
  switch (stage) {
    case "signed":
      return { label: "Signed", tone: "signed" };
    case "in_progress":
      return { label: "Active", tone: "active" };
    case "completed":
      return { label: "Completed", tone: "completed" };
    case "proposal":
    default:
      return { label: "Proposal", tone: "proposal" };
  }
}

/** A photo is a stored file whose mime type is an image. */
export function isImageAttachment(a: { kind: string; mime_type: string | null }): boolean {
  return a.kind === "file" && !!a.mime_type && a.mime_type.startsWith("image/");
}

export type Resolved = { href: string };

/**
 * Resolve a headline slot to its photo — only if the referenced attachment is
 * present in the shared-image map AND has a usable href; otherwise null (the
 * caller renders a BrandedPlaceholder). Enforces the portal isolation invariant.
 */
export function resolveSlot(
  attachmentId: string | null,
  sharedImagesById: Map<string, { href: string | null }>
): Resolved | null {
  if (!attachmentId) return null;
  const a = sharedImagesById.get(attachmentId);
  if (!a || !a.href) return null;
  return { href: a.href };
}

/** The before→after strip shows only when both slots resolve to shared images. */
export function beforeAfterVisible(before: Resolved | null, after: Resolved | null): boolean {
  return before !== null && after !== null;
}

export type GalleryItem = { id: string; href: string | null; phase: string | null };

const GROUP_ORDER = [
  { key: "before", label: "Before" },
  { key: "during", label: "During" },
  { key: "after", label: "After" },
  { key: "general", label: "Photos" },
] as const;

export type GalleryGroup = { key: "before" | "during" | "after" | "general"; label: string; items: GalleryItem[] };

/**
 * Bucket shared images into Before / During / After, plus a trailing "Photos"
 * group for shared-but-untagged images (phase null) so nothing shared silently
 * disappears. Groups render in fixed order; empty groups are omitted; item order
 * within a group is preserved from the input (callers pass newest-first).
 */
export function groupPhotosByPhase<T extends GalleryItem>(
  images: T[]
): { key: (typeof GROUP_ORDER)[number]["key"]; label: string; items: T[] }[] {
  const byKey = new Map<string, T[]>();
  for (const img of images) {
    const key = img.phase === "before" || img.phase === "during" || img.phase === "after"
      ? img.phase
      : "general";
    const bucket = byKey.get(key) ?? [];
    bucket.push(img);
    byKey.set(key, bucket);
  }
  return GROUP_ORDER.filter((g) => byKey.has(g.key)).map((g) => ({
    key: g.key,
    label: g.label,
    items: byKey.get(g.key) as T[],
  }));
}

/**
 * Validate a phase/slot/update-photo assignment (run inside each server action
 * under the artisan write RLS). Clearing (null id) is handled by the caller and
 * never reaches here. Returns an error string, or null when valid.
 */
export function validatePhotoAssignment(
  attachment: { project_id: string; kind: string; mime_type: string | null } | null,
  projectId: string
): string | null {
  if (!attachment) return "Photo not found.";
  if (attachment.project_id !== projectId) return "Photo belongs to another project.";
  if (!isImageAttachment(attachment)) return "Only photos can be tagged.";
  return null;
}
