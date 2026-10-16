import type { RenderData, RenderWidget } from "@/features/exports/render-data";
import { cn } from "@/lib/utils";
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
  type PrintPlacement,
} from "./print-layout";

/*
 * Dashboard untuk dicetak renderer (T-018 D6), komponen server: kepala (nama, dataset, ringkasan
 * filter, waktu ekspor WIB — diformat di server, tanpa beda hidrasi) lalu pita tata letak (pageBands),
 * satu pita per halaman. Tiap pita grid 12 kolom selebar isi kertas (277 mm), setinggi isinya dan tidak
 * bisa dipecah halaman (overflow-hidden + break-inside: avoid — tidak ada sisa yang menimpa pita
 * berikutnya). Widget yang lebih tinggi dari halamannya diperkecil sendiri di selnya (transform; kotak
 * tata letaknya dilebarkan 1/skala agar tetap selebar kolomnya). Tanpa shell aplikasi, tanpa kontrol:
 * kertas tidak bisa diklik. Kartu memakai tampilan widget layar (print-card). <title> = nama dashboard
 * (diangkat React 19 ke <head>): judul dokumen PDF.
 */
function PrintSlot({ placement: p, widget }: { placement: PrintPlacement; widget: RenderWidget }) {
  if (p.scale === 1) {
    return <PrintCard widget={widget} heightPx={p.heightPx} style={bandPlacement(p)} />;
  }
  return (
    <div
      style={bandPlacement(p)}
      className="min-h-0 min-w-0 overflow-hidden"
      data-testid="print-scaled"
      data-scale={p.scale}
    >
      <PrintCard
        widget={widget}
        heightPx={p.heightPx}
        className="origin-top-left"
        style={{
          width: `${100 / p.scale}%`,
          height: p.heightPx,
          transform: `scale(${p.scale})`,
        }}
      />
    </div>
  );
}

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
      <title>{dashboard.name}</title>
      <header
        className="flex flex-col gap-1.5 overflow-hidden border-b pb-2"
        // Tinggi paling banyak ini (nama 2 baris + filter 3 baris muat): halaman pertama tetap memuat
        // FIRST_PAGE_ROWS baris grid di bawahnya.
        style={{ maxHeight: PRINT_HEADER_PX - PRINT_GAP_PX }}
      >
        <div className="flex items-baseline justify-between gap-6">
          <h1 className="line-clamp-2 min-w-0 text-xl/tight font-semibold tracking-tight [overflow-wrap:anywhere]">
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
          key={k}
          className={cn(
            "overflow-hidden break-inside-avoid",
            k === 0 ? "mt-4" : "break-before-page",
          )}
          style={{ height: rowsPx(band.rows) }}
          data-testid="print-band"
        >
          <div className="grid w-[277mm] auto-rows-[3.5rem] grid-cols-12 gap-4">
            {band.items.map((p) => (
              <PrintSlot key={p.item.i} placement={p} widget={byId.get(p.item.i)!} />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
