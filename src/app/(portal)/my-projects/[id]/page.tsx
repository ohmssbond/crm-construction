import { notFound } from "next/navigation";
import { getPortalProject } from "@/lib/data/portal";
import { PortalProjectView } from "@/components/portal/PortalProjectView";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPortalProject(id);
  if (!detail) notFound();

  return <PortalProjectView detail={detail} />;
}
