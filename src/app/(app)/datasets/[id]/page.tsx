import { IconFileSpreadsheet } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { DeleteDataset } from "@/components/datasets/delete-dataset";
import { StatusBadge } from "@/components/datasets/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusNotice } from "@/components/ui/focus-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { getDataset } from "@/features/datasets/service";

type Params = Promise<{ id: string }>;
type Search = Promise<{ created?: string }>;

function formatDate(d: Date): string {
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/datasets" className="underline-offset-4 hover:underline">
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
                    Diperbarui {formatDate(active.finishedAt)}
                  </span>
                ) : null}
              </span>
            </p>
          ) : (
            <EmptyState
              bare
              as="p"
              icon={<IconFileSpreadsheet />}
              title="Belum ada data"
              description="Isi dataset ini dengan file .xlsx atau .csv sampai 1 GB."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

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
