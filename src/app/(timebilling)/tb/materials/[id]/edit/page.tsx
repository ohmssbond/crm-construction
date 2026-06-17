import { notFound } from "next/navigation";
import { ArchiveButton } from "@/app/(artisan)/ArchiveButton";
import { getMaterialDetail } from "@/lib/data/materials";
import { updateMaterial, archiveMaterial } from "../../actions";
import { MaterialForm } from "../../MaterialForm";

export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await getMaterialDetail(id);
  if (!material) notFound();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">Edit {material.name}</h2>
        <ArchiveButton action={archiveMaterial.bind(null, id)} noun="material" />
      </div>
      <MaterialForm action={updateMaterial.bind(null, id)} defaults={material} submitLabel="Save changes" />
    </div>
  );
}
