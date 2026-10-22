import { notFound } from "next/navigation";
import { GuideHelp } from "@/components/guides/guide-help";
import { SavedPivotEditorPage } from "@/components/saved-pivots/saved-pivot-page";
import { requireUser } from "@/features/auth/session";
import { getDatasetSources } from "@/features/dashboards/service";
import { getDataset } from "@/features/datasets/service";
import { getSavedPivot } from "@/features/saved-pivots/service";

type Params = Promise<{ id: string; pivotId: string }>;

export const metadata = { title: "Ubah pivot tersimpan" };

/**
 * Ubah pivot tersimpan (T-074): pemilik dataset saja — editor dashboard melihat definisinya di panel
 * widget (baca-saja), bukan di sini. Pivot dataset lain / tidak ada → 404 (D2).
 */
export default async function EditSavedPivotPage({ params }: { params: Params }) {
  const { id, pivotId } = await params;
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  if (!dataset) notFound();
  const pivot = await getSavedPivot(user.id, pivotId);
  if (!pivot.ok || pivot.data.datasetId !== dataset.id || !pivot.data.canEdit) notFound();
  const sources = await getDatasetSources(user.id, dataset.id);
  const p = pivot.data;
  return (
    <SavedPivotEditorPage
      dataset={{ id: dataset.id, name: dataset.name }}
      sources={sources}
      help={<GuideHelp context="SAVED_PIVOT" page="Pivot tersimpan" as="OWNER" />}
      initial={{ id: p.id, name: p.name, spec: p.spec, revision: p.revision, usage: p.usage }}
    />
  );
}
