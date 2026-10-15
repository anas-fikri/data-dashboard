/*
 * Validasi ekspor (T-017). Body strict: hanya { widgetId, format, dashboardFilters?, sort? } — spec selalu
 * dari widget di DB (D6), field lain → INVALID. Parameter yang disimpan di Export.params dibaca ulang
 * worker dengan skema yang sama (baris lama/rusak → gagal bersih, bukan galat DuckDB).
 */
import { z } from "zod";
import { dashFiltersSchema } from "@/features/query/filters";
import { EXPORT_FORMATS } from "./types";

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
const sortSchema = z
  .object({ column: z.number().int().min(1).max(16_384), dir: z.enum(["asc", "desc"]) })
  .strict();

export const exportBodySchema = z
  .object({
    widgetId: cuid,
    format: z.enum(EXPORT_FORMATS),
    dashboardFilters: dashFiltersSchema.optional(),
    sort: sortSchema.optional(),
  })
  .strict();
export type ExportBody = z.infer<typeof exportBodySchema>;

/** Export.params: permintaan + jam preset tanggal (requestedAt, E9). */
export const exportParamsSchema = z
  .object({
    dashboardFilters: dashFiltersSchema.optional(),
    sort: sortSchema.optional(),
    requestedAt: z.string().datetime(),
  })
  .strict();
export type ExportParams = z.infer<typeof exportParamsSchema>;

/**
 * `f` PDF (T-018) = encodeFilterParam(status filter). Batas panjang ≤ body ekspor (64 KB): status filter
 * yang terlalu panjang untuk URL (?f= 6000, urlTooLong) tetap boleh, dibaca lewat parsePdfFilter.
 */
export const PDF_FILTER_MAX = 60_000;
const pdfFilterParam = z.string().max(PDF_FILTER_MAX);

/** Body PDF dashboard (T-018): strict { dashboardId, format: "pdf", f? }; field lain → INVALID. */
export const pdfBodySchema = z
  .object({
    dashboardId: cuid,
    format: z.literal("pdf"),
    f: pdfFilterParam.nullable().optional(),
  })
  .strict();
export type PdfBody = z.infer<typeof pdfBodySchema>;

/** Export.params PDF: status filter yang sudah disaring saat buat (encoded) + jam preset tanggal. */
export const pdfParamsSchema = z
  .object({
    f: pdfFilterParam.optional(),
    requestedAt: z.string().datetime(),
  })
  .strict();
export type PdfParams = z.infer<typeof pdfParamsSchema>;

export const isExportId = (v: unknown): v is string => cuid.safeParse(v).success;
