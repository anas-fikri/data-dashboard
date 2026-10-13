"use client";

import { formatMeasure, type ValueType } from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { middleTruncate, tableLayout, type TextMeasure } from "./chart-series";

/*
 * Nilai grafik sebagai tabel (tombol "data" di kepala kartu; cara tanpa hover membaca nilai persis —
 * review H9). Label baris dipendekkan di tengah (unit "…Unit 01"/"…Unit 02" tetap beda) dan minimal
 * 12 karakter; nilai lengkap, atau ringkas di kartu sempit — kolom nilai selebar teks yang diukur
 * (canvas, font halaman) sehingga nilai yang muat tidak terpotong; kepala kolom boleh dua baris (kepala
 * kolom nilai yang tetap tidak muat dipendekkan dengan "…"). Kartu yang terlalu sempit untuk dua kolom:
 * baris ditumpuk (label di atas, nilai di bawah) dengan kepala kolom satu baris ringkas yang ikut
 * tergulir (bukan lengket — kartu 2x2 tetap memperlihatkan baris data) — peran ARIA eksplisit menjaga
 * semantik tabel saat tampilannya diubah CSS. Teks lengkap selalu di title dan untuk pembaca layar.
 * Cincin fokus digambar di pembungkus (di atas header lengket), sama dengan tabel widget.
 */
let ctx: CanvasRenderingContext2D | null | undefined;
/** Kotak lebih pendek dari ini: kepala kolom tidak lengket. */
const SHORT_PX = 120;
/** Tabel bertumpuk lebih sempit dari ini: kepala kolom yang tampil hanya nama ukuran. */
const NARROW_HEAD_PX = 160;

/** Lebar teks `px` dengan font halaman (`bold`: font-medium); undefined di luar browser. */
export function canvasMeasure(px = 14): TextMeasure | undefined {
  if (typeof document === "undefined") return undefined;
  ctx ??= document.createElement("canvas").getContext("2d");
  const c = ctx;
  if (!c) return undefined;
  const family = getComputedStyle(document.body).fontFamily;
  return (text, bold) => {
    c.font = `${bold ? 500 : 400} ${px}px ${family}`;
    return c.measureText(text).width;
  };
}
export function ChartTable({
  rows,
  dimensionLabel,
  measureLabel,
  valueType,
  format,
  label,
  width,
  height = null,
}: {
  rows: { label: string; value: number | null }[];
  dimensionLabel: string;
  measureLabel: string;
  valueType?: ValueType;
  format: NumberFormat;
  /** Nama wilayah gulir ("Data <judul>"). */
  label: string;
  width: number | null;
  /** Tinggi kotak (px); null = belum diukur. */
  height?: number | null;
}) {
  const full = rows.map((r) => formatMeasure(r.value, valueType, format));
  const short = rows.map((r) => formatMeasure(r.value, valueType, format, true));
  const layout = tableLayout(width, full, short, {
    header: measureLabel,
    labelLength: rows.reduce((m, r) => Math.max(m, r.label.length), 0),
    measure: width ? canvasMeasure() : undefined,
  });
  const shown = layout.compact ? short : full;
  const stacked = layout.stacked;
  // Kartu setinggi 2 baris grid (wilayah 69–81 px): kepala dua baris tidak lengket — ikut tergulir agar
  // baris data terlihat (kepala lengket 53 px hanya menyisakan 16–28 px).
  const sticky = height === null || height >= SHORT_PX;
  const measureOnly = stacked && width !== null && width < NARROW_HEAD_PX;
  const role = (r: string) => (stacked ? { role: r } : {});

  return (
    <div className="relative flex min-h-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-sm after:ring-inset has-[[data-scroll]:focus-visible]:after:ring-2 has-[[data-scroll]:focus-visible]:after:ring-ring">
      <div
        data-scroll=""
        className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
        role="region"
        aria-label={label}
        // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-testid="chart-table"
        data-stacked={stacked ? "" : undefined}
      >
        <table
          className={cn("w-full text-sm", stacked ? "block" : "table-fixed")}
          {...role("table")}
        >
          {stacked ? null : (
            <colgroup>
              <col />
              <col
                className={layout.valuePx === null ? "w-[45%]" : undefined}
                style={layout.valuePx === null ? undefined : { width: layout.valuePx }}
              />
            </colgroup>
          )}
          {stacked ? (
            // Bertumpuk: satu baris ringkas yang ikut tergulir — kepala lengket dua baris (53–93 px)
            // menutup seluruh wilayah kartu 2x2. Nama ukuran didahulukan (≤ 60 %), nama dimensi
            // memakai sisanya; kartu < 160 px: nama dimensi hanya untuk pembaca layar (label tiap baris
            // sudah menunjukkannya; "C… Total …" tidak terbaca). Keduanya utuh di title/pembaca layar.
            <thead className="block" {...role("rowgroup")}>
              <tr
                className="flex items-baseline justify-end gap-2 border-b px-3 py-1 text-xs text-muted-foreground"
                {...role("row")}
              >
                <th
                  scope="col"
                  className={cn(
                    "min-w-0 flex-1 truncate text-left font-medium",
                    measureOnly && "sr-only",
                  )}
                  title={dimensionLabel}
                  {...role("columnheader")}
                >
                  {dimensionLabel}
                </th>
                <th
                  scope="col"
                  className={cn(
                    "min-w-0 truncate text-right font-medium",
                    !measureOnly && "max-w-[60%] shrink-0",
                  )}
                  title={measureLabel}
                  {...role("columnheader")}
                >
                  {measureLabel}
                </th>
              </tr>
            </thead>
          ) : (
            <thead className={sticky ? "sticky top-0 bg-card" : undefined}>
              <tr className="border-b text-left">
                {/* Kepala kolom sampai dua baris ("Jumlah / baris"), bukan "J…"; lengkap di title. */}
                <th
                  scope="col"
                  className="px-3 py-1.5 align-bottom font-medium"
                  title={dimensionLabel}
                >
                  <span className="line-clamp-2 break-words">{dimensionLabel}</span>
                </th>
                <th
                  scope="col"
                  className="px-3 py-1.5 text-right align-bottom font-medium"
                  title={measureLabel}
                >
                  {/* Yang tidak muat dua baris dipendekkan dengan "…" (line-clamp sisi kanan tanpa "…"). */}
                  <span className="line-clamp-2 break-words">
                    <Both visible={layout.header} full={measureLabel} />
                  </span>
                </th>
              </tr>
            </thead>
          )}
          <tbody className={stacked ? "block" : undefined} {...role("rowgroup")}>
            {rows.map((r, i) => {
              const name = middleTruncate(r.label, layout.labelChars);
              return (
                <tr
                  key={i}
                  className={cn("border-b last:border-b-0", stacked && "flex flex-col py-1.5")}
                  {...role("row")}
                >
                  <th
                    scope="row"
                    className={cn(
                      "px-3 text-left font-normal",
                      // Bertumpuk: label boleh dua baris (tidak dipotong menjadi "Ka…01").
                      stacked ? "block break-words" : "truncate py-1.5",
                    )}
                    title={r.label}
                    {...role("rowheader")}
                  >
                    <Both visible={name} full={r.label} />
                  </th>
                  <td
                    className={cn(
                      "truncate px-3 text-right tabular-nums",
                      stacked ? "block" : "py-1.5",
                    )}
                    title={full[i]}
                    data-value={r.value ?? ""}
                    {...role("cell")}
                  >
                    <Both visible={shown[i]!} full={full[i]!} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Teks yang dipendekkan untuk mata, teks lengkap untuk pembaca layar. */
export function Both({ visible, full }: { visible: string; full: string }) {
  if (visible === full) return full;
  return (
    <>
      <span aria-hidden>{visible}</span>
      <span className="sr-only">{full}</span>
    </>
  );
}
