"use client";

import { IconAlertTriangle, IconFilterOff, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useWidgetFilters } from "@/components/dashboards/filters/filter-context";
import { Button } from "@/components/ui/button";
import type { WidgetConfig } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { bodyState, configVersion, type BodyState } from "./body-state";
import { ChartWidget } from "./chart-widget";
import { KpiView } from "./kpi-view";
import { TableView, type TableSort } from "./table-view";
import { useWidgetQuery } from "./widget-query";

/*
 * Isi widget yang sudah diatur (T-011): memuat data lewat /api/query { widgetId } dan menampilkan
 * KPI, grafik, atau tabel. Setiap widget berdiri sendiri — gagal di satu widget (mis. kolom
 * disembunyikan) tidak mengganggu widget lain. Status: memuat (kerangka), gagal (pesan + coba lagi
 * untuk gangguan sementara), kosong, berhasil. Status itu dilaporkan ke kartu (onState) untuk tombol
 * data grafik di kepala kartu.
 *
 * Filter dashboard (T-012) ikut dikirim (dashboardFilters); filter berubah → tabel kembali ke halaman
 * pertama, data lama tetap tampil redup (aria-busy) selama memuat ulang, dan filter yang tidak berlaku
 * untuk sheet widget ini (kolomnya tidak ada) disebut di catatan kecil di bawah isi.
 */
type Configured = Exclude<WidgetConfig, { type: "empty" }>;

/** Gangguan sementara → tombol coba lagi; selain itu pesan menjelaskan apa yang harus diubah. */
const TRANSIENT = new Set([
  "QUERY_BUSY",
  "QUERY_TIMEOUT",
  "OFFLINE",
  "UNAVAILABLE",
  "QUERY_FAILED",
  "NOT_READY",
  "RATE_LIMITED",
]);

export function WidgetBody({
  widgetId,
  config,
  title,
  editing,
  resizable = false,
  showData = false,
  onState,
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  /** Kartu punya pegangan resize di pojok kanan bawah (mode edit di grid). */
  resizable?: boolean;
  /** Grafik: tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData?: boolean;
  /** Status isi untuk versi spec ini; fungsi harus stabil (useCallback). */
  onState?: (version: string, state: BodyState) => void;
}) {
  // Spec berubah → mount baru (halaman/urutan tabel kembali ke awal, query ulang).
  const version = configVersion(config);
  return (
    <Loaded
      key={version}
      widgetId={widgetId}
      config={config}
      title={title}
      editing={editing}
      resizable={resizable}
      version={version}
      showData={showData}
      onState={onState}
    />
  );
}

function Loaded({
  widgetId,
  config,
  title,
  editing,
  resizable,
  version,
  showData,
  onState,
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  resizable: boolean;
  version: string;
  showData: boolean;
  onState?: (version: string, state: BodyState) => void;
}) {
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
  const shown = bodyState(state, config.type === "table");
  useEffect(() => onState?.(version, shown), [onState, version, shown]);

  if (state.status === "error" && !(data && config.type === "table")) {
    return (
      // justify-center-safe + overflow-hidden: pesan panjang di kartu kecil tidak menimpa judul (H4).
      <div
        // Bisa digulir (bukan dipotong) di kartu kecil; pesan lengkap tetap terbaca dengan sentuh. Wilayah
        // gulir harus bisa difokus agar bisa digulir dengan keyboard (axe scrollable-region-focusable);
        // cincin fokus di dalam (ring-inset) karena kartu memotong outline di luar.
        className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto rounded-sm p-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        role="region"
        aria-label={`Pesan ${title || "widget"}`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-testid="widget-error"
        data-code={state.code}
      >
        <IconAlertTriangle
          size={24}
          stroke={1.5}
          aria-hidden
          className="shrink-0 text-warning @max-[10rem]:hidden"
        />
        <p className="max-w-prose shrink-0 text-sm" title={state.message}>
          {state.message}
        </p>
        {TRANSIENT.has(state.code) ? (
          <Button
            size="sm"
            variant="outline"
            className="h-(--control-h-lg) shrink-0 md:h-(--control-h-sm)"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={retry}
          >
            Coba lagi
          </Button>
        ) : editing ? (
          <p className="text-xs text-muted-foreground @max-[10rem]:hidden">
            Ubah lewat tombol pengaturan widget.
          </p>
        ) : null}
      </div>
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
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col transition-opacity motion-reduce:transition-none",
        // Tabel meredupkan barisnya sendiri; grafik/KPI: seluruh isi, agar angka lama tidak terbaca
        // seolah sudah tersaring.
        refetching && config.type !== "table" && "opacity-60",
      )}
      aria-busy={refetching || undefined}
    >
      {content}
      <SkippedNote names={data.skippedFilters} />
    </div>
  );
}

/** Filter dashboard yang tidak berlaku untuk widget ini (kolomnya tidak ada di sheet widget). */
function SkippedNote({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  const text = `Filter ${names.join(", ")} tidak berlaku untuk widget ini.`;
  return (
    <p
      className="flex shrink-0 items-center gap-1.5 border-t px-3 py-1 text-xs text-muted-foreground"
      title={`${text} Kolomnya tidak ada di sheet yang dipakai widget ini.`}
      data-testid="widget-skipped-filters"
    >
      <IconFilterOff size={14} stroke={1.5} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}
