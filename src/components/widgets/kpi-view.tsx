"use client";

import { useRef } from "react";
import type { Agg } from "@/features/query/spec";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { chooseKpi, kpiHeightPx, kpiTexts } from "./kpi-fit";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Satu angka besar (T-011). Ukuran huruf mengikuti lebar kotak ini (container sendiri, jadi cqi = lebar
 * isi yang diukur — tanpa potong padding dua kali), di kartu bertinggi tetap juga dibatasi tingginya
 * setelah diukur (kartu pendek dengan catatan/judul dua baris). Bentuk yang tampil dipilih di kpi-fit: lengkap,
 * ringkas, "Rp" pindah ke label, huruf kecil, lalu dua baris — tidak pernah potongan berelipsis. Nilai
 * lengkap selalu di title dan untuk pembaca layar (review desain T-011). Total/jumlah atas nol baris = 0
 * seperti SUM Excel; kolom ukuran yang kosong di versi data ini (T-014) = "(kosong)". Label ukuran
 * disembunyikan bila sama dengan judul widget.
 */
let ctx: CanvasRenderingContext2D | null | undefined;

/** Lebar teks (px) pada font tebal ukuran `px`; null di luar browser. */
function textWidth(text: string, px: number): number | null {
  if (typeof document === "undefined") return null;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  // Sama dengan angka di halaman: tracking-tight (−0,025em) dan angka tabular (tnum) — canvas tidak
  // mengenal tnum, jadi semua angka diukur selebar "0" (R6-CL-2). Terukur −2,1 %…+1,5 % dari DOM di
  // 10–36 px; SLACK 6 % menutupinya. Tanpa letterSpacing (peramban lama) ukuran berlebih = aman.
  ctx.letterSpacing = `${-0.025 * px}px`;
  return ctx.measureText(text.replace(/\d/g, "0")).width;
}

/** Ukuran huruf akar (px): padding/baris label ber-rem membesar bila pengguna memperbesar huruf. */
const rootPx = () =>
  typeof document === "undefined"
    ? 16
    : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export function KpiView({
  data,
  format,
  title,
  agg,
  fixedHeight = false,
}: {
  data: WidgetData;
  format: NumberFormat;
  title: string;
  /** Agregasi ukuran; tidak ada untuk field terhitung (T-068: kosong tetap "–", bukan 0). */
  agg?: Agg;
  /** Tinggi kartu tetap (grid, kertas): angka juga dibatasi tinggi kotak. Tumpukan ponsel: tidak. */
  fixedHeight?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const column = data.columns[0];
  // Kolom ukuran kosong di versi ini (absent, T-014): "(kosong)", bukan 0 dari SUM/COUNT.
  const absent = !!data.absent?.length;
  const raw = absent ? null : (data.rows[0]?.[0] ?? null);
  const countish = agg === "sum" || agg === "count" || agg === "count_distinct";
  const value = raw === null && countish && !absent ? 0 : raw;
  const label = column?.label ?? "";
  const { full, options } = kpiTexts(
    value,
    column?.type ?? "decimal",
    column?.format ?? format,
    agg,
    label,
  );
  const sameAsTitle = label.trim().toLowerCase() === title.trim().toLowerCase();
  const shown = chooseKpi(
    options,
    size?.width ?? null,
    textWidth,
    // Tinggi kotak hanya membatasi bila kartu tidak tumbuh mengikuti isinya (tumpukan ponsel tumbuh).
    fixedHeight && size ? (row) => kpiHeightPx(size.height, row, rootPx()) : undefined,
    !sameAsTitle,
    0.875 * rootPx(),
  );

  return (
    <div
      ref={box}
      className="@container flex min-h-0 flex-1 flex-col justify-center-safe gap-1 overflow-hidden px-4 pb-3 @max-[9rem]:px-2"
    >
      {/* Label yang tidak muat bersama angka: tetap untuk pembaca layar (angka didahulukan). */}
      {shown.label || !sameAsTitle ? (
        <p
          className={cn(
            "flex min-w-0 gap-1 text-sm text-muted-foreground",
            !shown.label && "sr-only",
          )}
          title={sameAsTitle ? undefined : label}
        >
          {sameAsTitle ? null : <span className="truncate">{label}</span>}
          {/* Satuan yang dipindah dari angka; pembaca layar mendengarnya di nilai lengkap. */}
          {shown.unit ? (
            <span className="shrink-0" aria-hidden>
              {sameAsTitle ? shown.unit : `(${shown.unit})`}
            </span>
          ) : null}
        </p>
      ) : null}
      <p
        className={cn(
          // shrink-0: kotak pendek (kartu sempit di tablet sentuh) tidak memotong angka di dalam barisnya
          // sendiri — angka boleh memakai padding bawah.
          "shrink-0 font-semibold tabular-nums tracking-tight",
          // Ukuran inline (kotak bertinggi tetap) menggantikan text-sm — tinggi baris 1,25rem-nya tetap.
          shown.small && shown.px === null ? "text-sm" : "text-[clamp(1.125rem,15cqi,2.25rem)]",
          // SESUDAH kelas ukuran huruf: tailwind-merge membuang leading-* yang mendahului text-* (text-*
          // membawa tinggi baris), lalu tinggi baris jatuh ke 1,5 warisan body dan kpiHeightPx (1,25)
          // meleset — angka terpotong di bawah (T-w764).
          "leading-tight",
          // Belum diukur: satu baris (title tetap lengkap). Tidak ada yang muat: boleh pindah baris.
          shown.wrap ? "[overflow-wrap:anywhere]" : "truncate whitespace-nowrap",
        )}
        // Sudah diukur: ukuran dari lebar DAN tinggi kotak (kelas clamp hanya lebar, untuk render awal).
        style={shown.px === null ? undefined : { fontSize: shown.px }}
        data-testid="kpi-value"
        title={full}
      >
        {shown.text === full ? (
          full
        ) : (
          <>
            <span aria-hidden>{shown.text}</span>
            <span className="sr-only">{full}</span>
          </>
        )}
      </p>
    </div>
  );
}
