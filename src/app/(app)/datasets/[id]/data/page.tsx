import { IconArrowLeft, IconChecklist, IconEye, IconFileSpreadsheet } from "@tabler/icons-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GridPeriodPicker } from "@/components/grid/grid-period-picker";
import { SheetGridLoader } from "@/components/grid/sheet-grid-loader";
import { SheetTabs } from "@/components/schema/sheet-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { isIdShape } from "@/features/datasets/validation";
import { gridPageView } from "@/features/query/grid-page";
import { env } from "@/lib/env";

type Params = Promise<{ id: string }>;
type Search = Promise<{ sheet?: string; sheetId?: string; version?: string; periode?: string }>;

export const metadata = { title: "Lihat data" };

/**
 * "Lihat data" (T-043, rencana G-6 §3): penampil baca-saja gaya lembar kerja untuk pemilik dataset dan
 * editor dashboard-nya. Viewer/pengguna lain → 404 (D2). Grid dimuat lazy di klien; nonce CSP
 * diteruskan ke AG Grid (styleNonce, ADR-0007). ?version= (T-054 "Lihat isi file"): pratinjau unggahan
 * periode yang menunggu konfirmasi, hanya pemilik. ?periode= (T-058): sheet periode dibatasi ke satu
 * periode lewat pemilih "Periode: Semua ▾"; kunci yang tidak ada di sheet ini = semua periode.
 */
export default async function DataViewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  // ?sheetId= (tautan dari widget tabel, T-047) didahulukan dari ?sheet= (indeks tab).
  const wanted = isIdShape(search.sheetId)
    ? search.sheetId
    : /^\d{1,4}$/.test(search.sheet ?? "")
      ? Number(search.sheet)
      : null;
  // ?version= berbentuk salah tetap dianggap pratinjau (→ "tidak lagi menunggu"), bukan versi aktif.
  const previewId = search.version === undefined ? null : String(search.version);
  const view = isIdShape(id) ? await gridPageView(user.id, id, wanted, previewId) : null;
  if (!view) notFound();
  const reviewHref = previewId ? `/datasets/${view.datasetId}/tinjau/${previewId}` : null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const owner = view.role === "OWNER";
  const back = (
    <Button asChild variant="outline" className="h-(--control-h-lg) md:h-(--control-h)">
      <Link
        href={
          view.preview === "pending" && reviewHref
            ? reviewHref
            : owner
              ? `/datasets/${view.datasetId}`
              : "/dashboards"
        }
      >
        <IconArrowLeft aria-hidden />
        {view.preview === "pending"
          ? "Kembali ke tinjauan"
          : owner
            ? "Kembali ke dataset"
            : "Kembali ke dashboard"}
      </Link>
    </Button>
  );
  const sheet = view.sheet;
  const multi = view.tabs.length > 1;
  const previewParam = view.preview === "pending" && previewId ? `&version=${previewId}` : "";
  const periods = sheet?.periods ?? null;
  const period = periods?.find((p) => p.key === search.periode)?.key ?? null;
  const periodHref = (key: string | null) =>
    `/datasets/${view.datasetId}/data?sheet=${sheet?.index ?? 0}${previewParam}${key ? `&periode=${encodeURIComponent(key)}` : ""}`;
  const allRows = periods?.every((p) => p.rows !== null)
    ? periods.reduce((n, p) => n + (p.rows ?? 0), 0)
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow={
          <span className="flex min-w-0 flex-wrap gap-x-1">
            {owner ? (
              <>
                <Link
                  href="/datasets"
                  className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
                >
                  Dataset
                </Link>
                <span aria-hidden>/</span>
                <Link
                  href={`/datasets/${view.datasetId}`}
                  className="inline-flex min-h-6 min-w-0 items-center truncate underline-offset-4 hover:underline"
                >
                  {view.datasetName}
                </Link>
              </>
            ) : (
              <span className="inline-flex min-h-6 min-w-0 items-center truncate">
                {view.datasetName}
              </span>
            )}
          </span>
        }
        title="Lihat data"
        description={
          sheet && view.version
            ? `${multi ? `Sheet "${sheet.name}" · ` : ""}${view.version.fileName ?? sheet.name}. Tampilan baca-saja: data tidak bisa diubah di sini.`
            : undefined
        }
        actions={back}
      />

      {view.preview === "pending" ? (
        <p
          className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm"
          data-testid="grid-preview-banner"
        >
          <IconEye size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Pratinjau unggahan yang belum diterapkan: isi file dengan pilihan bawaan (periode
            kemungkinan nyasar dikecualikan), bukan hasil akhir bila Anda mengubah pilihan di
            tinjauan atau data aktif berubah. Dashboard masih memakai data aktif.
          </span>
        </p>
      ) : null}

      {view.preview === "gone" ? (
        <EmptyState
          icon={<IconChecklist />}
          title="Unggahan ini tidak lagi menunggu konfirmasi"
          description="Mungkin sudah diterapkan, dibatalkan, atau dibuang otomatis. Lihat status terbarunya di halaman dataset."
          action={back}
        />
      ) : !view.version || !sheet ? (
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title="Belum ada data yang siap"
          description="Data bisa dilihat setelah file selesai diunggah dan diproses."
          action={back}
        />
      ) : !sheet.columns ? (
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title="Sheet ini belum siap"
          description="Tipe kolom sheet ini belum selesai diproses. Coba muat ulang sebentar lagi."
        />
      ) : sheet.columns.length === 0 ? (
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title="Semua kolom disembunyikan"
          description="Tampilkan kembali kolom di halaman Skema data untuk melihat isinya."
        />
      ) : (
        <>
          {periods?.length ? (
            <GridPeriodPicker
              current={period}
              options={[
                { key: null, label: "Semua periode", rows: allRows, href: periodHref(null) },
                ...periods.map((p) => ({ ...p, href: periodHref(p.key) })),
              ]}
            />
          ) : null}
          <SheetGridLoader
            // Versi/revisi/periode baru → grid baru tanpa sisa blok lama.
            key={`${sheet.id}:${sheet.schemaRevision}:${period ?? ""}`}
            sheetId={sheet.id}
            sheetName={sheet.name}
            versionId={view.version.id}
            schemaRevision={sheet.schemaRevision}
            columns={sheet.columns}
            period={period}
            exportMaxRows={env().EXPORT_MAX_ROWS}
            nonce={nonce}
          />
        </>
      )}

      {sheet ? (
        <SheetTabs
          datasetId={view.datasetId}
          sheets={view.tabs}
          current={sheet.index}
          page="data"
          extra={previewParam}
        />
      ) : null}
    </div>
  );
}
