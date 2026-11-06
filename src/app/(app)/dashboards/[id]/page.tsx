import { IconTable } from "@tabler/icons-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { DashboardCanvas } from "@/components/dashboards/dashboard-canvas";
import {
  DashboardPdfExport,
  DashboardPdfWatch,
} from "@/components/dashboards/dashboard-pdf-export";
import { DashboardSettings } from "@/components/dashboards/dashboard-settings";
import { EditDashboardLink } from "@/components/dashboards/edit-dashboard-link";
import { EmailText } from "@/components/admin/email-text";
import { SharedRoleBadge } from "@/components/sharing/access-badge";
import { ShareDialog } from "@/components/sharing/share-dialog";
import { GuideHelp } from "@/components/guides/guide-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ExportUserProvider } from "@/components/widgets/export-user";
import { clientIp } from "@/features/auth/rate-limit";
import { requireUser } from "@/features/auth/session";
import { getDashboard, getDashboardSources } from "@/features/dashboards/service";
import { listSavedPivots } from "@/features/saved-pivots/service";
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
 * lihat di server sebelum sumber data dimuat. Editor mengedit widget/tata letak dan kolom filter (bilah
 * filter, T-k2ec), tetapi nama, hapus, berbagi, dan halaman dataset tetap milik pemilik. Filter aktif di ?f= (JSON, T-012)
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
  // Pivot tersimpan dataset untuk pilihan "Sumber data" panel (T-074): pemilik/editor saja (service
  // menolak selain itu); viewer tidak pernah sampai mode edit.
  const saved = editing ? await listSavedPivots(user.id, d.dataset.id) : null;
  const savedPivots = saved?.ok
    ? saved.data.map((p) => ({
        id: p.id,
        name: p.name,
        spec: p.spec,
        revision: p.revision,
        canEdit: p.canEdit,
      }))
    : [];
  // Aksi kepala: Ekspor PDF (T-018) mode lihat untuk semua peran bila ada widget; Bagikan pemilik
  // (kedua mode); Ubah tata letak pemilik/editor di mode lihat. Tanpa aksi → tanpa slot. Tanpa tombol
  // (mode edit), PDF yang sedang dibuat tetap dipantau dan diunduh otomatis (DashboardPdfWatch).
  const pdf = !editing && d.widgets.length > 0;
  const hasActions = pdf || isOwner || canEdit;

  return (
    // Ekspor widget dan PDF disimpan per user (review T-017 R2-CL-1): keluar → masuk sebagai user lain
    // tanpa reload tidak mewarisinya. Kepala halaman ikut di dalamnya (tombol Ekspor PDF).
    <ExportUserProvider userId={user.id}>
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
                  <span
                    className="min-w-0 [overflow-wrap:anywhere]"
                    data-testid="dashboard-dataset"
                  >
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
            hasActions ? (
              <>
                {canEdit ? (
                  <GuideHelp
                    context="BUILDER"
                    page="Penyusun dashboard"
                    as={isOwner ? "OWNER" : "EDITOR"}
                  />
                ) : null}
                {pdf ? <DashboardPdfExport dashboardId={d.id} /> : null}
                {isOwner ? <ShareDialog dashboardId={d.id} dashboardName={d.name} /> : null}
                {canEdit && !editing ? (
                  // Lihat data (T-043): seluruh sheet dataset untuk pemilik/editor; viewer tidak.
                  <Button
                    asChild
                    variant="outline"
                    className="h-(--control-h-lg) md:h-(--control-h)"
                  >
                    <Link href={`/datasets/${d.dataset.id}/data`} data-testid="dashboard-data-link">
                      <IconTable aria-hidden />
                      Lihat data
                    </Link>
                  </Button>
                ) : null}
                {canEdit && !editing ? <EditDashboardLink id={d.id} /> : null}
              </>
            ) : undefined
          }
        />
        {pdf ? null : <DashboardPdfWatch dashboardId={d.id} />}
        {/* Tanpa revisi di key: refresh server (mis. ganti nama) tidak me-mount ulang editor dan
          membuang perubahan yang belum terkirim. Pindah mode = mount baru dengan data terbaru. Mode
          lihat memuat ulang widget/tata letak dari props baru tanpa remount (filter/popover tetap);
          Back/Forward disegarkan oleh kanvas sendiri (dashboard-canvas). */}
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
          savedPivots={savedPivots}
          filterColumns={d.filterColumns}
          crossFilterColumns={d.crossFilterColumns}
        />
        {/* Nama, kolom filter (D6), dan hapus: pemilik saja; editor mengatur kolom filter di bilah filter. */}
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
    </ExportUserProvider>
  );
}
