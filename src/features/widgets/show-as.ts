/*
 * "Tampilkan nilai sebagai" (T-067): label, judul kolom, dan format tampil. Murni; dipakai server
 * (judul kolom hasil/ekspor) dan klien (panel, sel pivot, grafik). Perhitungannya di DuckDB
 * (features/query/pivot.ts, sql.ts) — klien hanya memformat nilai yang sudah jadi.
 */
import type { NumberFormat, ShowAs } from "./spec";

export const SHOW_AS_LABEL: Record<ShowAs, string> = {
  none: "Nilai biasa",
  pct_grand: "% dari total keseluruhan",
  pct_row: "% dari total baris",
  pct_col: "% dari total kolom",
  running: "Total berjalan",
  diff_prev: "Selisih dari sebelumnya",
  pct_diff_prev: "% selisih dari sebelumnya",
};

/** Hasilnya rasio (0,125 = 12,5%), bukan satuan ukuran aslinya. */
export const isPercentShowAs = (s: ShowAs | undefined): boolean =>
  s === "pct_grand" || s === "pct_row" || s === "pct_col" || s === "pct_diff_prev";

/** Dihitung sepanjang sumbu (item sebelumnya); sel total/subtotal dikosongkan. */
export const isAxisShowAs = (s: ShowAs | undefined): boolean =>
  s === "running" || s === "diff_prev" || s === "pct_diff_prev";

/** Bukan nilai biasa. */
export const shown = (s: ShowAs | undefined): s is Exclude<ShowAs, "none"> =>
  s !== undefined && s !== "none";

/** Persen selalu 1 desimal id-ID ("12,5%"); selain itu format widget (mis. Rupiah untuk selisih). */
export const PERCENT_FORMAT: NumberFormat = { style: "percent", decimals: 1 };
export const valueFormat = (s: ShowAs | undefined, format: NumberFormat): NumberFormat =>
  isPercentShowAs(s) ? PERCENT_FORMAT : format;

/** Judul kolom nilai: "% dari total kolom · Total Pendapatan"; nilai biasa tetap labelnya. */
export const showAsTitle = (s: ShowAs | undefined, label: string): string =>
  shown(s) ? `${SHOW_AS_LABEL[s]} · ${label}` : label;
