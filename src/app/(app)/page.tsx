import { IconDatabase, IconLayoutDashboard, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { DatasetList } from "@/components/datasets/dataset-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { listDatasets } from "@/features/datasets/service";

/** Beranda: satu aksi utama (buat dataset) + dataset terbaru. Dashboard dibagikan datang di T-016. */
export default async function HomePage() {
  const user = await requireUser();
  const datasets = await listDatasets(user.id);
  const recent = datasets.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        description="Dataset dan dashboard yang bisa Anda akses."
        actions={
          <Button asChild>
            <Link href="/datasets/baru">
              <IconPlus aria-hidden />
              Buat dataset
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Dataset saya</CardTitle>
            {datasets.length > recent.length ? (
              <Link href="/datasets" className="text-sm font-medium underline underline-offset-4">
                Lihat semua ({datasets.length})
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                bare
                as="p"
                icon={<IconDatabase />}
                title="Belum ada dataset"
                description="Unggah file .xlsx atau .csv sampai 1 GB untuk mulai."
                className="py-8"
              />
            ) : (
              <DatasetList datasets={recent} compact bare />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dashboard dibagikan ke saya</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              bare
              as="p"
              icon={<IconLayoutDashboard />}
              title="Belum ada dashboard"
              description="Dashboard yang dibagikan rekan akan muncul di sini."
              className="py-8"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
