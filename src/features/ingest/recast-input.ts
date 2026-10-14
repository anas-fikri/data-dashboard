/*
 * Input dan hasil recast (T-007/T-008) tanpa dependensi worker (DuckDB, storage, lock): dipakai
 * aplikasi untuk memvalidasi koreksi skema sebelum masuk antrean, dan oleh worker sebagai pertahanan
 * berlapis.
 */
import { z } from "zod";
import type { ColumnSchema } from "./infer";
import type { ColumnOverride } from "./typed";

export interface RecastInput {
  /**
   * schemaRevision yang dilihat user saat mengedit (T-008). Berbeda dari sekarang → "stale" tanpa
   * mengubah apa pun, sehingga edit lama yang terlambat tidak menimpa edit yang lebih baru.
   */
  baseRevision?: number;
  /** Baris header baru (1-based); berbeda dari sekarang → nama dari baris itu + inferensi ulang. */
  headerRow?: number;
  /** Perubahan per kolom (nama tampil, tipe, locale, format tanggal, sembunyikan). */
  columns?: ColumnOverride[];
}

export type RecastOutcome =
  | { outcome: "done"; revision: number; schema: ColumnSchema[] }
  | { outcome: "busy" }
  | { outcome: "gone" }
  | { outcome: "stale" }
  | { outcome: "invalid"; message: string }
  | { outcome: "failed"; message: string };

/** Batas baris Excel; headerRow di luar ini pasti tidak ada di raw. */
export const MAX_ROW = 1_048_576;

/** Enum pilihan kolom dari user (recast T-008, pemetaan T-014). */
export const columnTypeSchema = z.enum([
  "integer",
  "decimal",
  "date",
  "timestamp",
  "duration",
  "boolean",
  "text",
]);
export const numberLocaleSchema = z.enum(["id", "us"]);
export const dateFormatSchema = z.enum([
  "yyyy-mm-dd",
  "dd/mm/yyyy",
  "dd-mm-yyyy",
  "dd.mm.yyyy",
  "yyyy/mm/dd",
  "mm/dd/yyyy",
  "serial",
]);

/**
 * Posisi kolom terbesar sheet: kolom kosong (absent, T-014) berada setelah colCount dan tetap bisa
 * diganti nama/tipe/disembunyikan.
 */
export const maxSchemaPos = (colCount: number, schema: Pick<ColumnSchema, "pos">[] | null) =>
  Math.max(colCount, ...(schema ?? []).map((c) => c.pos));

/**
 * Input recast berasal dari user (T-008) dan ikut menentukan SQL: hanya enum dan angka bulat dalam
 * rentang yang diterima (nama tampil tidak pernah masuk SQL). Divalidasi di sini sebagai pertahanan
 * berlapis selain validasi di API. `maxPos` = maxSchemaPos sheet.
 */
export function parseRecastInput(input: unknown, maxPos: number) {
  const column = z
    .object({
      pos: z.number().int().min(1).max(maxPos),
      name: z.string().trim().min(1).max(120).optional(),
      type: columnTypeSchema.optional(),
      numberLocale: numberLocaleSchema.optional(),
      dateFormat: dateFormatSchema.optional(),
      hidden: z.boolean().optional(),
    })
    .strict();
  return z
    .object({
      baseRevision: z.number().int().min(0).optional(),
      headerRow: z.number().int().min(1).max(MAX_ROW).optional(),
      columns: z.array(column).max(maxPos).optional(),
    })
    .strict()
    .safeParse(input);
}
