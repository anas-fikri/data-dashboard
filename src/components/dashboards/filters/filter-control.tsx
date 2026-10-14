"use client";

import { IconChevronDown, IconFilterOff } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DatePanel } from "./date-panel";
import { useDashboardFilters } from "./filter-context";
import { controlOf, normName, type DashFilter, type FilterColumnView } from "./filter-model";
import { filterText } from "./filter-text";
import { NumberPanel } from "./number-panel";
import { SlicerPanel } from "./slicer-panel";

/*
 * Satu kontrol filter di bilah layar lebar (T-012): tombol "Kolom: isi" (aktif = garis + latar
 * primer tipis, bukan hanya warna — isinya ikut berubah; mode warna paksa: garis Highlight) yang
 * membuka popover non-modal berisi slicer, rentang tanggal, atau rentang angka sesuai tipe kolom.
 * Nama kolom panjang yang dipotong, isinya tetap terlihat (teks lengkap di title dan nama aksesibel).
 * Kolom yang tidak tersedia di data terbaru tampil nonaktif dengan alasannya (bukan tombol yang
 * diam-diam tidak berbuat apa-apa).
 */
const TESTID = { slicer: "filter-slicer", date: "filter-date", number: "filter-number" } as const;

/** Filter aktif untuk satu kolom. */
export function useColumnFilter(column: FilterColumnView) {
  const { state, setFilter } = useDashboardFilters();
  const value = state.filters.find((f) => normName(f.column) === normName(column.column));
  return { value, set: (f: DashFilter | null) => setFilter(column.column, f) };
}

/** Ringkasan isi kontrol ("Semua", "Bulan ini", "2 dipilih"). */
export function controlSummary(column: FilterColumnView, value: DashFilter | undefined): string {
  if (!value) return "Semua";
  const n = value.op === "in" || value.op === "not_in" ? value.values.length : 0;
  if (value.op === "in" && n > 1) return `${n.toLocaleString("id-ID")} dipilih`;
  if (value.op === "not_in" && n > 1) return `Semua kecuali ${n.toLocaleString("id-ID")}`;
  return filterText(value, column.type);
}

/** Kolom filter yang tidak ada/disembunyikan di versi data aktif: nonaktif, dengan alasannya. */
export function UnavailableColumn({ column }: { column: FilterColumnView }) {
  return (
    <span
      className="inline-flex min-h-(--control-h) max-w-64 items-center gap-1.5 rounded-md border border-dashed px-3 py-1 text-sm text-muted-foreground"
      data-testid="filter-unavailable"
      data-column={column.column}
    >
      <IconFilterOff size={18} stroke={1.5} aria-hidden className="shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate" title={column.column}>
          {column.column}
        </span>
        <span className="block text-xs">Tidak ada di data terbaru</span>
      </span>
    </span>
  );
}

export function FilterControl({ column }: { column: FilterColumnView }) {
  const { dashboardId } = useDashboardFilters();
  const { value, set } = useColumnFilter(column);
  const [open, setOpen] = useState(false);
  if (!column.available) return <UnavailableColumn column={column} />;
  const kind = controlOf(column.type);
  const summary = controlSummary(column, value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={TESTID[kind]}
          data-column={column.column}
          data-active={value ? "" : undefined}
          aria-label={`${column.column}: ${summary}`}
          title={`${column.column}: ${summary}`}
          className={cn(
            "group max-w-72 justify-between gap-1.5 px-3 font-normal",
            "data-active:border-primary data-active:bg-primary/10",
            "forced-colors:data-active:border-2 forced-colors:data-active:border-[Highlight]",
          )}
        >
          {/* Nama yang dipotong; isi filter (maks. 11 rem) tetap terlihat. */}
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground group-data-active:text-foreground">
              {column.column}:
            </span>
            <span className={cn("max-w-44 shrink-0 truncate", value && "font-medium")}>
              {summary}
            </span>
          </span>
          <IconChevronDown aria-hidden className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Filter ${column.column}`}
        className={kind === "slicer" ? "w-80" : "w-72"}
      >
        <p className="truncate text-sm font-semibold" title={column.column}>
          {column.column}
        </p>
        {kind === "slicer" ? (
          <SlicerPanel dashboardId={dashboardId} column={column} value={value} onChange={set} />
        ) : kind === "date" ? (
          <DatePanel column={column} value={value} onChange={set} />
        ) : (
          <NumberPanel column={column} value={value} onChange={set} onDone={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}
