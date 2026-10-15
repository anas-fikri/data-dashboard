import { IconDatabase, IconLayoutDashboard, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { AdminRevokedNotice } from "@/components/admin/admin-revoked-notice";
import { DatasetList } from "@/components/datasets/dataset-list";
import { SharedDashboardList } from "@/components/sharing/shared-dashboard-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { listSharedDashboards } from "@/features/dashboards/service";
import { listDatasets } from "@/features/datasets/service";

type Search = Promise<{ notice?: string | string[] }>;

/** Beranda: satu aksi utama (buat dataset) + dataset terbaru + dashboard yang dibagikan (T-016). */
export default async function HomePage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [datasets, shared, params] = await Promise.all([
    listDatasets(user.id),
    listSharedDashboards(user.id),
    searchParams,
  ]);
  const recent = datasets.slice(0, 5);
  const recentShared = shared.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        description="Dataset dan dashboard yang bisa Anda akses."
        actions={
          <Button asChild className="h-(--control-h-lg) md:h-(--control-h)">
            <Link href="/datasets/baru">
              <IconPlus aria-hidden />
              Buat dataset
            </Link>
          </Button>
        }
      />
      {/*
       * Admin mencabut aksesnya sendiri (T-019): konfirmasi setelah muat ulang penuh ke Beranda. Hanya
       * bila memang bukan admin lagi, jadi tautan buatan tidak bisa menampilkannya ke admin aktif.
       */}
      {params.notice === "admin-dicabut" && !user.isAdmin ? <AdminRevokedNotice /> : null}

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
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Dashboard dibagikan ke saya</CardTitle>
            {shared.length > recentShared.length ? (
              <Link href="/dashboards" className="text-sm font-medium underline underline-offset-4">
                Lihat semua ({shared.length})
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {recentShared.length === 0 ? (
              <EmptyState
                bare
                as="p"
                icon={<IconLayoutDashboard />}
                title="Belum ada dashboard"
                description="Dashboard yang dibagikan rekan akan muncul di sini."
                className="py-8"
              />
            ) : (
              <SharedDashboardList dashboards={recentShared} compact bare />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
