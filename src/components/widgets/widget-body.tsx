"use client";

import { useEffect, useState } from "react";
import { useReportStale, useWidgetFilters } from "@/components/dashboards/filters/filter-context";
import type { WidgetConfig } from "@/features/widgets/spec";
import { bodyState, configVersion, type BodyState } from "./body-state";
import { ChartWidget } from "./chart-widget";
import { KpiView } from "./kpi-view";
import { SkippedNote } from "./skipped-note";
import { TableView, type TableSort } from "./table-view";
import { WidgetError } from "./widget-error";
import { useWidgetQuery } from "./widget-query";

/*
 * Isi widget yang sudah diatur (T-011): memuat data lewat /api/query { widgetId } dan menampilkan
 * KPI, grafik, atau tabel. Setiap widget berdiri sendiri — gagal di satu widget (mis. kolom
 * disembunyikan) tidak mengganggu widget lain. Status: memuat (kerangka), gagal (pesan + coba lagi
 * untuk gangguan sementara), kosong, berhasil. Status itu dilaporkan ke kartu (onState) untuk tombol
 * data grafik di kepala kartu.
 *
 * Filter dashboard (T-012) ikut dikirim (dashboardFilters); filter berubah → tabel kembali ke halaman
 * pertama. Selama memuat ulang data lama tetap tampil dengan kontras penuh (bukan diredupkan — teks
 * redup gagal kontras), ditandai garis progres di bawah kepala kartu (mode warna paksa: Highlight) +
 * aria-busy. Data lama dari filter LAIN yang belum terganti setelah 0,4 s → penanda "Memperbarui…" di
 * kepala kartu (onState `stale`), agar angka basi tidak terbaca seolah sudah tersaring; diumumkan
 * sekali untuk semua kartu oleh bilah filter (useReportStale). Query dengan
 * filter baru gagal → keadaan galat penuh (widget-error.tsx), bukan baris/total lama seolah sudah
 * tersaring. Filter yang tidak berlaku disebut di catatan di bawah isi (skipped-note.tsx).
 */
type Configured = Exclude<WidgetConfig, { type: "empty" }>;

/** Data lama dari filter lain dianggap basi (label di kepala kartu) bila memuat lebih lama dari ini. */
const STALE_LABEL_MS = 400;

interface Props {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  /** Kartu punya pegangan resize di pojok kanan bawah (mode edit di grid). */
  resizable?: boolean;
  /** Grafik: tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData?: boolean;
  /** Status isi untuk versi spec ini (+ data basi sedang diperbarui); fungsi harus stabil. */
  onState?: (version: string, state: BodyState, stale: boolean) => void;
}

export function WidgetBody(props: Props) {
  // Spec berubah → mount baru (halaman/urutan tabel kembali ke awal, query ulang).
  const version = configVersion(props.config);
  return <Loaded key={version} {...props} version={version} />;
}

function Loaded({
  widgetId,
  config,
  title,
  editing,
  resizable = false,
  version,
  showData = false,
  onState,
}: Props & { version: string }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TableSort>(null);
  const cross = useWidgetFilters(widgetId);
  // Filter berubah → halaman pertama (bukan halaman 7 dari hasil yang kini 2 halaman).
  const filterKey = JSON.stringify(cross.filters);
  const [seenFilters, setSeenFilters] = useState(filterKey);
  if (seenFilters !== filterKey) {
    setSeenFilters(filterKey);
    setPage(0);
  }
  const filters = cross.filters.length ? { dashboardFilters: cross.filters } : {};
  const request =
    config.type === "table"
      ? { widgetId, page, ...(sort ? { sort } : {}), ...filters }
      : { widgetId, ...filters };
  const { state, retry } = useWidgetQuery(request, version);
  const data = state.data;
  const refetching = state.status === "loading" && !!data;
  // Tabel: data lama tetap di bawah pesan galat hanya bila filternya sama (halaman/urutan gagal).
  const keepOnError = config.type === "table" && state.filters === JSON.stringify(cross.filters);
  const shown = bodyState(state, keepOnError);
  // Data yang tampil milik filter lain dan belum terganti setelah jeda singkat → label "Memperbarui…"
  // di kepala kartu (bukan untuk ganti halaman/urutan tabel atau coba lagi dengan filter yang sama).
  const otherFilters = refetching && state.filters !== JSON.stringify(cross.filters);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!otherFilters) return;
    const t = setTimeout(() => setStale(true), STALE_LABEL_MS);
    return () => {
      clearTimeout(t);
      setStale(false);
    };
  }, [otherFilters]);
  useEffect(() => onState?.(version, shown, stale), [onState, version, shown, stale]);
  // Pembaca layar: satu pengumuman di bilah filter untuk semua kartu basi (bukan satu per kartu).
  useReportStale(widgetId, stale);

  if (state.status === "error" && !(data && keepOnError)) {
    return (
      <WidgetError
        title={title}
        code={state.code}
        message={state.message}
        editing={editing}
        onRetry={retry}
      />
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" aria-busy="true">
        <span className="sr-only">Memuat data widget…</span>
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="min-h-0 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  let content: React.ReactNode;
  switch (config.type) {
    case "kpi":
      content = (
        <KpiView
          data={data}
          format={config.spec.format}
          title={title}
          agg={config.spec.measure.agg}
        />
      );
      break;
    case "table":
      content = (
        <>
          {state.status === "error" ? (
            <p role="alert" className="border-b px-3 py-1.5 text-xs text-destructive">
              {state.message}
            </p>
          ) : null}
          <TableView
            data={data}
            positions={config.spec.columns}
            format={config.spec.format}
            formatColumns={config.spec.formatColumns}
            sort={sort}
            busy={state.status === "loading"}
            label={/^tabel\b/i.test(title) ? title : `Tabel ${title || "widget"}`}
            reserveCorner={resizable}
            onSort={(s) => {
              setSort(s);
              setPage(0);
            }}
            onPage={setPage}
          />
        </>
      );
      break;
    default:
      content = (
        <ChartWidget
          type={config.type}
          data={data}
          spec={config.spec}
          showData={showData}
          title={title}
          cross={cross}
        />
      );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={refetching || undefined}>
      {refetching ? (
        // Angka lama sedang diperbarui: garis progres di tepi atas isi (tepat di bawah kepala kartu),
        // di atas kepala tabel yang lengket. Gerak dikurangi: garis diam. Mode warna paksa: latar
        // dipaksa sama dengan Canvas — garis memakai warna sistem Highlight.
        <div
          role="progressbar"
          aria-label={`Memperbarui ${title || "widget"}`}
          data-testid="widget-refreshing"
          className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-primary motion-reduce:animate-none forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
        />
      ) : null}
      {content}
      <SkippedNote names={data.skippedFilters} />
    </div>
  );
}
