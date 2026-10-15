import type { RenderData } from "@/features/exports/render-data";
import { PrintCard } from "./print-card";
import {
  bandPlacement,
  exportedAtText,
  FIRST_PAGE_ROWS,
  pageBands,
  PRINT_GAP_PX,
  PRINT_HEADER_PX,
  ROWS_PER_PAGE,
  rowsPx,
} from "./print-layout";

/*
 * Dashboard untuk dicetak renderer (T-018 D6), komponen server: kepala (nama, dataset, ringkasan
 * filter, waktu ekspor WIB — diformat di server, tanpa beda hidrasi) lalu pita tata letak (pageBands),
 * satu pita per halaman. Tiap pita grid 12 kolom selebar isi kertas (277 mm); pita yang lebih tinggi
 * dari halamannya diperkecil utuh (transform), kotaknya setinggi hasil perkecilan. Tanpa shell
 * aplikasi, tanpa kontrol: kertas tidak bisa diklik. Kartu memakai tampilan widget layar (print-card).
 */
export function PrintDashboard({ data }: { data: RenderData }) {
  const { dashboard, widgets } = data;
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const bands = pageBands(
    dashboard.layout.filter((it) => byId.has(it.i)),
    ROWS_PER_PAGE,
    FIRST_PAGE_ROWS,
  );
  return (
    <main className="w-[277mm] bg-background text-foreground" data-testid="print-dashboard">
      <header
        className="flex flex-col gap-2 overflow-hidden border-b pb-3"
        // Tinggi paling banyak ini: halaman pertama tetap memuat FIRST_PAGE_ROWS baris grid di bawahnya.
        style={{ maxHeight: PRINT_HEADER_PX - PRINT_GAP_PX }}
      >
        <div className="flex items-baseline justify-between gap-6">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
            {dashboard.name}
          </h1>
          <p className="shrink-0 text-xs text-muted-foreground" data-testid="print-exported">
            Diekspor {exportedAtText(dashboard.exportedAt)}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Dataset</dt>
          <dd className="truncate">{dashboard.datasetName}</dd>
          <dt className="text-muted-foreground">Filter</dt>
          <dd className="line-clamp-3 [overflow-wrap:anywhere]" data-testid="print-filters">
            {dashboard.filterSummary}
          </dd>
        </dl>
      </header>
      {bands.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Dashboard ini belum berisi widget.</p>
      ) : null}
      {bands.map((band, k) => (
        <div
          key={band.start}
          className={k === 0 ? "mt-4" : "break-before-page"}
          style={{ height: Math.ceil(rowsPx(band.rows) * band.scale) }}
          data-testid="print-band"
        >
          <div
            className="grid w-[277mm] origin-top auto-rows-[3.5rem] grid-cols-12 gap-4"
            style={band.scale < 1 ? { transform: `scale(${band.scale})` } : undefined}
          >
            {band.items.map((it) => (
              <PrintCard
                key={it.i}
                widget={byId.get(it.i)!}
                h={it.h}
                style={bandPlacement(it, band)}
              />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
