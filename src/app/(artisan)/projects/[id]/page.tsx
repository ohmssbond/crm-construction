import { notFound } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ArchiveButton } from "../../ArchiveButton";
import { archiveProject } from "../../actions";
import { Card } from "@/components/ui/Card";
import { Composer } from "@/components/ui/Composer";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { FileTile } from "@/components/ui/FileTile";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProjectDetail } from "@/lib/data/projects";
import { groupAttachmentsByType } from "@/lib/data/attachments";
import { isImageAttachment, stageToStatus, attachmentUses } from "@/lib/data/portfolio";
import { AttachmentControls } from "@/components/ui/AttachmentControls";
import { ProjectHero } from "@/components/portal/ProjectHero";
import { getOrgContext } from "@/lib/data/org";
import { fmtDate, fmtDateTime, fmtZonedDate, contactName } from "@/lib/data/format";
import { DEFAULT_TIMEZONE, todayInZone, dateInZone } from "@/lib/timezones";
import { UploadForm } from "./UploadForm";
import { LinkForm } from "./LinkForm";
import { StageControl } from "./StageControl";
import { ContactManager } from "./ContactManager";
import { RepPanel } from "./RepPanel";
import { TodoComposer } from "./TodoComposer";
import { TaskRow } from "./TaskRow";
import { PhaseControl } from "./PhaseControl";
import { PortfolioSlots } from "./PortfolioSlots";
import { ScheduleTable } from "@/components/schedule/ScheduleTable";
import {
  addPhase,
  updatePhase,
  deletePhase,
  movePhase,
  addTask,
  updateTask,
  deleteTask,
  moveTask,
} from "./schedule-actions";
import {
  postUpdate,
  setUpdateShared,
  updateStatusUpdate,
  setProjectStage,
  setAttachmentShared,
  toggleTodo,
  setTodoOwner,
  setTodoShared,
  updateTodo,
  addTodo,
  addLink,
  attachContact,
  detachContact,
  assignRep,
  setPhotoPhase,
  setProjectPhotoSlot,
  setAttachmentCategory,
  deleteAttachment,
} from "./actions";

// Glyph + tile color per file category, with a sensible fallback.
const FILE_STYLE: Record<string, { glyph: string; bg: string }> = {
  before_photo: { glyph: "📷", bg: "#7a9e93" },
  after_photo: { glyph: "🖼", bg: "#9e8a7a" },
  plans: { glyph: "📐", bg: "#7a8a9e" },
  permits: { glyph: "📋", bg: "#9e7a8a" },
  proposal: { glyph: "📝", bg: "#8a7a9e" },
  contract: { glyph: "✍️", bg: "#7a9e8a" },
  invoice: { glyph: "🧾", bg: "#9e9a7a" },
  surveys: { glyph: "🗺", bg: "#7a9e9e" },
  designs: { glyph: "🎨", bg: "#9e7a9e" },
};
const FILE_FALLBACK = { glyph: "📄", bg: "#8a93a0" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, ctx] = await Promise.all([getProjectDetail(id), getOrgContext()]);
  if (!detail) notFound();

  const { project, updates, todos, contacts, reps, availableContacts, availableStaff, attachments, headerImages, schedule, fileCategories } =
    detail;
  const clientNoun = ctx?.org.client_noun ?? "Customer";
  const taskContacts = [
    ...contacts.map((c) => ({ id: c.id, name: contactName(c) })),
    ...reps.map((r) => ({ id: r.id, name: r.name })),
  ];
  const artisanLabel = `${ctx?.user.name ?? "Artisan"} (you)`;
  const timezone = ctx?.org.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInZone(timezone);
  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((a) => !isImageAttachment(a));
  const imagePhotos = imageAttachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    href: a.thumbHref ?? a.href,
  }));
  const slotValues = {
    cover: project.cover_attachment_id ?? null,
    hero: project.hero_attachment_id ?? null,
    before: project.before_attachment_id ?? null,
    after: project.after_attachment_id ?? null,
  };
  const updatePhotoIds = updates
    .map((u) => u.photo_attachment_id)
    .filter((id): id is string => id != null);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <ProjectHero
        name={project.name}
        status={stageToStatus(project.stage)}
        images={headerImages.images}
        startIndex={headerImages.startIndex}
        size="compact"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
          <a
            href={`/preview/${project.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("ghost", "sm")} inline-flex items-center gap-1.5`}
          >
            <Eye size={14} />
            Preview
          </a>
          <Link href={`/projects/${project.id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>
            Edit
          </Link>
          <ArchiveButton action={archiveProject.bind(null, project.id)} noun="project" />
          <StageControl
            current={project.stage}
            action={setProjectStage.bind(null, project.id)}
          />
        </div>
      </div>

      <Tabs
        tabs={[
          {
            label: "Updates",
            content: (
              <div className="flex flex-col gap-3">
                <Composer
                  action={postUpdate.bind(null, project.id)}
                  photos={imagePhotos.map((p) => ({ id: p.id, filename: p.filename }))}
                  defaultDate={today}
                />
                {updates.length === 0 ? (
                  <EmptyState glyph="📣" title="No updates yet." />
                ) : (
                  updates.map((u) => (
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at, timezone)}
                      date={dateInZone(new Date(u.created_at), timezone)}
                      maxDate={today}
                      title={u.title}
                      body={u.body}
                      photoId={u.photo_attachment_id}
                      shared={u.is_shared}
                      photos={imagePhotos.map((p) => ({ id: p.id, filename: p.filename }))}
                      shareAction={setUpdateShared.bind(null, project.id, u.id)}
                      editAction={updateStatusUpdate.bind(null, project.id, u.id)}
                    />
                  ))
                )}
              </div>
            ),
          },
          {
            label: "To-Dos",
            content: (
              <div className="flex flex-col gap-3">
                <Banner icon={<Eye size={15} />}>
                  To-dos are <strong>private</strong> by default. Assign one to a{" "}
                  {clientNoun.toLowerCase()} or mark it shared to show it in their portal.
                </Banner>
                <TodoComposer
                  action={addTodo.bind(null, project.id)}
                  contacts={taskContacts}
                  artisanLabel={artisanLabel}
                />
                {todos.length === 0 ? (
                  <EmptyState glyph="✅" title="No to-dos yet." />
                ) : (
                  <Card>
                    {todos.map((t) => (
                      <TaskRow
                        key={t.id}
                        text={t.body}
                        due={fmtDate(t.due_date) ?? undefined}
                        dueDate={t.due_date}
                        done={t.done}
                        completed={
                          t.completed_at ? fmtZonedDate(String(t.completed_at), timezone) : undefined
                        }
                        owner={t.owner_contact_id}
                        shared={t.is_shared}
                        contacts={taskContacts}
                        artisanLabel={artisanLabel}
                        toggleAction={toggleTodo.bind(null, project.id, t.id)}
                        ownerAction={setTodoOwner.bind(null, project.id, t.id)}
                        shareAction={setTodoShared.bind(null, project.id, t.id)}
                        editAction={updateTodo.bind(null, project.id, t.id)}
                      />
                    ))}
                  </Card>
                )}
              </div>
            ),
          },
          {
            label: "Schedule",
            content: (
              <div className="flex flex-col gap-3">
                <Banner icon={<Eye size={15} />}>
                  The Schedule is always visible to the {clientNoun.toLowerCase()} and
                  partners in their portal. There is no private/shared switch.
                </Banner>
                <ScheduleTable
                  phases={schedule}
                  actions={{
                    addPhase: addPhase.bind(null, project.id),
                    updatePhase: updatePhase.bind(null, project.id),
                    deletePhase: deletePhase.bind(null, project.id),
                    movePhase: movePhase.bind(null, project.id),
                    addTask: addTask.bind(null, project.id),
                    updateTask: updateTask.bind(null, project.id),
                    deleteTask: deleteTask.bind(null, project.id),
                    moveTask: moveTask.bind(null, project.id),
                  }}
                />
              </div>
            ),
          },
          {
            label: "Files",
            content: (
              <div className="flex flex-col gap-3">
                <UploadForm
                  projectId={project.id}
                  orgId={ctx?.org.id ?? ""}
                  categories={fileCategories}
                  shareLabel={`Share with ${clientNoun.toLowerCase()}`}
                />
                <LinkForm action={addLink.bind(null, project.id)} categories={fileCategories} />
                {fileAttachments.length === 0 ? (
                  <EmptyState glyph="🗂" title="No files yet." />
                ) : (
                  <div className="flex flex-col gap-4">
                    {groupAttachmentsByType(fileAttachments, fileCategories).map((group) => (
                      <div key={group.key} className="flex flex-col gap-2">
                        <h4 className="text-meta font-semibold text-faint">
                          {group.label} ({group.items.length})
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {group.items.map((a) => {
                            const style =
                              a.kind === "link"
                                ? { glyph: "🔗", bg: "#6a7c8a" }
                                : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                            return (
                              <div key={a.id} className="flex flex-col gap-1">
                                <FileTile
                                  name={a.filename ?? a.url ?? "Link"}
                                  glyph={style.glyph}
                                  bg={style.bg}
                                  shared={a.is_shared}
                                  href={a.href}
                                  shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                                />
                                <AttachmentControls
                                  categories={fileCategories}
                                  category={a.category}
                                  categoryAction={setAttachmentCategory.bind(null, project.id, a.id)}
                                  deleteAction={deleteAttachment.bind(null, project.id, a.id)}
                                  uses={attachmentUses(a.id, slotValues, updatePhotoIds)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            label: "Photos",
            content: (
              <div className="flex flex-col gap-3">
                <UploadForm
                  projectId={project.id}
                  orgId={ctx?.org.id ?? ""}
                  fixedCategory="photo"
                  accept="image/*"
                  shareLabel={`Share with ${clientNoun.toLowerCase()}`}
                />
                <PortfolioSlots
                  photos={imagePhotos}
                  values={slotValues}
                  action={setProjectPhotoSlot.bind(null, project.id)}
                />
                {imageAttachments.length === 0 ? (
                  <EmptyState glyph="🖼" title="No photos yet." />
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {imageAttachments.map((a) => (
                      <div key={a.id} className="flex flex-col gap-1">
                        <FileTile
                          name={a.filename ?? a.url ?? "Photo"}
                          glyph="🖼"
                          bg="#7a9e93"
                          shared={a.is_shared}
                          href={a.href}
                          shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                        />
                        <PhaseControl
                          current={(a.phase as "before" | "during" | "after" | null) ?? null}
                          action={setPhotoPhase.bind(null, project.id, a.id)}
                        />
                        <AttachmentControls
                          deleteAction={deleteAttachment.bind(null, project.id, a.id)}
                          uses={attachmentUses(a.id, slotValues, updatePhotoIds)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            label: "Contacts",
            content: (
              <div className="flex flex-col gap-5">
                <ContactManager
                  attached={contacts}
                  available={availableContacts}
                  attachAction={attachContact.bind(null, project.id)}
                  detachAction={detachContact.bind(null, project.id)}
                />
                <RepPanel
                  reps={reps}
                  availableStaff={availableStaff}
                  assignAction={assignRep.bind(null, project.id)}
                  removeAction={detachContact.bind(null, project.id)}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
