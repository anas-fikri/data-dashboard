/*
 * Job PDF dashboard di worker (T-018, D1), antrean "pdf". Urutan (pola sama dengan runExportJob):
 *  1. baris Export PDF QUEUED/RUNNING → RUNNING (selain itu dilewati: idempoten terhadap ulangan job);
 *  2. akses dashboard dicek ulang dengan peran SEKARANG (pencabutan setelah permintaan berlaku di sini;
 *     halaman /render mengecek lagi bersama status user);
 *  3. renderer dicek ulang (mati setelah cek app → RENDERER_UNAVAILABLE, tanpa ulang);
 *  4. token render baru (60 detik, sekali pakai; tiap percobaan token baru) → POST /render { token } —
 *     renderer membuka APP_INTERNAL_URL/render/<token> sendiri — dengan batas RENDER_TIMEOUT_MS dan
 *     PDF_MAX_BYTES;
 *  5. PDF diperiksa (%PDF- + ukuran) lalu diunggah WORKER ke exports/<userId>/<id>.pdf (renderer tidak
 *     bisa menjangkau storage), DONE + expiresAt, hapus objek dijadwalkan saat kedaluwarsa.
 * Renderer penuh (503) → RendererBusyError dilempar: BullMQ mengulang (PDF_JOB_OPTIONS), gagal final →
 * RENDERER_UNAVAILABLE di worker. Galat lain yang dikenal → FAILED dengan pesan untuk user (detail hanya
 * di log); galat tak terduga dilempar (diulang; gagal final → EXPORT_FAILED umum di worker).
 */
import type { DashboardAccessRole } from "@/features/sharing/access";
import { exportKey } from "@/lib/storage/exports";
import { contentDisposition } from "./filename";
import { referencedByDone, type ExportJobRepo } from "./job";
import type { RenderClaims } from "./render-token";
import type { RenderFailureCode, RendererClient } from "./renderer-client";
import { pdfParamsSchema } from "./schema";
import { FAILED_MESSAGE, MIME, RENDERER_UNAVAILABLE_MESSAGE } from "./service";
import { EXPORT_CODES } from "./types";

export interface PdfJobRepo extends ExportJobRepo {
  /** Peran user pada dashboard sekarang (tanpa cache); null = tidak punya akses. */
  dashboardRole(userId: string, dashboardId: string): Promise<DashboardAccessRole | null>;
}

export interface PdfStorage {
  /** putExportObject (pola kunci ketat). */
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
    opts: { contentDisposition?: string },
  ): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PdfJobDeps {
  repo: PdfJobRepo;
  renderer: Pick<RendererClient, "health" | "render">;
  /** mintRenderToken dengan store Redis produksi. */
  mintToken(claims: RenderClaims): Promise<string>;
  storage: PdfStorage;
  /** Jadwalkan hapus objek setelah `delayMs` (job maintenance delete-export). */
  scheduleDelete(exportId: string, key: string, delayMs: number): Promise<void>;
  ttlMs: number;
  /** RENDER_TIMEOUT_MS. */
  timeoutMs: number;
  /** PDF_MAX_BYTES. */
  maxBytes: number;
  now?: () => Date;
}

export type PdfOutcome =
  | { outcome: "done"; bytes: number }
  | { outcome: "failed"; code: string; detail?: string }
  | { outcome: "skipped" };

/** Renderer penuh (503): dilempar agar BullMQ mengulang; nama dibaca handler gagal final worker. */
export class RendererBusyError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "RendererBusyError";
  }
}

const GONE_MESSAGE = "Dashboard tidak ditemukan atau akses ke dashboard sudah dicabut.";
export const PDF_TIMEOUT_MESSAGE =
  "PDF tidak selesai dibuat dalam batas waktu. Coba lagi, atau persempit filter lalu ekspor lagi.";
export const pdfTooLargeMessage = (max: number) =>
  `PDF melebihi batas ${Math.floor(max / (1024 * 1024)).toLocaleString("id-ID")} MB. Persempit filter lalu ekspor lagi.`;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
export const isPdf = (b: Uint8Array) => PDF_MAGIC.every((c, i) => b[i] === c);

function messageOf(code: RenderFailureCode, maxBytes: number): string {
  switch (code) {
    case EXPORT_CODES.RENDERER_UNAVAILABLE:
      return RENDERER_UNAVAILABLE_MESSAGE;
    case EXPORT_CODES.EXPORT_TIMEOUT:
      return PDF_TIMEOUT_MESSAGE;
    case EXPORT_CODES.EXPORT_TOO_LARGE:
      return pdfTooLargeMessage(maxBytes);
    default:
      return FAILED_MESSAGE;
  }
}

export async function runPdfJob(exportId: string, deps: PdfJobDeps): Promise<PdfOutcome> {
  const { repo } = deps;
  const row = await repo.load(exportId);
  if (!row || (row.status !== "QUEUED" && row.status !== "RUNNING")) return { outcome: "skipped" };
  const failWith = async (code: string, message: string, detail?: string): Promise<PdfOutcome> => {
    await repo.fail(row.id, code, message);
    return { outcome: "failed", code, ...(detail ? { detail } : {}) };
  };
  if (row.format !== "PDF" || !row.dashboardId) {
    return failWith(EXPORT_CODES.NOT_FOUND, GONE_MESSAGE);
  }
  const params = pdfParamsSchema.safeParse(row.params);
  if (!params.success) return failWith(EXPORT_CODES.INVALID, "Parameter ekspor tidak valid.");
  if (!(await repo.start(row.id))) return { outcome: "skipped" };

  // Akses dicek ulang dengan peran SEKARANG (pencabutan setelah permintaan berlaku di sini).
  if (!(await repo.dashboardRole(row.userId, row.dashboardId))) {
    return failWith(EXPORT_CODES.NOT_FOUND, GONE_MESSAGE);
  }
  // Renderer mati setelah cek app: gagal cepat dengan kode yang bisa ditindak (bukan ulang 3×).
  if (!(await deps.renderer.health())) {
    return failWith(EXPORT_CODES.RENDERER_UNAVAILABLE, RENDERER_UNAVAILABLE_MESSAGE);
  }
  const token = await deps.mintToken({
    exportId: row.id,
    userId: row.userId,
    dashboardId: row.dashboardId,
    ...(params.data.f ? { f: params.data.f } : {}),
    requestedAt: params.data.requestedAt,
  });
  const r = await deps.renderer.render(token, {
    timeoutMs: deps.timeoutMs,
    maxBytes: deps.maxBytes,
  });
  if (!r.ok) {
    if (r.busy) throw new RendererBusyError(r.detail);
    return failWith(r.code, messageOf(r.code, deps.maxBytes), r.detail);
  }
  const pdf = r.pdf;
  if (pdf.byteLength > deps.maxBytes) {
    return failWith(EXPORT_CODES.EXPORT_TOO_LARGE, pdfTooLargeMessage(deps.maxBytes));
  }
  if (!isPdf(pdf)) {
    return failWith(EXPORT_CODES.EXPORT_FAILED, FAILED_MESSAGE, "jawaban renderer bukan PDF");
  }
  // Ekspor dihapus selama render (user dihapus) → tidak ada yang diunggah.
  if (!(await repo.exists(row.id))) return { outcome: "skipped" };

  const key = exportKey(row.userId, row.id, "pdf");
  let uploaded = false;
  try {
    await deps.storage.put(key, pdf, MIME.pdf, {
      contentDisposition: contentDisposition(row.fileName ?? "dashboard.pdf"),
    });
    uploaded = true;
    const finishedAt = deps.now?.() ?? new Date();
    const expiresAt = new Date(finishedAt.getTime() + deps.ttlMs);
    const bytes = pdf.byteLength;
    // Baris hilang/berubah (user dihapus, atau run lain sudah DONE) → finally memutuskan hapus objek.
    if (!(await repo.finish(row.id, { key, rows: null, bytes, finishedAt, expiresAt }))) {
      return { outcome: "skipped" };
    }
    uploaded = false;
    // Gagal menjadwalkan tidak menggagalkan ekspor: sapuan export-cleanup tiap 5 menit menutupnya.
    await deps.scheduleDelete(row.id, key, deps.ttlMs).catch(() => {});
    return { outcome: "done", bytes };
  } finally {
    // Run tumpang tindih mengunggah ke kunci yang sama: objek yang ditunjuk baris DONE tidak dihapus.
    if (uploaded && !(await referencedByDone(repo, row.id, key))) {
      await deps.storage.remove(key).catch(() => {});
    }
  }
}
