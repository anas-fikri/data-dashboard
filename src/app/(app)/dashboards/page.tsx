import { IconDatabase, IconLayoutDashboard, IconPlus, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { DashboardList } from "@/components/dashboards/dashboard-list";
import { hiddenSharedText } from "@/components/sharing/share-model";
import { SharedDashboardList } from "@/components/sharing/shared-dashboard-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusNotice } from "@/components/ui/focus-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import {
  listDashboards,
  listSharedDashboards,
  SHARED_PER_OWNER_MAX,
} from "@/features/dashboards/service";
import { listDatasets } from "@/features/datasets/service";

export const metadata = { title: "Dashboard" };

type Search = Promise<{ deleted?: string }>;

/**
 * Dashboard milik user (T-010) dan yang dibagikan ke user (T-016, termasuk berbagi organisasi). Bagian
 * "Dibagikan ke saya" selalu tampil — juga bagi user tanpa dataset (persona viewer); keadaan kosong
 * "Belum ada dataset" hanya untuk bagian milik sendiri. User tanpa dashboard sendiri tetapi punya
 * dashboard bersama melihat bagian bersama lebih dulu. Dashboard bersama yang terpotong (daftar terlalu
 * panjang, batas per pemilik) disebut di bawah daftar, tidak hilang diam-diam (review T-016 R3-SEC-2,
 * R4-UI-2).
 */
export default async function DashboardsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [dashboards, { items: shared, hidden }, datasets, params] = await Promise.all([
    listDashboards(user.id),
    listSharedDashboards(user.id),
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
  const heading = "text-base font-semibold";

  const own = (
    <section key="own" aria-labelledby="dashboard-saya" className="flex flex-col gap-3">
      <h2 id="dashboard-saya" className={heading}>
        Dashboard saya
      </h2>
      {datasets.length === 0 ? (
        <EmptyState
          icon={<IconDatabase />}
          as="p"
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
          as="p"
          title="Belum ada dashboard"
          description="Buat dashboard pertama untuk salah satu dataset Anda."
          action={createButton}
        />
      ) : (
        <DashboardList dashboards={dashboards} />
      )}
    </section>
  );
  const sharedSection = (
    <section key="shared" aria-labelledby="dibagikan-ke-saya" className="flex flex-col gap-3">
      <h2 id="dibagikan-ke-saya" className={heading}>
        Dibagikan ke saya
      </h2>
      {shared.length ? (
        <SharedDashboardList dashboards={shared} />
      ) : (
        <EmptyState
          icon={<IconUsers />}
          as="p"
          title="Belum ada dashboard yang dibagikan"
          description="Dashboard yang dibagikan rekan atau ke seluruh organisasi muncul di sini."
          className="py-8"
        />
      )}
      {hidden > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="shared-hidden">
          {hiddenSharedText(hidden, SHARED_PER_OWNER_MAX)}
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Dashboard dari dataset Anda dan yang dibagikan rekan."
        actions={dashboards.length > 0 ? createButton : undefined}
      />
      {params.deleted === "1" ? <FocusNotice>Dashboard dihapus.</FocusNotice> : null}
      {dashboards.length === 0 && shared.length > 0 ? [sharedSection, own] : [own, sharedSection]}
    </div>
  );
}
