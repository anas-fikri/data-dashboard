import { IconFileSpreadsheet, IconTableOptions } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { DeleteDataset } from "@/components/datasets/delete-dataset";
import { StatusBadge } from "@/components/datasets/status-badge";
import { UploadPanel } from "@/components/datasets/upload-panel";
import { VersionHistory } from "@/components/datasets/version-history";
import { formatJakarta } from "@/components/datasets/version-history-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusNotice } from "@/components/ui/focus-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { getDataset } from "@/features/datasets/service";
import { prismaSchemaRepo } from "@/features/schema/runtime";
import type { IngestStatus } from "@/features/schema/service";
import { getPendingUpload } from "@/features/uploads/service";
import { listVersions } from "@/features/versions/service";
import { env } from "@/lib/env";

type Params = Promise<{ id: string }>;
type Search = Promise<{ created?: string }>;

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
  // Riwayat versi terpisah dari ringkasan agar daftar dataset tetap ringan.
  const [pending, versions] = await Promise.all([
    processing ? null : getPendingUpload(user.id, dataset.id),
    listVersions(user.id, dataset.id),
  ]);
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
      />
      {search.created === "1" ? <FocusNotice>Dataset dibuat.</FocusNotice> : null}
      <div>
        <StatusBadge label={dataset.label} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>File Excel/CSV yang menjadi isi dataset ini.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {badge?.kind === "failed" ? (
            <FormAlert tone="error">
              <span className="block font-medium">
                {dataset.latestFileName
                  ? `Unggahan "${dataset.latestFileName}" gagal diproses.`
                  : "Unggahan terakhir gagal diproses."}
              </span>
              {badge.message ? (
                <span className="block" data-testid="dataset-status-message">
                  {badge.message}
                </span>
              ) : null}
              <span className="block">
                {active
                  ? "Dashboard tetap memakai data aktif sebelumnya. Perbaiki file lalu unggah ulang."
                  : "Perbaiki file lalu unggah ulang."}
              </span>
            </FormAlert>
          ) : null}
          {active ? (
            <p className="flex items-start gap-3 text-sm" data-testid="dataset-active">
              <IconFileSpreadsheet
                size={20}
                stroke={1.5}
                aria-hidden
                className="mt-0.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0">
                <span className="block text-muted-foreground">Data aktif</span>
                <span className="block truncate font-medium">
                  {active.originalName ?? "Tanpa nama file"}
                </span>
                {active.finishedAt ? (
                  <span className="block text-muted-foreground">
                    Diperbarui {formatJakarta(active.finishedAt)}
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}
          {active ? (
            <div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
              >
                <Link href={`/datasets/${dataset.id}/skema`} data-testid="dataset-schema-link">
                  <IconTableOptions aria-hidden />
                  Tinjau &amp; koreksi skema
                </Link>
              </Button>
            </div>
          ) : null}
          <UploadPanel
            datasetId={dataset.id}
            maxBytes={env().MAX_UPLOAD_BYTES}
            hasData={Boolean(active)}
            pending={pending}
            processing={
              ingest
                ? { kind: "ingest", status: ingest }
                : badge?.kind === "awaiting_mapping"
                  ? {
                      kind: "mapping",
                      versionId: mapping?.id ?? null,
                      fileName: mapping?.fileName ?? dataset.latestFileName,
                      message: mapping?.message ?? null,
                    }
                  : null
            }
          />
        </CardContent>
      </Card>

      {versions.length > 0 ? <VersionHistory datasetId={dataset.id} versions={versions} /> : null}

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
          />
        </CardContent>
      </Card>
    </div>
  );
}
