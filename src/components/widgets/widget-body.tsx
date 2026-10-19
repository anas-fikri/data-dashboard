"use client";

import { useEffect, useState } from "react";
import { useReportStale, useWidgetFilters } from "@/components/dashboards/filters/filter-context";
import type { WidgetConfig } from "@/features/widgets/spec";
import { AbsentNote } from "./absent-note";
import {
  bodyState,
  configVersion,
  requestFilters,
  widgetRequest,
  withChangeCheck,
  type BodyState,
} from "./body-state";
import { ChartWidget, type ChartBadge } from "./chart-widget";
import { KpiView } from "./kpi-view";
import { PivotView } from "./pivot-view";
import { SkippedNote } from "./skipped-note";
import { TableView, type TableSort } from "./table-view";
import { WidgetError } from "./widget-error";
import { useWidgetQuery, type WidgetRequest } from "./widget-query";

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
 *
 * Pengaturan widget diubah di tab/perangkat lain (T-016): jawaban server membawa versi pengaturan yang
 * tidak dikenal kartu → data tidak ditampilkan, galat "Widget ini sudah diubah" + "Muat ulang".
 */
type Configured = Exclude<WidgetConfig, { type: "empty" }>;

/** Data lama dari filter lain dianggap basi (label di kepala kartu) bila memuat lebih lama dari ini. */
const STALE_LABEL_MS = 400;

interface Props {
  widgetId: string;
  /** Versi pengaturan widget di kanvas (T-016; dari server, diperbarui oleh simpanan tab ini). */
  widgetVersion?: string;
  config: Configured;
  title: string;
  editing: boolean;
  /** Kartu punya pegangan resize di pojok kanan bawah (mode edit di grid). */
  resizable?: boolean;
  /** Tinggi kartu tetap (grid layar lebar); tumpukan ponsel: kartu KPI tumbuh mengikuti isinya. */
  fixedHeight?: boolean;
  /** Grafik: tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData?: boolean;
  /** Status isi untuk versi spec ini (+ data basi sedang diperbarui); fungsi harus stabil. */
  onState?: (version: string, state: BodyState, stale: boolean) => void;
  /** Body query yang sedang dipakai (berubah bersama filter/urutan/halaman); fungsi harus stabil. */
  onRequest?: (request: WidgetRequest) => void;
  /** Grafik: lencana "N dari M" / "N/M" kategori untuk kepala kartu (T-032, T-2nkx); fungsi stabil. */
  onBadge?: (badge: ChartBadge | null) => void;
}

export function WidgetBody(props: Props) {
  // Spec berubah → mount baru (halaman/urutan tabel kembali ke awal, query ulang).
  const version = configVersion(props.config);
  return <Loaded key={version} {...props} version={version} />;
}

function Loaded({
  widgetId,
  widgetVersion,
  config,
  title,
  editing,
  resizable = false,
  fixedHeight = false,
  version,
  showData = false,
  onState,
  onRequest,
  onBadge,
}: Props & { version: string }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TableSort>(null);
  const cross = useWidgetFilters(widgetId);
  // Filter berubah → halaman pertama (bukan halaman 7 dari hasil yang kini 2 halaman).
  const request = widgetRequest(widgetId, config.type, page, sort, cross.filters, cross.pivot);
  const filterKey = requestFilters(request);
  const [seenFilters, setSeenFilters] = useState(filterKey);
  if (seenFilters !== filterKey) {
    setSeenFilters(filterKey);
    setPage(0);
  }
  // Ekspor di kepala kartu (T-017) memakai body yang sama persis (filter + urutan tabel).
  const requestKey = JSON.stringify(request);
  useEffect(() => onRequest?.(JSON.parse(requestKey) as WidgetRequest), [onRequest, requestKey]);
  // Versi pengaturan yang pernah dipegang kartu ini (awal + simpanan tab ini): hanya data dari versi
  // ini yang ditampilkan.
  const [known, setKnown] = useState<string[]>(widgetVersion ? [widgetVersion] : []);
  if (widgetVersion && !known.includes(widgetVersion)) setKnown([...known, widgetVersion]);
  const query = useWidgetQuery(request, version);
  const { retry } = query;
  const state = withChangeCheck(query.state, known);
  const data = state.data;
  const refetching = state.status === "loading" && !!data;
  // Tabel: data lama tetap di bawah pesan galat hanya bila filternya sama (halaman/urutan gagal).
  const keepOnError = config.type === "table" && state.filters === filterKey;
  const shown = bodyState(state, keepOnError, config.type !== "kpi" && config.type !== "table");
  // Data yang tampil milik filter lain dan belum terganti setelah jeda singkat → label "Memperbarui…"
  // di kepala kartu (bukan untuk ganti halaman/urutan tabel atau coba lagi dengan filter yang sama).
  const otherFilters = refetching && state.filters !== filterKey;
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
          fixedHeight={fixedHeight}
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
    case "pivot":
      content = data.pivot ? (
        <PivotView
          data={data.pivot}
          format={config.spec.format}
          label={/^pivot\b/i.test(title) ? title : `Pivot ${title || "widget"}`}
          request={request}
          cross={cross}
          crossFilter={config.spec.crossFilter !== false}
        />
      ) : null;
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
          onBadge={onBadge}
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
      <AbsentNote names={data.absent} />
      <SkippedNote names={data.skippedFilters} />
    </div>
  );
}
