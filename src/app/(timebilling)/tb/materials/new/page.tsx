import { createMaterial } from "../actions";
import { MaterialForm } from "../MaterialForm";

export default function NewMaterialPage() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New material</h2>
      <MaterialForm action={createMaterial} submitLabel="Create material" />
    </div>
  );
}
