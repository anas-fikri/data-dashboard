"use client";

import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WidgetConfig } from "@/features/widgets/spec";
import { ChartWidget } from "./chart-widget";
import { KpiView } from "./kpi-view";
import { TableView, type TableSort } from "./table-view";
import { useWidgetQuery } from "./widget-query";

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
  showData = false,
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  /** Grafik: tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData?: boolean;
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
      showData={showData}
    />
  );
}

function Loaded({
  widgetId,
  config,
  title,
  editing,
  version,
  showData,
}: {
  widgetId: string;
  config: Configured;
  title: string;
  editing: boolean;
  version: string;
  showData: boolean;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TableSort>(null);
  const request =
    config.type === "table" ? { widgetId, page, ...(sort ? { sort } : {}) } : { widgetId };
  const { state, retry } = useWidgetQuery(request, version);
  const data = state.data;

  if (state.status === "error" && !(data && config.type === "table")) {
    return (
      // justify-center-safe + overflow-hidden: pesan panjang di kartu kecil tidak menimpa judul (H4).
      <div
        // Bisa digulir (bukan dipotong) di kartu kecil; pesan lengkap tetap terbaca dengan sentuh.
        className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto p-3 text-center"
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

  switch (config.type) {
    case "kpi":
      return (
        <KpiView
          data={data}
          format={config.spec.format}
          title={title}
          agg={config.spec.measure.agg}
        />
      );
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
            formatColumns={config.spec.formatColumns}
            sort={sort}
            busy={state.status === "loading"}
            label={/^tabel\b/i.test(title) ? title : `Tabel ${title || "widget"}`}
            onSort={(s) => {
              setSort(s);
              setPage(0);
            }}
            onPage={setPage}
          />
        </>
      );
    default:
      return (
        <ChartWidget
          type={config.type}
          data={data}
          spec={config.spec}
          showData={showData}
          title={title}
        />
      );
  }
}
