import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { DashboardCanvas } from "@/components/dashboards/dashboard-canvas";
import { DashboardSettings } from "@/components/dashboards/dashboard-settings";
import { EditDashboardLink } from "@/components/dashboards/edit-dashboard-link";
import { EmailText } from "@/components/admin/email-text";
import { SharedRoleBadge } from "@/components/sharing/access-badge";
import { ShareDialog } from "@/components/sharing/share-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ExportUserProvider } from "@/components/widgets/export-user";
import { clientIp } from "@/features/auth/rate-limit";
import { requireUser } from "@/features/auth/session";
import { getDashboard, getDashboardSources } from "@/features/dashboards/service";
import { recordDashboardOpen } from "@/features/sharing/service";
import { env } from "@/lib/env";

type Params = Promise<{ id: string }>;
type Search = Promise<{ mode?: string | string[]; f?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const d = await getDashboard(user.id, id);
  return { title: d?.name ?? "Tidak ditemukan" };
}

/**
 * Dashboard: mode lihat (statis) atau mode edit (?mode=edit). Tanpa akses (bukan pemilik, tanpa share
 * user/organisasi) → 404 (T-010, T-016). Viewer tidak punya mode edit: ?mode=edit dialihkan ke URL
 * lihat di server sebelum sumber data dimuat. Editor mengedit widget/tata letak, tetapi nama, kolom
 * filter, hapus, berbagi, dan halaman dataset tetap milik pemilik. Filter aktif di ?f= (JSON, T-012)
 * dibaca di klien dari URL (useSearchParams): rusak → diabaikan; disaring terhadap kolom yang diizinkan.
 */
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
  const isOwner = d.role === "OWNER";
  const sharedRole = d.role === "OWNER" ? null : d.role;
  const canEdit = isOwner || d.role === "EDITOR";
  const editing = first(search.mode) === "edit";
  if (editing && !canEdit) {
    const f = first(search.f);
    redirect(`/dashboards/${d.id}${f ? `?f=${encodeURIComponent(f)}` : ""}`);
  }
  // Audit pembukaan (T-016) setelah respons terkirim, tidak menahan render; dedup 30 menit di service
  // (muat ulang, pindah mode, dan refresh server tidak menambah baris). IP dibaca sekarang: headers()
  // tidak boleh dipanggil di dalam after() pada Server Component.
  const ip = clientIp(await headers(), env().TRUST_PROXY);
  after(() => recordDashboardOpen(user.id, d.id, d.role, ip));
  // Sumber data panel konfigurasi hanya untuk mode edit (pemilik/editor; viewer sudah dialihkan).
  const sources = editing ? await getDashboardSources(user.id, d.id) : [];

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
            {/* Halaman dataset hanya untuk pemilik: non-pemilik melihat namanya tanpa tautan (bukan 404)
                dan membungkus, bukan terpotong — di sini satu-satunya tempat nama lengkapnya terbaca. */}
            {isOwner ? (
              <Link
                href={`/datasets/${d.dataset.id}`}
                className="inline-flex min-h-6 min-w-0 items-center underline-offset-4 hover:underline"
              >
                <span className="truncate">{d.dataset.name}</span>
              </Link>
            ) : (
              <span className="inline-flex min-h-6 min-w-0 items-center">
                <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="dashboard-dataset">
                  {d.dataset.name}
                </span>
              </span>
            )}
          </span>
        }
        title={d.name}
        description={editing ? "Mode edit: perubahan tata letak tersimpan otomatis." : undefined}
        meta={
          sharedRole ? (
            <>
              <SharedRoleBadge role={sharedRole} />
              {/* Nama tampilan bisa meniru rekan: email pemilik selalu ikut (review T-016 R3-CC-1). */}
              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="dashboard-owner">
                Dibagikan oleh{" "}
                {d.ownerName ? (
                  <>
                    <bdi className="font-medium text-foreground">{d.ownerName}</bdi>
                    {" ("}
                    <EmailText email={d.ownerEmail} />
                    {")"}
                  </>
                ) : (
                  <span className="font-medium text-foreground">
                    <EmailText email={d.ownerEmail} />
                  </span>
                )}
              </span>
            </>
          ) : undefined
        }
        actions={
          isOwner || (canEdit && !editing) ? (
            <>
              {isOwner ? <ShareDialog dashboardId={d.id} dashboardName={d.name} /> : null}
              {canEdit && !editing ? <EditDashboardLink id={d.id} /> : null}
            </>
          ) : undefined
        }
      />
      {/* Tanpa revisi di key: refresh server (mis. ganti nama) tidak me-mount ulang editor dan
          membuang perubahan yang belum terkirim. Pindah mode = mount baru dengan data terbaru. Mode
          lihat memuat ulang widget/tata letak dari props baru tanpa remount (filter/popover tetap);
          Back/Forward disegarkan oleh kanvas sendiri (dashboard-canvas). Ekspor widget disimpan per
          user (review T-017 R2-CL-1): keluar → masuk sebagai user lain tanpa reload tidak mewarisinya. */}
      <ExportUserProvider userId={user.id}>
        <DashboardCanvas
          key={`${d.id}:${editing ? "edit" : "view"}`}
          dashboardId={d.id}
          role={d.role}
          widgets={d.widgets}
          layout={d.layout}
          revision={d.layoutRevision}
          editing={editing}
          datasetId={d.dataset.id}
          sources={sources}
          filterColumns={d.filterColumns}
          crossFilterColumns={d.crossFilterColumns}
        />
      </ExportUserProvider>
      {/* Nama, kolom filter (D6), dan hapus: pemilik saja; editor hanya widget dan tata letak. */}
      {editing && isOwner ? (
        <DashboardSettings
          id={d.id}
          name={d.name}
          filterColumns={d.filterColumns}
          sources={sources}
          access={d.access}
        />
      ) : null}
    </div>
  );
}
