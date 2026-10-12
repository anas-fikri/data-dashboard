import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardCanvas } from "@/components/dashboards/dashboard-canvas";
import { DashboardSettings } from "@/components/dashboards/dashboard-settings";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { getDashboard, getDashboardSources } from "@/features/dashboards/service";

type Params = Promise<{ id: string }>;
type Search = Promise<{ mode?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const d = await getDashboard(user.id, id);
  return { title: d?.name ?? "Tidak ditemukan" };
}

/** Dashboard: mode lihat (statis) atau mode edit (?mode=edit). Bukan pemilik → 404 (T-010). */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const d = await getDashboard(user.id, id);
  if (!d) notFound();
  const editing = search.mode === "edit";
  // Sumber data panel konfigurasi hanya dibutuhkan saat mengedit.
  const sources = editing ? await getDashboardSources(user.id, d.dataset.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex min-w-0 flex-wrap gap-x-1">
            <Link
              href="/dashboards"
              className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
            >
              Dashboard
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/datasets/${d.dataset.id}`}
              className="inline-flex min-h-6 min-w-0 items-center underline-offset-4 hover:underline"
            >
              <span className="truncate">{d.dataset.name}</span>
            </Link>
          </span>
        }
        title={d.name}
        description={editing ? "Mode edit: perubahan tata letak tersimpan otomatis." : undefined}
        actions={
          editing ? undefined : (
            <Button asChild className="h-(--control-h-lg) md:h-(--control-h)">
              <Link href={`/dashboards/${d.id}?mode=edit`} data-testid="edit-dashboard">
                <IconPencil aria-hidden />
                Ubah tata letak
              </Link>
            </Button>
          )
        }
      />
      {/* Tanpa revisi di key: refresh server (mis. ganti nama) tidak me-mount ulang editor dan
          membuang perubahan yang belum terkirim. Pindah mode = mount baru dengan data terbaru. */}
      <DashboardCanvas
        key={`${d.id}:${editing ? "edit" : "view"}`}
        dashboardId={d.id}
        widgets={d.widgets}
        layout={d.layout}
        revision={d.layoutRevision}
        editing={editing}
        datasetId={d.dataset.id}
        sources={sources}
      />
      {editing ? <DashboardSettings id={d.id} name={d.name} /> : null}
    </div>
  );
}
