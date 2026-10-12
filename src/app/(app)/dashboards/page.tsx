import { IconDatabase, IconLayoutDashboard, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { DashboardList } from "@/components/dashboards/dashboard-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusNotice } from "@/components/ui/focus-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { listDashboards } from "@/features/dashboards/service";
import { listDatasets } from "@/features/datasets/service";

export const metadata = { title: "Dashboard" };

type Search = Promise<{ deleted?: string }>;

/** Daftar dashboard milik user di semua dataset-nya (T-010). */
export default async function DashboardsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [dashboards, datasets, params] = await Promise.all([
    listDashboards(user.id),
    listDatasets(user.id),
    searchParams,
  ]);
  const cta = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  const createButton = (
    <Button asChild className={cta}>
      <Link href="/dashboards/baru">
        <IconPlus aria-hidden />
        Buat dashboard
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Rakit tampilan data dari dataset Anda: atur widget di grid, simpan otomatis."
        actions={dashboards.length > 0 ? createButton : undefined}
      />
      {params.deleted === "1" ? <FocusNotice>Dashboard dihapus.</FocusNotice> : null}
      {datasets.length === 0 ? (
        <EmptyState
          icon={<IconDatabase />}
          title="Belum ada dataset"
          description="Dashboard menampilkan isi sebuah dataset. Buat dataset dan unggah file dulu."
          action={
            <Button asChild className={cta}>
              <Link href="/datasets/baru">
                <IconPlus aria-hidden />
                Buat dataset
              </Link>
            </Button>
          }
        />
      ) : dashboards.length === 0 ? (
        <EmptyState
          icon={<IconLayoutDashboard />}
          title="Belum ada dashboard"
          description="Buat dashboard pertama untuk salah satu dataset Anda."
          action={createButton}
        />
      ) : (
        <DashboardList dashboards={dashboards} />
      )}
    </div>
  );
}
