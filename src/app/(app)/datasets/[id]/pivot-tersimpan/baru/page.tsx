import { notFound } from "next/navigation";
import { SavedPivotEditorPage } from "@/components/saved-pivots/saved-pivot-page";
import { requireUser } from "@/features/auth/session";
import { getDatasetSources } from "@/features/dashboards/service";
import { getDataset } from "@/features/datasets/service";

type Params = Promise<{ id: string }>;

export const metadata = { title: "Pivot tersimpan baru" };

/** Buat pivot tersimpan (T-074): pemilik dataset saja; selain itu 404 (D2). */
export default async function NewSavedPivotPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  if (!dataset) notFound();
  const sources = await getDatasetSources(user.id, dataset.id);
  return (
    <SavedPivotEditorPage
      dataset={{ id: dataset.id, name: dataset.name }}
      sources={sources}
      initial={null}
    />
  );
}
