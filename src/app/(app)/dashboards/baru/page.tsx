import { IconDatabase, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { DashboardForm } from "@/components/dashboards/dashboard-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { listDatasets } from "@/features/datasets/service";

export const metadata = { title: "Buat dashboard" };

type Search = Promise<{ dataset?: string }>;

export default async function NewDashboardPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [datasets, params] = await Promise.all([listDatasets(user.id), searchParams]);
  const preset = datasets.some((d) => d.id === params.dataset) ? params.dataset : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link
            href="/dashboards"
            className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
          >
            Dashboard
          </Link>
        }
        title="Buat dashboard"
        description="Pilih dataset sumbernya dan beri nama. Widget ditambahkan setelah dashboard dibuat."
      />
      {datasets.length === 0 ? (
        <EmptyState
          icon={<IconDatabase />}
          title="Belum ada dataset"
          description="Dashboard menampilkan isi sebuah dataset. Buat dataset dulu."
          action={
            <Button asChild className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto">
              <Link href="/datasets/baru">
                <IconPlus aria-hidden />
                Buat dataset
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <DashboardForm
              datasets={datasets.map((d) => ({
                id: d.id,
                name: d.name,
                dashboardCount: d.dashboardCount,
              }))}
              defaultDatasetId={preset}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
