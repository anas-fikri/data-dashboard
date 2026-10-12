"use client";

import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCell } from "@/features/widgets/format";
import type { ChartType, WidgetConfig } from "@/features/widgets/spec";
import { ChartView } from "./chart-view";
import { KpiView } from "./kpi-view";
import { TableView, type TableSort } from "./table-view";
import { useWidgetQuery, type WidgetData } from "./widget-query";

/*
 * Isi widget yang sudah diatur (T-011): memuat data lewat /api/query { widgetId } dan menampilkan
 * KPI, grafik, atau tabel. Setiap widget berdiri sendiri — gagal di satu widget (mis. kolom
 * disembunyikan) tidak mengganggu widget lain. Status: memuat (kerangka), gagal (pesan + coba lagi
 * untuk gangguan sementara), kosong, berhasil.
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
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
}) {
  // Spec berubah → mount baru (halaman/urutan tabel kembali ke awal, query ulang).
  const version = `${config.type}:${JSON.stringify(config.spec)}`;
  return (
    <Loaded
      key={version}
      widgetId={widgetId}
      config={config}
      title={title}
      editing={editing}
      version={version}
    />
  );
}

function Loaded({
  widgetId,
  config,
  title,
  editing,
  version,
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  version: string;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TableSort>(null);
  const request =
    config.type === "table" ? { widgetId, page, ...(sort ? { sort } : {}) } : { widgetId };
  const { state, retry } = useWidgetQuery(request, version);
  const data = state.data;

  if (state.status === "error" && !(data && config.type === "table")) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center"
        data-testid="widget-error"
        data-code={state.code}
      >
        <IconAlertTriangle size={24} stroke={1.5} aria-hidden className="shrink-0 text-warning" />
        <p className="max-w-prose text-sm">{state.message}</p>
        {TRANSIENT.has(state.code) ? (
          <Button
            size="sm"
            variant="outline"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={retry}
          >
            Coba lagi
          </Button>
        ) : editing ? (
          <p className="text-xs text-muted-foreground">Ubah lewat tombol pengaturan widget.</p>
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

  switch (config.type) {
    case "kpi":
      return <KpiView data={data} format={config.spec.format} />;
    case "table":
      return (
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
            sort={sort}
            busy={state.status === "loading"}
            label={`Tabel ${title || "widget"}`}
            onSort={(s) => {
              setSort(s);
              setPage(0);
            }}
            onPage={setPage}
          />
        </>
      );
    default:
      return <Chart type={config.type} data={data} config={config} />;
  }
}

function Chart({
  type,
  data,
  config,
}: {
  type: ChartType;
  data: WidgetData;
  config: Extract<Configured, { type: ChartType }>;
}) {
  if (data.rows.length === 0) {
    return (
      <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </p>
    );
  }
  const [dim, measure] = data.columns;
  const grain = config.spec.dimension.timeGrain;
  // Format Rp/persen milik nilai ukuran, bukan label kategori.
  const labelFormat = { style: "number", decimals: dim!.type === "integer" ? 0 : 2 } as const;
  return (
    <ChartView
      type={type}
      labels={data.rows.map((r) => formatCell(r[0], dim!.type, labelFormat, grain))}
      values={data.rows.map((r) => (typeof r[1] === "number" ? r[1] : null))}
      measureLabel={measure!.label}
      dimensionLabel={dim!.label}
      format={config.spec.format}
    />
  );
}
