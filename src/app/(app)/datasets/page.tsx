import { IconDatabase, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { DatasetList } from "@/components/datasets/dataset-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusNotice } from "@/components/ui/focus-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { listDatasets } from "@/features/datasets/service";

export const metadata = { title: "Dataset" };

type Search = Promise<{ deleted?: string }>;

export default async function DatasetsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [datasets, params] = await Promise.all([listDatasets(user.id), searchParams]);
  const createButton = (
    <Button asChild className="w-full sm:w-auto">
      <Link href="/datasets/baru">
        <IconPlus aria-hidden />
        Buat dataset
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dataset"
        description="Profil data Anda. Setiap dataset bisa diisi file Excel/CSV dan dipakai banyak dashboard."
        actions={datasets.length > 0 ? createButton : undefined}
      />
      {params.deleted === "1" ? <FocusNotice>Dataset dihapus.</FocusNotice> : null}
      {datasets.length === 0 ? (
        <EmptyState
          icon={<IconDatabase />}
          title="Belum ada dataset"
          description="Buat dataset dulu, lalu unggah file .xlsx atau .csv sampai 1 GB."
          action={createButton}
        />
      ) : (
        <DatasetList datasets={datasets} />
      )}
    </div>
  );
}
