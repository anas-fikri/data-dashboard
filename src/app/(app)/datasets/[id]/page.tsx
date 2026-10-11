import { IconFileSpreadsheet } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { DeleteDataset } from "@/components/datasets/delete-dataset";
import { StatusBadge } from "@/components/datasets/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { getDataset } from "@/features/datasets/service";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  return { title: dataset?.name ?? "Tidak ditemukan" };
}

/** Detail profil dataset. Bukan pemilik atau tidak ada → 404 (D2). */
export default async function DatasetDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const dataset = await getDataset(user.id, id);
  if (!dataset) notFound();

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
      <div>
        <StatusBadge label={dataset.label} showMessage />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>File Excel/CSV yang menjadi isi dataset ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            bare
            as="p"
            icon={<IconFileSpreadsheet />}
            title={dataset.label.state === "siap" ? "Data siap dipakai" : "Belum ada data"}
            description="Unggah file .xlsx atau .csv sampai 1 GB. Fitur unggah tersedia di pembaruan berikutnya."
            className="py-8"
          />
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
