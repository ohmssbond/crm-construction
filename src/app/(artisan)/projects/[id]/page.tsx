import { notFound } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import { StageChip, type Stage } from "@/components/ui/Chip";
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
import { getOrgContext } from "@/lib/data/org";
import { fmtDate, fmtDateTime, fmtZonedDate, contactName } from "@/lib/data/format";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { UploadForm } from "./UploadForm";
import { LinkForm } from "./LinkForm";
import { StageControl } from "./StageControl";
import { ContactManager } from "./ContactManager";
import { TodoComposer } from "./TodoComposer";
import { TaskRow } from "./TaskRow";
import {
  postUpdate,
  setUpdateShared,
  setProjectStage,
  setAttachmentShared,
  toggleTodo,
  setTodoOwner,
  setTodoShared,
  addTodo,
  addLink,
  attachContact,
  detachContact,
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

  const { project, updates, todos, contacts, availableContacts, attachments, fileCategories } =
    detail;
  const clientNoun = ctx?.org.client_noun ?? "Customer";
  const taskContacts = contacts.map((c) => ({ id: c.id, name: contactName(c) }));
  const artisanLabel = `${ctx?.user.name ?? "Artisan"} (you)`;
  const timezone = ctx?.org.timezone ?? DEFAULT_TIMEZONE;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title font-semibold">{project.name}</h2>
        <StageChip stage={project.stage as Stage} />
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
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
                <Composer action={postUpdate.bind(null, project.id)} />
                {updates.length === 0 ? (
                  <EmptyState glyph="📣" title="No updates yet." />
                ) : (
                  updates.map((u) => (
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at, timezone)}
                      body={u.body}
                      shared={u.is_shared}
                      shareAction={setUpdateShared.bind(null, project.id, u.id)}
                    />
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Photos & Files",
            content: (
              <div className="flex flex-col gap-3">
                <UploadForm
                  projectId={project.id}
                  orgId={ctx?.org.id ?? ""}
                  categories={fileCategories}
                  shareLabel={`Share with ${clientNoun.toLowerCase()}`}
                />
                <LinkForm action={addLink.bind(null, project.id)} categories={fileCategories} />
                {attachments.length === 0 ? (
                  <EmptyState glyph="🗂" title="No files yet." />
                ) : (
                  <div className="flex flex-col gap-4">
                    {groupAttachmentsByType(attachments, fileCategories).map((group) => (
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
                              <FileTile
                                key={a.id}
                                name={a.filename ?? a.url ?? "Link"}
                                glyph={style.glyph}
                                bg={style.bg}
                                shared={a.is_shared}
                                href={a.href}
                                shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                              />
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
            label: "Tasks",
            content: (
              <div className="flex flex-col gap-3">
                <Banner icon={<Eye size={15} />}>
                  Tasks are <strong>private</strong> by default. Assign one to a{" "}
                  {clientNoun.toLowerCase()} or mark it shared to show it in their portal.
                </Banner>
                <TodoComposer
                  action={addTodo.bind(null, project.id)}
                  contacts={taskContacts}
                  artisanLabel={artisanLabel}
                />
                {todos.length === 0 ? (
                  <EmptyState glyph="✅" title="No tasks yet." />
                ) : (
                  <Card>
                    {todos.map((t) => (
                      <TaskRow
                        key={t.id}
                        text={t.body}
                        due={fmtDate(t.due_date) ?? undefined}
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
                      />
                    ))}
                  </Card>
                )}
              </div>
            ),
          },
          {
            label: "Contacts",
            content: (
              <ContactManager
                attached={contacts}
                available={availableContacts}
                attachAction={attachContact.bind(null, project.id)}
                detachAction={detachContact.bind(null, project.id)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
