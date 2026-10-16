import Link from "next/link";
import { notFound } from "next/navigation";
import { DatasetActivityProvider } from "@/components/datasets/dataset-activity";
import { DatasetDataSummary } from "@/components/datasets/dataset-data-summary";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { DeleteDataset } from "@/components/datasets/delete-dataset";
import { StatusBadge } from "@/components/datasets/status-badge";
import { UploadPanel } from "@/components/datasets/upload-panel";
import { VersionHistory } from "@/components/datasets/version-history";
import { activationBusy } from "@/components/datasets/version-history-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusNotice } from "@/components/ui/focus-notice";
import { GuideHelp } from "@/components/guides/guide-help";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { datasetShareImpact, getDataset } from "@/features/datasets/service";
import { prismaSchemaRepo } from "@/features/schema/runtime";
import type { IngestStatus } from "@/features/schema/service";
import { getPendingUpload } from "@/features/uploads/service";
import { mappingJobId } from "@/features/versions/mapping";
import { listVersions } from "@/features/versions/service";
import { env } from "@/lib/env";

type Params = Promise<{ id: string }>;
type Search = Promise<{ created?: string; mapped?: string; discarded?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  return { title: dataset?.name ?? "Tidak ditemukan" };
}

/** Detail profil dataset. Bukan pemilik atau tidak ada → 404 (D2). */
export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  if (!dataset) notFound();

  const badge = dataset.label.badge;
  const active = dataset.active;
  // Versi terbaru sudah terunggah dan menunggu/sedang ingest atau pemetaan → unggah baru ditahan (D4).
  const processing = badge?.kind === "processing" || badge?.kind === "awaiting_mapping";
  // Ada versi non-terminal (termasuk unggahan belum selesai) → "Aktifkan" pasti DATASET_BUSY. Unggahan
  // yang sedang ditransfer di tab ini dikabarkan UploadPanel lewat DatasetActivityProvider (tanpa refresh).
  const busy = activationBusy(badge);
  // Riwayat versi terpisah dari ringkasan agar daftar dataset tetap ringan.
  const awaiting = badge?.kind === "awaiting_mapping";
  const [pending, versions, mappingJob, shareImpact] = await Promise.all([
    processing ? null : getPendingUpload(user.id, dataset.id),
    listVersions(user.id, dataset.id),
    // Job pemetaan yang sedang diterapkan + hasil terakhirnya (T-014): panel unggah dan riwayat versi.
    awaiting ? mappingJobId(user.id, dataset.id) : null,
    // Dialog hapus menyebut siapa yang kehilangan akses ke dashboard yang dibagikan (T-016).
    dataset.dashboardCount > 0 ? datasetShareImpact(user.id, dataset.id) : null,
  ]);
  const applyingJobId = mappingJob?.jobId ?? null;
  // Versi yang menunggu pemetaan (paling banyak satu, D4): alasan + tombol buang di panel unggah.
  const mapping = versions.find((v) => v.canDiscard) ?? null;
  // Status awal progres dirender server (tidak ada layar kosong sebelum polling pertama, T-008).
  let ingest: IngestStatus | null = null;
  if (badge?.kind === "processing") {
    const st = await prismaSchemaRepo.latestVersion(user.id, dataset.id);
    ingest =
      st && st !== "none"
        ? st
        : {
            versionId: "",
            status: "INGESTING",
            fileName: dataset.latestFileName,
            progress: null,
            sheets: [],
            errorMessage: null,
          };
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link
            href="/datasets"
            className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
          >
            Dataset
          </Link>
        }
        title={dataset.name}
        description={dataset.description ?? undefined}
        actions={<GuideHelp context="UPLOAD" page="Unggah data" as="OWNER" />}
      />
      {search.created === "1" ? <FocusNotice>Dataset dibuat.</FocusNotice> : null}
      {/* Kembali dari halaman pemetaan (T-014); hanya bila keadaannya memang sudah begitu. */}
      {search.mapped === "1" && active && !awaiting ? (
        <div data-testid="mapping-done">
          <FocusNotice>
            <span className="[overflow-wrap:anywhere]">
              Pemetaan disimpan. Versi “{active.originalName ?? "file baru"}” aktif.
            </span>
          </FocusNotice>
        </div>
      ) : null}
      {search.discarded === "1" && !awaiting ? (
        <div data-testid="version-discard-result">
          <FocusNotice>
            Versi yang menunggu pemetaan dibuang. Data aktif tetap dipakai; unggah file yang sudah
            diperbaiki.
          </FocusNotice>
        </div>
      ) : null}
      <div>
        <StatusBadge label={dataset.label} />
      </div>

      <DatasetActivityProvider>
        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>File Excel/CSV yang menjadi isi dataset ini.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DatasetDataSummary
              datasetId={dataset.id}
              failed={
                badge?.kind === "failed"
                  ? { fileName: dataset.latestFileName, message: badge.message ?? null }
                  : null
              }
              active={active}
            />
            <UploadPanel
              datasetId={dataset.id}
              maxBytes={env().MAX_UPLOAD_BYTES}
              hasData={Boolean(active)}
              pending={pending}
              processing={
                ingest
                  ? { kind: "ingest", status: ingest }
                  : awaiting
                    ? {
                        kind: "mapping",
                        versionId: mapping?.id ?? null,
                        fileName: mapping?.fileName ?? dataset.latestFileName,
                        message: mapping?.message ?? null,
                        mappingJobId: applyingJobId,
                        mappingLast: mappingJob?.last ?? null,
                      }
                    : null
              }
            />
          </CardContent>
        </Card>

        {versions.length > 0 ? (
          <VersionHistory
            datasetId={dataset.id}
            versions={versions}
            busy={busy}
            mappingApplying={applyingJobId !== null}
          />
        ) : null}
      </DatasetActivityProvider>

      <Card>
        <CardHeader>
          <CardTitle>Ubah profil</CardTitle>
        </CardHeader>
        <CardContent>
          <DatasetForm
            mode="edit"
            dataset={{ id: dataset.id, name: dataset.name, description: dataset.description }}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Hapus dataset</CardTitle>
          <CardDescription>
            Menghapus semua versi data, file yang diunggah, dan dashboard di dalamnya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteDataset
            id={dataset.id}
            name={dataset.name}
            dashboardCount={dataset.dashboardCount}
            shareImpact={shareImpact}
          />
        </CardContent>
      </Card>
    </div>
  );
}
