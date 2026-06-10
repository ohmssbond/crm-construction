import { listProjects, listArchivedProjects } from "@/lib/data/projects";
import { restoreProject } from "../actions";
import { ProjectList } from "./ProjectList";

export default async function ProjectsPage() {
  const [projects, archived] = await Promise.all([listProjects(), listArchivedProjects()]);
  return <ProjectList projects={projects} archived={archived} restoreAction={restoreProject} />;
}
