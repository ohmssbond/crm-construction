import { listProjects } from "@/lib/data/projects";
import { ProjectList } from "./ProjectList";

export default async function ProjectsPage() {
  const projects = await listProjects();
  return <ProjectList projects={projects} />;
}
