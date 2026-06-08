import { FolderKanban, Building2, Users, Lock } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Banner } from "@/components/ui/Banner";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TodoRow } from "@/components/ui/TodoRow";
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
        <SectionLabel>To-dos across projects</SectionLabel>
        <Banner icon={<Lock size={15} />}>
          To-dos are <strong>internal</strong> — never shown in the {clientNoun.toLowerCase()} portal.
        </Banner>
        {todoList.length === 0 ? (
          <EmptyState glyph="✅" title="Nothing on the list." />
        ) : (
          <Card>
            {todoList.map((t) => (
              <TodoRow
                key={t.id}
                text={`${t.body}${one(t.project)?.name ? ` — ${one(t.project)!.name}` : ""}`}
                due={fmtDate(t.due_date) ?? undefined}
                done={t.done}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
