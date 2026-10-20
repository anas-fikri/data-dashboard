"use client";

import {
  IconArrowsSort,
  IconChevronLeft,
  IconChevronRight,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  AUTO_FORMAT,
  formatCell,
  formatLabelNumber,
  formatNumber,
} from "@/features/widgets/format";
import { idLikeKind, resolveIdLike } from "@/features/widgets/id-like";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import type { WidgetData } from "./widget-query";

/*
 * Widget tabel (T-011): 100 baris per halaman dari server, urut satu kolom (klik judul kolom:
 * naik → turun → urutan asli), header menempel saat digulir. Angka rata kanan tabular; format pilihan
 * (Rp/persen/desimal) hanya untuk kolom yang dipilih, kolom lain otomatis (bulat tanpa desimal, desimal
 * maks. 2) — rasio 0,07 tidak tampil "0" (review desain T-011 H8). Teks sel dirender React (ter-escape).
 */
export type TableSort = { column: number; dir: "asc" | "desc" } | null;

export const NUMERIC = new Set(["integer", "decimal", "duration", "count"]);
export const count = (n: number) => formatNumber(n, { style: "number", decimals: 0 });

/**
 * Teks sel (layar dan cetak PDF T-018 memakai yang sama): format pilihan hanya untuk kolom terpilih,
 * selebihnya otomatis; kode/nomor/tahun (dari nama kolom, lihat id-like.ts) tanpa pemisah ribuan pada
 * format otomatis — nama ambigu ("Resi Retur") diputuskan dari nilai kolom itu di halaman ini. Murni.
 */
export function tableCellText(
  data: Pick<WidgetData, "columns" | "rows">,
  positions: number[],
  format: NumberFormat,
  formatColumns?: number[],
): (value: unknown, column: number) => string {
  const formatOf = (pos: number) =>
    format.style === "auto" || (formatColumns && !formatColumns.includes(pos))
      ? AUTO_FORMAT
      : format;
  const plain = data.columns.map(
    (c, i) =>
      c.type === "integer" &&
      resolveIdLike(
        idLikeKind(c.label),
        data.rows.map((row) => row[i]),
      ),
  );
  return (v, i) => {
    const f = formatOf(positions[i]!);
    return plain[i] && typeof v === "number" && f.style === "auto"
      ? formatLabelNumber(v)
      : // Kolom sistem Periode (T-058): label periode ("Mar 2026") menurut satuannya.
        formatCell(v, data.columns[i]!.type, f, data.columns[i]!.grain);
  };
}

export function TableView({
  data,
  positions,
  format,
  formatColumns,
  sort,
  busy,
  label,
  reserveCorner = false,
  sheet = false,
  onSort,
  onPage,
}: {
  data: WidgetData;
  /** Posisi kolom skema untuk tiap kolom hasil (urutan sama dengan spec.columns). */
  positions: number[];
  format: NumberFormat;
  /** Kolom yang memakai `format`; tanpa daftar (spec lama) = semua kolom angka. */
  formatColumns?: number[];
  sort: TableSort;
  busy: boolean;
  label: string;
  /** Mode edit di grid: pegangan resize (24 px) ada di pojok kanan bawah — jangan tutupi tombol halaman. */
  reserveCorner?: boolean;
  /**
   * Rupa lembar kerja ("Perbesar", T-047): garis sel, kepala berlatar, dan kolom nomor baris beku di
   * kiri (nomor global = halaman × ukuran + baris). Data tetap dari jalur widget yang sama.
   */
  sheet?: boolean;
  onSort: (sort: TableSort) => void;
  onPage: (page: number) => void;
}) {
  const page = data.page ?? 0;
  const size = data.pageSize ?? 100;
  const total = data.total ?? data.rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = data.rows.length ? page * size + 1 : 0;
  const to = page * size + data.rows.length;
  const cellText = tableCellText(data, positions, format, formatColumns);

  const cycle = (pos: number): TableSort =>
    sort?.column !== pos
      ? { column: pos, dir: "asc" }
      : sort.dir === "asc"
        ? { column: pos, dir: "desc" }
        : null;
  // aria-disabled (bukan disabled): tombol tetap memegang fokus saat memuat atau di halaman ujung, jadi
  // fokus keyboard tidak jatuh ke <body> (review desain T-011 M1); tekan saat tidak berlaku diabaikan.
  const go = (to: number) => {
    if (!busy && to >= 0 && to < pages) onPage(to);
  };
  // Layar sentuh: tetap 44 px di semua lebar (pola tombol kepala kartu).
  const pagerButton =
    "size-(--control-h-lg) md:not-any-pointer-coarse:size-(--control-h-sm) aria-disabled:opacity-50";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pembungkus tidak ikut menggulir: cincin fokus digambar di atasnya, di atas header lengket. */}
      <div className="relative flex min-h-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-sm after:ring-inset has-[[data-scroll]:focus-visible]:after:ring-2 has-[[data-scroll]:focus-visible]:after:ring-ring">
        <div
          data-scroll=""
          // Memuat: tidak diredupkan (teks redup gagal kontras); penandanya garis progres di WidgetBody.
          className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
          role="region"
          aria-label={label}
          aria-busy={busy || undefined}
          // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1, axe
          // scrollable-region-focusable).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <table className="w-full border-collapse text-sm" data-testid="widget-table">
            <thead className={cn("sticky top-0 z-10", sheet ? "bg-muted" : "bg-card")}>
              <tr>
                {sheet ? (
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-px min-w-12 border-r border-b bg-muted px-2 py-1"
                  >
                    <span className="sr-only">Nomor baris</span>
                  </th>
                ) : null}
                {data.columns.map((c, i) => {
                  const pos = positions[i]!;
                  const dir = sort?.column === pos ? sort.dir : null;
                  const numeric = NUMERIC.has(c.type);
                  const Icon =
                    dir === "asc"
                      ? IconSortAscending
                      : dir === "desc"
                        ? IconSortDescending
                        : IconArrowsSort;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined
                      }
                      className={cn(
                        "whitespace-nowrap border-b px-2 py-1 font-medium",
                        sheet && "border-r",
                        numeric ? "text-right" : "text-left",
                      )}
                    >
                      {/* Layar sentuh: 44 px di semua lebar (pola tombol halaman). */}
                      <button
                        type="button"
                        title={c.label}
                        className={cn(
                          "inline-flex min-h-11 max-w-[16rem] items-center gap-1 rounded-sm px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:not-any-pointer-coarse:min-h-8",
                          // Kolom angka: ikon di kiri agar label sejajar dengan digit di kanan.
                          numeric && "flex-row-reverse",
                        )}
                        onClick={() => onSort(cycle(pos))}
                      >
                        <span className="truncate">{c.label}</span>
                        <Icon
                          size={16}
                          stroke={1.5}
                          aria-hidden
                          className="shrink-0 text-muted-foreground"
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, r) => (
                <tr key={page * size + r} className="border-b last:border-b-0">
                  {sheet ? (
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] w-px whitespace-nowrap border-r bg-muted px-2 py-1.5 text-right font-normal tabular-nums text-muted-foreground"
                    >
                      {count(page * size + r + 1)}
                    </th>
                  ) : null}
                  {row.map((v, i) => {
                    const type = data.columns[i]!.type;
                    const text = cellText(v, i);
                    return (
                      <td
                        key={i}
                        className={cn(
                          "max-w-[24rem] truncate px-3 py-1.5",
                          sheet && "border-r",
                          NUMERIC.has(type) && "text-right tabular-nums",
                          (v === null || v === "") && "text-muted-foreground",
                        )}
                        title={text.length > 40 ? text : undefined}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada baris untuk ditampilkan.
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-3 py-0.5 text-xs text-muted-foreground",
          reserveCorner && "pr-7",
        )}
      >
        <span aria-live="polite" data-testid="table-range">
          {total ? `Baris ${count(from)}–${count(to)} dari ${count(total)}` : "Tidak ada baris"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className={pagerButton}
            aria-label="Halaman sebelumnya"
            aria-disabled={page === 0 || busy || undefined}
            onClick={() => go(page - 1)}
          >
            <IconChevronLeft aria-hidden />
          </Button>
          <span className="tabular-nums">
            {count(page + 1)}/{count(pages)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className={pagerButton}
            aria-label="Halaman berikutnya"
            aria-disabled={page >= pages - 1 || busy || undefined}
            onClick={() => go(page + 1)}
          >
            <IconChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
