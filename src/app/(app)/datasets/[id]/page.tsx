import { IconCalendarStats, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatasetActivityProvider } from "@/components/datasets/dataset-activity";
import { DatasetDataSummary } from "@/components/datasets/dataset-data-summary";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { DeleteDataset } from "@/components/datasets/delete-dataset";
import { PeriodList } from "@/components/datasets/period-list";
import { PeriodCapacityNotice } from "@/components/datasets/period-usage";
import { SavedPivotList } from "@/components/saved-pivots/saved-pivot-list";
import { StatusBadge } from "@/components/datasets/status-badge";
import { UploadPanel } from "@/components/datasets/upload-panel";
import { VersionHistory } from "@/components/datasets/version-history";
import { activationBusy } from "@/components/datasets/version-history-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusNotice } from "@/components/ui/focus-notice";
import { GuideHelp } from "@/components/guides/guide-help";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { getDatasetSources } from "@/features/dashboards/service";
import { datasetShareImpact, getDataset } from "@/features/datasets/service";
import { GRAIN_LABEL } from "@/features/ingest/period-setup-plan";
import { prismaSchemaRepo } from "@/features/schema/runtime";
import type { IngestStatus } from "@/features/schema/service";
import { getUploadQueue } from "@/features/uploads/queue";
import { listSavedPivots } from "@/features/saved-pivots/service";
import { getPendingUpload } from "@/features/uploads/service";
import { mappingJobId } from "@/features/versions/mapping";
import { periodOverview } from "@/features/versions/period-manage";
import { periodUploadContext } from "@/features/versions/period-upload";
import { listVersions } from "@/features/versions/service";
import { env } from "@/lib/env";

type Params = Promise<{ id: string }>;
type Search = Promise<{
  created?: string;
  mapped?: string;
  discarded?: string;
  period?: string;
  confirmed?: string;
  cancelled?: string;
  /** "Unggah ulang" di kartu Periode (T-056): awal periode yang diisikan ke panel unggah. */
  unggah?: string;
  /** Kembali dari editor pivot tersimpan (T-074): "dibuat" / "diubah". */
  pivot?: string;
}>;

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
  const processing =
    badge?.kind === "processing" ||
    badge?.kind === "awaiting_mapping" ||
    badge?.kind === "awaiting_confirm";
  // Ada versi non-terminal (termasuk unggahan belum selesai) → "Aktifkan" pasti DATASET_BUSY. Unggahan
  // yang sedang ditransfer di tab ini dikabarkan UploadPanel lewat DatasetActivityProvider (tanpa refresh).
  const busy = activationBusy(badge);
  // Riwayat versi terpisah dari ringkasan agar daftar dataset tetap ringan.
  const awaiting = badge?.kind === "awaiting_mapping";
  const [pending, versions, mappingJob, shareImpact, periodUpload, periods, queue, pivots, sheets] =
    await Promise.all([
      processing ? null : getPendingUpload(user.id, dataset.id),
      listVersions(user.id, dataset.id),
      // Job pemetaan yang sedang diterapkan + hasil terakhirnya (T-014): panel unggah dan riwayat versi.
      awaiting ? mappingJobId(user.id, dataset.id) : null,
      // Dialog hapus menyebut siapa yang kehilangan akses ke dashboard yang dibagikan (T-016).
      dataset.dashboardCount > 0 ? datasetShareImpact(user.id, dataset.id) : null,
      // Panel unggah dataset per periode (T-053): versi dasar, satuan, jumlah periode, sheet berlabel.
      active?.periodGrain ? periodUploadContext(user.id, dataset.id) : null,
      // Kartu Periode (T-056): daftar periode + yang bisa dipulihkan dari versi lama yang tersimpan.
      active?.periodGrain ? periodOverview(user.id, dataset.id) : null,
      // Antrean unggah banyak file (T-059): berjalan, atau ringkasan terakhir yang belum ditutup.
      getUploadQueue(user.id, dataset.id),
      // Pivot tersimpan (T-074): daftar + nama sheet versi aktif untuk kolom Sheet.
      active ? listSavedPivots(user.id, dataset.id) : null,
      active ? getDatasetSources(user.id, dataset.id) : [],
    ]);
  const sheetNames = Object.fromEntries(sheets.map((s) => [s.id, s.name]));
  // "Unggah ulang" hanya untuk periode yang memang ada di data aktif (selain itu diabaikan).
  const reuploadRow =
    typeof search.unggah === "string"
      ? (periods?.rows.find((r) => r.start === search.unggah) ?? null)
      : null;
  const applyingJobId = mappingJob?.jobId ?? null;
  // Versi yang menunggu pemetaan (paling banyak satu, D4): alasan + tombol buang di panel unggah.
  const mapping = versions.find((v) => v.canDiscard) ?? null;
  // Unggahan periode yang menunggu konfirmasi (T-054): ajakan "Tinjau perubahan" di panel unggah.
  const confirming =
    badge?.kind === "awaiting_confirm"
      ? (versions.find((v) => v.status === "AWAITING_CONFIRM") ?? null)
      : null;
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
        actions={<GuideHelp context={["UPLOAD", "SAVED_PIVOT"]} page="Dataset" as="OWNER" />}
      />
      {search.created === "1" ? <FocusNotice>Dataset dibuat.</FocusNotice> : null}
      {/* Kembali dari halaman pemetaan (T-014); hanya bila keadaannya memang sudah begitu. */}
      {search.mapped === "1" && active && !awaiting ? (
        <div data-testid="mapping-done">
          <FocusNotice>
            <span className="[overflow-wrap:anywhere]">
              {/* Unggahan periode (T-057) yang perlu ditinjau: belum aktif, tinjauan ada di bawah. */}
              {confirming
                ? `Pemetaan disimpan. Tinjau periode “${confirming.fileName ?? "file baru"}” lalu terapkan.`
                : `Pemetaan disimpan. Versi “${active.originalName ?? "file baru"}” aktif.`}
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
      {/* Kembali dari layar tinjauan unggahan periode (T-054). */}
      {search.confirmed === "1" && !confirming ? (
        <div data-testid="review-confirmed">
          <FocusNotice>
            <span className="[overflow-wrap:anywhere]">
              Perubahan periode diterapkan. Versi “{active?.originalName ?? "file baru"}” aktif dan
              dashboard memakai data ini sekarang.
            </span>
          </FocusNotice>
        </div>
      ) : null}
      {search.cancelled === "1" && !confirming ? (
        <div data-testid="review-cancelled">
          <FocusNotice>Unggahan dibatalkan. Data aktif tidak berubah.</FocusNotice>
        </div>
      ) : null}
      {/* Kembali dari "Atur periode" (T-051) selama job-nya masih berjalan. */}
      {search.period === "1" && badge?.kind === "processing" ? (
        <div data-testid="period-applying">
          <FocusNotice>
            Periode sedang diterapkan. Dashboard tetap memakai data sekarang sampai selesai.
          </FocusNotice>
        </div>
      ) : null}
      <div>
        <StatusBadge label={dataset.label} />
      </div>

      <DatasetActivityProvider>
        <Card id="unggah" className="scroll-mt-20">
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
              period={periodUpload}
              reupload={reuploadRow ? { start: reuploadRow.start, label: reuploadRow.label } : null}
              queue={queue}
              activeSheets={sheets.map((s) => s.name)}
              setupHref={`/datasets/${dataset.id}/periode`}
              processing={
                ingest
                  ? { kind: "ingest", status: ingest }
                  : confirming
                    ? { kind: "confirm", versionId: confirming.id, fileName: confirming.fileName }
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

        {active ? (
          <Card data-testid="period-card">
            <CardHeader>
              <CardTitle>Data per periode</CardTitle>
              <CardDescription>
                {active.periodGrain
                  ? `Data disimpan ${GRAIN_LABEL[active.periodGrain]}: setiap periode bisa ditambah atau diganti terpisah.`
                  : "Ingin menyimpan data per bulan? Atur periode agar setiap bulan bisa ditambah atau diganti tanpa mengunggah ulang semua data."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Meter batas + proyeksi (T-055): hanya bila ada batas ≥ PERIOD_WARN_PCT. */}
              <PeriodCapacityNotice
                capacity={periodUpload?.capacity}
                testId="period-card-capacity"
              />
              {periods ? (
                <PeriodList datasetId={dataset.id} overview={periods} busy={busy !== null} />
              ) : null}
              <Button
                asChild
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
              >
                <Link href={`/datasets/${dataset.id}/periode`} data-testid="period-link">
                  <IconCalendarStats aria-hidden />
                  {active.periodGrain ? "Pengaturan periode" : "Atur periode"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {active ? (
          <Card id="pivot-tersimpan" className="scroll-mt-20" data-testid="saved-pivot-card">
            <CardHeader>
              <CardTitle>Pivot tersimpan</CardTitle>
              <CardDescription>
                Definisi pivot yang dipakai bersama widget di dashboard dataset ini: ubah sekali,
                semua widget yang memakainya ikut berubah.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {search.pivot === "dibuat" || search.pivot === "diubah" ? (
                <div data-testid="saved-pivot-done">
                  <FocusNotice>
                    {search.pivot === "dibuat"
                      ? "Pivot tersimpan dibuat. Pilih sebagai sumber di panel widget dashboard."
                      : "Perubahan pivot tersimpan disimpan dan berlaku di semua widget yang memakainya."}
                  </FocusNotice>
                </div>
              ) : null}
              <SavedPivotList
                datasetId={dataset.id}
                pivots={pivots?.ok ? pivots.data : []}
                sheetNames={sheetNames}
              />
              <Button
                asChild
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
              >
                <Link
                  href={`/datasets/${dataset.id}/pivot-tersimpan/baru`}
                  data-testid="saved-pivot-new"
                >
                  <IconPlus aria-hidden />
                  Buat pivot tersimpan
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

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
