import { IconArrowLeft, IconTableShare } from "@tabler/icons-react";
import Link from "next/link";
import { SavedPivotEditor, type SavedPivotEditorInitial } from "./saved-pivot-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { SourceSheet } from "@/features/dashboards/service";

/**
 * Kerangka halaman buat/ubah pivot tersimpan (T-074): breadcrumb Dataset / nama dataset, tombol
 * kembali, dan editor. Dataset tanpa data siap → keadaan kosong.
 */
export function SavedPivotEditorPage({
  dataset,
  sources,
  initial,
}: {
  dataset: { id: string; name: string };
  sources: SourceSheet[];
  initial: SavedPivotEditorInitial | null;
}) {
  const back = (
    <Button
      asChild
      variant="outline"
      className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
    >
      <Link href={`/datasets/${dataset.id}#pivot-tersimpan`}>
        <IconArrowLeft aria-hidden />
        Kembali ke dataset
      </Link>
    </Button>
  );
  const usable = sources.some((s) => s.columns.length);
  return (
    <div className="flex flex-col gap-6" data-testid="saved-pivot-page">
      <PageHeader
        eyebrow={
          <span className="flex min-w-0 flex-wrap gap-x-1">
            <Link
              href="/datasets"
              className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
            >
              Dataset
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/datasets/${dataset.id}`}
              className="inline-flex min-h-6 min-w-0 items-center underline-offset-4 hover:underline"
            >
              <span className="truncate">{dataset.name}</span>
            </Link>
          </span>
        }
        title={initial ? `Ubah “${initial.name}”` : "Pivot tersimpan baru"}
        description="Definisi pivot yang dipakai bersama widget pivot, grafik, angka, dan tabel di dashboard dataset ini."
        actions={back}
      />
      {usable ? (
        <Card>
          <CardContent className="pt-5">
            <SavedPivotEditor
              // Muat ulang setelah konflik: revisi baru memasang editor baru dari data server.
              key={initial ? `${initial.id}:${initial.revision}` : "baru"}
              datasetId={dataset.id}
              sources={sources}
              initial={initial}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<IconTableShare />}
          title="Belum ada data untuk dipakai"
          description="Unggah data di halaman dataset dulu, lalu buat pivot tersimpan."
          action={back}
        />
      )}
    </div>
  );
}
