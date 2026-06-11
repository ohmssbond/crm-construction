import { FolderKanban, Building2, Users, Eye } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Banner } from "@/components/ui/Banner";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/data/rel";
import { fmtDate, projectMeta } from "@/lib/data/format";
import { getOrgContext } from "@/lib/data/org";
import { pluralize } from "@/components/shell/nav";

export default async function DashboardPage() {
  const supabase = await createClient();
  const ctx = await getOrgContext();
  const clientNoun = ctx?.org.client_noun ?? "Customer";
  const customersLabel = pluralize(clientNoun);

  // RLS scopes every read to the signed-in artisan's org, so no explicit filter
  // is needed. Counts use head+exact (no rows shipped); the lists pull what they
  // render. All independent, so fire them together.
  const [projectCount, customerCount, contactCount, activeProjects, todos] =
    await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase
        .from("projects")
        .select(
          "id, name, stage, start_date, end_date, customer:customers(name), project_contacts(count)"
        )
        .neq("stage", "completed")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("todos")
        .select("id, body, done, due_date, project:projects(name)")
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(6),
    ]);

  const projects = activeProjects.data ?? [];
  const todoList = todos.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 flex-wrap">
        <StatCard count={projectCount.count ?? 0} label="Projects" icon={FolderKanban} href="/projects" />
        <StatCard count={customerCount.count ?? 0} label={customersLabel} icon={Building2} href="/customers" />
        <StatCard count={contactCount.count ?? 0} label="Contacts" icon={Users} href="/contacts" />
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabel>Active projects</SectionLabel>
        {projects.length === 0 ? (
          <EmptyState glyph="📂" title="No active projects yet." />
        ) : (
          <Card>
            {projects.map((p) => {
              const contacts = p.project_contacts?.[0]?.count ?? 0;
              const customerName = one(p.customer)?.name ?? "—";
              const meta = projectMeta(p);
              return (
                <ListRow
                  key={p.id}
                  href={`/projects/${p.id}`}
                  leading={
                    <Thumb>
                      <FolderKanban size={18} />
                    </Thumb>
                  }
                  title={p.name}
                  sub={`${customerName} · ${contacts} contact${contacts === 1 ? "" : "s"}`}
                  meta={
                    <>
                      <StageChip stage={p.stage as Stage} />
                      {meta && <div className="mt-[5px]">{meta}</div>}
                    </>
                  }
                />
              );
            })}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Tasks across projects</SectionLabel>
        <Banner icon={<Eye size={15} />}>
          Tasks are <strong>private</strong> by default — they appear in the{" "}
          {clientNoun.toLowerCase()} portal only when assigned to a contact or marked shared.
        </Banner>
        {todoList.length === 0 ? (
          <EmptyState glyph="✅" title="Nothing on the list." />
        ) : (
          <Card>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-meta text-muted uppercase tracking-[0.4px] border-b border-line-2">
                  <th className="font-semibold w-9 px-4 py-[10px]"></th>
                  <th className="font-semibold px-2 py-[10px]">Task</th>
                  <th className="font-semibold px-2 py-[10px]">Project</th>
                  <th className="font-semibold px-4 py-[10px] text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {todoList.map((t) => (
                  <tr key={t.id} className="border-b border-line-2 last:border-b-0">
                    <td className="px-4 py-[11px]">
                      <span
                        className={`size-[18px] inline-grid place-items-center rounded-[5px] text-white text-[11px] ${
                          t.done ? "bg-accent" : "border-2 border-[#cfd4dc]"
                        }`}
                      >
                        {t.done ? "✓" : ""}
                      </span>
                    </td>
                    <td className={`px-2 py-[11px] text-body ${t.done ? "text-faint line-through" : ""}`}>
                      {t.body}
                    </td>
                    <td className="px-2 py-[11px] text-sub text-muted">{one(t.project)?.name ?? "—"}</td>
                    <td className="px-4 py-[11px] text-right text-meta text-faint whitespace-nowrap">
                      {t.done ? "done" : (fmtDate(t.due_date) ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
