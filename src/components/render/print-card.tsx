"use client";

import { IconAlertTriangle, IconChartBar, IconCircleOff, IconFilterOff } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";
import { cardConfig, type CardConfig } from "@/components/dashboards/widget-card-model";
import { absentText } from "@/components/widgets/body-state";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { KpiView } from "@/components/widgets/kpi-view";
import type { WidgetData } from "@/components/widgets/widget-query";
import type { RenderWidget } from "@/features/exports/render-data";
import { cn } from "@/lib/utils";
import { rowsPx, tableRowsFitPx } from "./print-layout";

/**
 * Batas baris judul kartu cetak: kartu < 3 baris grid (mis. KPI h=2) memakai 2 baris — judul 3 baris
 * memakan ruang angka KPI sampai terpotong (review T-018 R2-INT-1/R2-DS-1); kartu lain 3 baris.
 * Kelas utuh agar terbaca Tailwind.
 */
export const printTitleClamp = (heightPx: number) =>
  heightPx < rowsPx(3) ? "line-clamp-2" : "line-clamp-3";
import { PrintTable } from "./print-table";
import { useRenderPending } from "./render-ready";

/*
 * Satu widget di PDF (T-018). Data sudah diambil server (jawaban /api/query yang sama persis, termasuk
 * galat per peran), jadi isinya memakai tampilan layar yang sama: KpiView, ChartWidget (varian cetak:
 * label nilai, tanpa animasi), dan tabel cetak. Keadaan yang sama dengan layar: galat (pesan + kode,
 * tanpa tombol coba lagi), widget kosong, "Tidak ada data", catatan kolom kosong dan filter yang tidak
 * berlaku (satu baris; kertas tidak punya popover). Grafik mendaftar ke sinyal siap cetak. Judul
 * membungkus sampai 3 baris (kertas tidak punya tooltip; dua judul yang hanya beda di ujung tetap
 * terbedakan) — tabel mengukur sisa tinggi kartunya sendiri.
 */
const NOTE = "flex h-6 shrink-0 items-center gap-1 border-t px-2 text-xs text-muted-foreground";

function Note({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <p className={NOTE}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function Message({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-1 overflow-hidden p-3 text-center text-sm">
      {icon}
      {children}
    </div>
  );
}

type ChartConfig = Exclude<CardConfig, { type: "kpi" | "table" }>;

function PrintChart({
  config,
  data,
  title,
}: {
  config: ChartConfig;
  data: WidgetData;
  title: string;
}) {
  const settle = useRenderPending();
  return (
    <ChartWidget
      type={config.type}
      data={data}
      spec={config.spec}
      showData={false}
      title={title}
      print
      onSettled={settle}
    />
  );
}

function Body({
  config,
  data,
  title,
  heightPx,
}: {
  config: CardConfig;
  data: WidgetData;
  title: string;
  heightPx: number;
}) {
  if (config.type === "kpi") {
    return (
      <KpiView
        data={data}
        format={config.spec.format}
        title={title}
        agg={config.spec.measure.agg}
      />
    );
  }
  if (config.type === "table") {
    const notes = (data.absent?.length ? 1 : 0) + (data.skippedFilters?.length ? 1 : 0);
    return (
      <PrintTable
        data={data}
        positions={config.spec.columns}
        format={config.spec.format}
        formatColumns={config.spec.formatColumns}
        fit={tableRowsFitPx(heightPx, notes)}
      />
    );
  }
  return <PrintChart config={config} data={data} title={title} />;
}

export function PrintCard({
  widget,
  heightPx,
  style,
  className,
}: {
  widget: RenderWidget;
  /** Tinggi tata letak kartu (px, sebelum diperkecil): perkiraan awal baris tabel yang muat. */
  heightPx: number;
  style: CSSProperties;
  className?: string;
}) {
  const title = widget.title || "Widget tanpa judul";
  const config = cardConfig(widget.type, widget.spec);
  const r = widget.result;
  let content: ReactNode;
  if (!config) {
    content = (
      <Message
        icon={<IconChartBar size={24} stroke={1.5} aria-hidden className="text-muted-foreground" />}
      >
        <p className="text-muted-foreground">Widget ini belum berisi data.</p>
      </Message>
    );
  } else if (!r.ok) {
    content = (
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-testid="print-widget-error"
        data-code={r.code}
      >
        <Message
          icon={<IconAlertTriangle size={24} stroke={1.5} aria-hidden className="text-warning" />}
        >
          <p className="max-w-prose">{r.message}</p>
          <p className="text-xs text-muted-foreground">Kode: {r.code}</p>
        </Message>
      </div>
    );
  } else {
    content = (
      <>
        <Body config={config} data={r} title={widget.title} heightPx={heightPx} />
        {r.absent?.length ? (
          <Note icon={<IconCircleOff size={14} stroke={1.5} aria-hidden className="shrink-0" />}>
            {absentText(r.absent)}
          </Note>
        ) : null}
        {r.skippedFilters?.length ? (
          <Note icon={<IconFilterOff size={14} stroke={1.5} aria-hidden className="shrink-0" />}>
            {`Filter ${r.skippedFilters.join(", ")} tidak berlaku untuk widget ini.`}
          </Note>
        ) : null}
      </>
    );
  }
  return (
    <article
      style={style}
      data-testid="print-widget"
      data-widget-id={widget.id}
      className={cn(
        "@container flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground",
        className,
      )}
    >
      <h2
        className={cn(
          "flex min-h-10 shrink-0 items-center border-b px-3 py-2 text-sm font-medium",
          !widget.title && "text-muted-foreground",
        )}
      >
        <span className={cn(printTitleClamp(heightPx), "min-w-0 [overflow-wrap:anywhere]")}>
          {title}
        </span>
      </h2>
      {content}
    </article>
  );
}
