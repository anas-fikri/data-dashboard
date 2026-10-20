import { IconArrowLeft, IconFileSpreadsheet } from "@tabler/icons-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
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
type Search = Promise<{ sheet?: string; sheetId?: string }>;

export const metadata = { title: "Lihat data" };

/**
 * "Lihat data" (T-043, rencana G-6 §3): penampil baca-saja gaya lembar kerja untuk pemilik dataset dan
 * editor dashboard-nya. Viewer/pengguna lain → 404 (D2). Grid dimuat lazy di klien; nonce CSP
 * diteruskan ke AG Grid (styleNonce, ADR-0007).
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
  const view = isIdShape(id) ? await gridPageView(user.id, id, wanted) : null;
  if (!view) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const owner = view.role === "OWNER";
  const back = (
    <Button asChild variant="outline" className="h-(--control-h-lg) md:h-(--control-h)">
      <Link href={owner ? `/datasets/${view.datasetId}` : "/dashboards"}>
        <IconArrowLeft aria-hidden />
        {owner ? "Kembali ke dataset" : "Kembali ke dashboard"}
      </Link>
    </Button>
  );
  const sheet = view.sheet;
  const multi = view.tabs.length > 1;

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

      {!view.version || !sheet ? (
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
        <SheetGridLoader
          // Versi/revisi baru (Muat ulang setelah data diperbarui) → grid baru tanpa sisa blok lama.
          key={`${sheet.id}:${sheet.schemaRevision}`}
          sheetId={sheet.id}
          sheetName={sheet.name}
          versionId={view.version.id}
          schemaRevision={sheet.schemaRevision}
          columns={sheet.columns}
          exportMaxRows={env().EXPORT_MAX_ROWS}
          nonce={nonce}
        />
      )}

      {sheet ? (
        <SheetTabs
          datasetId={view.datasetId}
          sheets={view.tabs}
          current={sheet.index}
          page="data"
        />
      ) : null}
    </div>
  );
}
