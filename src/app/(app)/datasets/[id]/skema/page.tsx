import { IconArrowLeft, IconFileSpreadsheet } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ColumnEditor } from "@/components/schema/column-editor";
import { HeaderRowPicker } from "@/components/schema/header-row-picker";
import { fmtInt } from "@/components/schema/labels";
import { RecastBanner } from "@/components/schema/recast-banner";
import { RefreshButton } from "@/components/schema/refresh-button";
import { SampleSection, SampleSkeleton } from "@/components/schema/sample-section";
import { SheetTabs } from "@/components/schema/sheet-tabs";
import { RecastProvider } from "@/components/schema/use-recast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { isIdShape } from "@/features/datasets/validation";
import { prismaSchemaRepo } from "@/features/schema/runtime";
import type { SheetView } from "@/features/schema/service";

type Params = Promise<{ id: string }>;
type Search = Promise<{ sheet?: string }>;

export const metadata = { title: "Skema data" };

/** Baris data = baris tersimpan dikurangi baris s.d. judul (pasti bila judul ada di pratinjau). */
function dataRows(s: SheetView): number {
  const above = s.preview?.rows.filter((r) => r.row <= s.headerRow).length;
  return Math.max(0, s.rawRows - (above ?? 1));
}

/** Review dan koreksi skema per sheet (T-008). Bukan pemilik atau tidak ada → 404. */
export default async function SchemaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const wanted = /^\d{1,4}$/.test(search.sheet ?? "") ? Number(search.sheet) : null;
  const view = isIdShape(id) ? await prismaSchemaRepo.schemaView(user.id, id, wanted) : null;
  if (!view) notFound();

  const back = (
    <Button asChild variant="outline" className="h-(--control-h-lg) md:h-(--control-h)">
      <Link href={`/datasets/${view.datasetId}`}>
        <IconArrowLeft aria-hidden />
        Kembali ke dataset
      </Link>
    </Button>
  );
  const header = (
    <PageHeader
      eyebrow={
        <span className="flex min-w-0 flex-wrap gap-x-1">
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
        </span>
      }
      title="Skema data"
      description="Periksa nama dan tipe kolom hasil deteksi otomatis, lalu perbaiki bila perlu. Perubahan diterapkan ke data aktif tanpa mengunggah ulang file."
      actions={back}
    />
  );

  const sheet = view.sheet;
  if (!view.version || !sheet) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title="Belum ada data yang siap"
          description="Unggah file Excel atau CSV di halaman dataset. Skema bisa ditinjau setelah file selesai diproses."
          action={back}
        />
      </div>
    );
  }

  const facts = [
    ["Baris data", fmtInt(dataRows(sheet))],
    ["Kolom", fmtInt(sheet.colCount)],
    ["Baris judul", fmtInt(sheet.headerRow)],
    ["Kolom disembunyikan", fmtInt(sheet.schema?.filter((c) => c.hidden).length ?? 0)],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {view.tabs.length > 1 ? (
        <SheetTabs datasetId={view.datasetId} sheets={view.tabs} current={sheet.index} />
      ) : null}

      <section aria-labelledby="sheet-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h2 id="sheet-title" className="text-lg font-semibold">
            {view.tabs.length > 1 ? `Sheet "${sheet.name}"` : (view.version.fileName ?? sheet.name)}
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-md border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-base font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {sheet.truncatedCells > 0 ? (
            <p className="rounded-md bg-warning/15 px-3 py-2 text-sm">
              {fmtInt(sheet.truncatedCells)} sel lebih dari 32.767 karakter dipotong saat diproses.
            </p>
          ) : null}
        </div>

        {sheet.schema ? (
          <RecastProvider
            key={`${sheet.id}:${sheet.schemaRevision}`}
            sheetId={sheet.id}
            revision={sheet.schemaRevision}
          >
            <RecastBanner schema={sheet.schema} />
            <Card>
              <CardHeader>
                <CardTitle as="h3">Baris judul kolom</CardTitle>
              </CardHeader>
              <CardContent>
                <HeaderRowPicker headerRow={sheet.headerRow} preview={sheet.preview} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h3">Kolom</CardTitle>
                <CardDescription>
                  Nama baru dipakai di builder dashboard; nama asli dari file tetap tersimpan. Kolom
                  yang disembunyikan tidak muncul di builder.
                </CardDescription>
              </CardHeader>
              <ColumnEditor schema={sheet.schema} />
            </Card>
          </RecastProvider>
        ) : (
          <EmptyState
            as="h3"
            icon={<IconFileSpreadsheet />}
            title="Sheet ini belum siap"
            description="Tipe kolom sheet ini belum selesai dideteksi. Coba muat ulang sebentar lagi."
            action={<RefreshButton />}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle as="h3">Contoh data</CardTitle>
            <CardDescription>
              50 baris pertama setelah baris judul, sesuai tipe kolom sekarang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense key={`${sheet.id}:${sheet.schemaRevision}`} fallback={<SampleSkeleton />}>
              <SampleSection userId={user.id} datasetId={view.datasetId} sheetId={sheet.id} />
            </Suspense>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
