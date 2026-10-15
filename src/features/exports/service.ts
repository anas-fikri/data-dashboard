/*
 * Ekspor widget CSV/XLSX (T-017) dan dashboard PDF (T-018): buat, status, unduh. Tabel Export adalah
 * sumber kebenaran (pemilik, status, kedaluwarsa); antrean BullMQ hanya menjalankan job (jobId =
 * Export.id) — "export" untuk CSV/XLSX, "pdf" untuk PDF.
 *
 * Akses dicek tiga kali (E7): saat buat (widget: resolver yang sama dengan /api/query mode widget,
 * termasuk D6 dan pesan per peran; PDF: dashboard yang boleh dilihat), di worker (job.ts / pdf-job.ts;
 * PDF juga di halaman render), dan saat unduh (peran dashboard dibaca lagi, tanpa akses → 404). Unduh
 * hanya pemilik ekspor; selain pemilik → 404 tanpa membedakan "tidak ada". Setiap tautan unduh yang
 * diberikan dicatat di AuditLog (dashboard.widget.export / dashboard.export untuk PDF).
 * Dependensi diinjeksi agar bisa diuji tanpa DB/Redis/storage; perakitan produksi di repo.ts/http.ts.
 */
import type { AuditEntry } from "@/features/audit/service";
import type { RateLimitResult } from "@/features/auth/rate-limit";
import { forRole, resolveWidget, type QueryDeps } from "@/features/query/service";
import type { DashboardAccessRole } from "@/features/sharing/access";
import type { PresignGetOptions } from "@/lib/storage/exports";
import { contentDisposition, exportFileName } from "./filename";
import {
  encodePdfFilter,
  parsePdfFilter,
  sanitizePdfFilter,
  type FilterTarget,
} from "./pdf-filter";
import {
  exportBodySchema,
  isExportId,
  pdfBodySchema,
  type ExportParams,
  type PdfParams,
} from "./schema";
import {
  EXPORT_CODES,
  EXPORT_IN_FLIGHT_MAX,
  type ExportCode,
  type ExportFileFormat,
  type ExportStatusView,
} from "./types";

export type ExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
export type ExportFormat = "CSV" | "XLSX" | "PDF";

export interface ExportRow {
  id: string;
  userId: string;
  dashboardId: string | null;
  widgetId: string | null;
  format: ExportFormat;
  status: ExportStatus;
  errorCode: string | null;
  errorMessage: string | null;
  key: string | null;
  fileName: string | null;
  rows: number | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
  deletedAt: Date | null;
}

export type NewExport =
  | {
      userId: string;
      dashboardId: string;
      widgetId: string;
      format: Exclude<ExportFormat, "PDF">;
      params: ExportParams;
      fileName: string;
    }
  /** PDF dashboard utuh (T-018): tanpa widget. */
  | {
      userId: string;
      dashboardId: string;
      widgetId: null;
      format: "PDF";
      params: PdfParams;
      fileName: string;
    };

export interface ExportRepo {
  /**
   * Hitung ekspor berjalan (QUEUED/RUNNING, dibuat setelah `since`) lalu buat baris baru — atomik per
   * user (pg_advisory_xact_lock) sehingga permintaan paralel tidak melewati batas. null = penuh.
   */
  createIfRoom(input: NewExport, max: number, since: Date): Promise<{ id: string } | null>;
  /** Ekspor milik user (null = tidak ada atau milik orang lain). */
  findOwned(userId: string, id: string): Promise<ExportRow | null>;
  /** QUEUED/RUNNING → FAILED (enqueue gagal). */
  fail(id: string, code: string, message: string): Promise<void>;
  /** Judul widget untuk nama file (null bila widget sudah tidak ada). */
  widgetTitle(widgetId: string): Promise<string | null>;
  /** Peran user pada dashboard sekarang (tanpa cache); null = tidak punya akses. */
  dashboardRole(userId: string, dashboardId: string): Promise<DashboardAccessRole | null>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface ExportDeps {
  repo: ExportRepo;
  /** Repo query (otorisasi widget + resolver yang sama dengan /api/query). */
  query: Pick<QueryDeps, "repo">;
  enqueue(exportId: string): Promise<void>;
  /** Satu hit rate limit RULES.export untuk user ini. */
  rateLimit(userId: string): Promise<RateLimitResult>;
  /** Satu hit rate limit RULES.exportDownload untuk user ini (tiap unduhan = presign + AuditLog). */
  downloadRateLimit(userId: string): Promise<RateLimitResult>;
  presign(key: string, o: PresignGetOptions): Promise<string>;
  now?: () => Date;
}

/** Dashboard untuk PDF: nama + yang menentukan filter berlaku (getDashboard memenuhinya). */
export interface PdfDashboard extends FilterTarget {
  id: string;
  name: string;
}

/** Dependensi POST /api/exports format "pdf" (T-018). */
export interface PdfExportDeps {
  repo: Pick<ExportRepo, "createIfRoom" | "fail">;
  /** Dashboard yang boleh dilihat user (pemilik/editor/viewer); null = tanpa akses → 404. */
  dashboard(userId: string, dashboardId: string): Promise<PdfDashboard | null>;
  /** Renderer hidup? (GET /healthz ≤ 3 detik; galat/waktu habis → false). */
  rendererHealth(): Promise<boolean>;
  /** Antrekan job di antrean "pdf" (jobId = Export.id). */
  enqueue(exportId: string): Promise<void>;
  /** Satu hit RULES.exportPdf untuk user ini. */
  rateLimit(userId: string): Promise<RateLimitResult>;
  now?: () => Date;
}

export type ExportFailure = {
  ok: false;
  code: ExportCode;
  message: string;
  retryAfterSec?: number;
};

const failure = (code: ExportCode, message: string, retryAfterSec?: number): ExportFailure => ({
  ok: false,
  code,
  message,
  ...(retryAfterSec ? { retryAfterSec } : {}),
});

/** Status HTTP per kode (E15). */
export const EXPORT_STATUS: Record<ExportCode, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  NOT_READY: 409,
  COLUMN_UNAVAILABLE: 409,
  SHEET_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  EXPORT_BUSY: 429,
  EXPORT_TOO_LARGE: 422,
  EXPORT_EXPIRED: 410,
  EXPORT_TIMEOUT: 504,
  EXPORT_FAILED: 500,
  FORBIDDEN: 403,
  UNAVAILABLE: 503,
  RENDERER_UNAVAILABLE: 503,
};

/**
 * Ekspor QUEUED/RUNNING lebih tua dari ini tidak dihitung batas berjalan (job hilang saat Redis
 * dikosongkan tidak mengunci user selamanya) dan digagalkan job pembersihan.
 */
export const IN_FLIGHT_STALE_MS = 2 * 60 * 60 * 1000;
/** Masa berlaku presigned GET unduhan (AC6: 5 menit), dipotong sisa umur ekspor. */
export const DOWNLOAD_URL_SEC = 300;

export const EXPIRED_MESSAGE = "Tautan unduhan sudah kedaluwarsa. Ekspor lagi.";
export const BUSY_MESSAGE = `Masih ada ${EXPORT_IN_FLIGHT_MAX} ekspor yang berjalan. Tunggu salah satu selesai.`;
export const FAILED_MESSAGE = "Ekspor gagal diproses. Coba ekspor lagi beberapa saat lagi.";
const NOT_FOUND_MESSAGE = "Ekspor tidak ditemukan.";
export const RENDERER_UNAVAILABLE_MESSAGE =
  "Layanan PDF sedang tidak tersedia. Coba lagi beberapa saat lagi.";

export const MIME: Record<ExportFileFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export const extOf = (f: ExportFormat): ExportFileFormat =>
  f === "CSV" ? "csv" : f === "XLSX" ? "xlsx" : "pdf";

/** Kode kegagalan resolver widget (INVALID/NOT_READY/…_UNAVAILABLE) sebagai kode ekspor. */
export function exportCodeOf(code: string): ExportCode {
  return Object.hasOwn(EXPORT_CODES, code) ? (code as ExportCode) : EXPORT_CODES.EXPORT_FAILED;
}

/** POST /api/exports: validasi + otorisasi + pra-resolusi (tanpa DuckDB) → baris Export + job. */
export async function createExport(
  userId: string,
  body: unknown,
  deps: ExportDeps,
): Promise<{ ok: true; exportId: string } | ExportFailure> {
  const rl = await deps.rateLimit(userId);
  if (!rl.allowed) {
    return failure(
      "RATE_LIMITED",
      `Terlalu banyak permintaan ekspor. Coba lagi dalam ${rl.retryAfterSec} detik.`,
      rl.retryAfterSec,
    );
  }
  const parsed = exportBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return failure(
      "INVALID",
      `Permintaan ekspor tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
    );
  }
  const { widgetId, format, dashboardFilters, sort } = parsed.data;
  const now = deps.now?.() ?? new Date();
  // Otorisasi + peran dibaca tanpa cache (sama dengan query widget); orang lain → 404.
  const w = await deps.query.repo.widget(userId, widgetId);
  if (!w || !w.dashboardId) return failure("NOT_FOUND", "Widget tidak ditemukan.");
  // Pra-resolusi murah (DB saja): filter tidak diizinkan, kolom/sheet tidak tersedia, data belum siap
  // langsung dijawab — pesan per peran seperti /api/query.
  const resolved = await resolveWidget(
    w,
    { dashboardFilters, sort, page: 0 },
    { repo: deps.query.repo, now: () => now },
  );
  if (!resolved.ok) {
    const f = forRole(w.role, resolved);
    return failure(exportCodeOf(f.code), f.message);
  }
  const title = (await deps.repo.widgetTitle(widgetId)) ?? "";
  const params: ExportParams = {
    ...(dashboardFilters?.length ? { dashboardFilters } : {}),
    ...(sort ? { sort } : {}),
    requestedAt: now.toISOString(),
  };
  const created = await deps.repo.createIfRoom(
    {
      userId,
      dashboardId: w.dashboardId,
      widgetId,
      format: format === "csv" ? "CSV" : "XLSX",
      params,
      fileName: exportFileName(title, now, format),
    },
    EXPORT_IN_FLIGHT_MAX,
    new Date(now.getTime() - IN_FLIGHT_STALE_MS),
  );
  if (!created) return failure("EXPORT_BUSY", BUSY_MESSAGE);
  try {
    await deps.enqueue(created.id);
  } catch (e) {
    // Tanpa job baris ini tidak akan pernah selesai: digagalkan agar tidak menahan batas berjalan.
    await deps.repo.fail(created.id, EXPORT_CODES.UNAVAILABLE, FAILED_MESSAGE).catch(() => {});
    throw e;
  }
  return { ok: true, exportId: created.id };
}

/**
 * POST /api/exports { dashboardId, format: "pdf", f? } (T-018): rate limit RULES.exportPdf → body strict
 * → dashboard yang boleh dilihat (semua peran; orang lain 404) → `f` divalidasi lalu disaring terhadap
 * kolom filter dashboard (D9) → renderer dicek ≤ 3 detik (mati → 503 RENDERER_UNAVAILABLE seketika, tanpa
 * baris, AC3) → baris Export PDF (batas 2 berjalan per user, bersama CSV/XLSX) → antrean "pdf".
 */
export async function createPdfExport(
  userId: string,
  body: unknown,
  deps: PdfExportDeps,
): Promise<{ ok: true; exportId: string } | ExportFailure> {
  const rl = await deps.rateLimit(userId);
  if (!rl.allowed) {
    return failure(
      "RATE_LIMITED",
      `Terlalu banyak permintaan ekspor PDF. Coba lagi dalam ${rl.retryAfterSec} detik.`,
      rl.retryAfterSec,
    );
  }
  const parsed = pdfBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return failure(
      "INVALID",
      `Permintaan ekspor tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
    );
  }
  const { dashboardId, f } = parsed.data;
  const d = await deps.dashboard(userId, dashboardId);
  if (!d) return failure("NOT_FOUND", "Dashboard tidak ditemukan.");
  if (!d.widgets.length)
    return failure("INVALID", "Dashboard ini belum punya widget untuk diekspor.");
  const state = parsePdfFilter(f);
  // Filter rusak tidak boleh diam-diam menjadi PDF tanpa filter (nilainya berbeda dengan layar).
  if (!state) {
    return failure("INVALID", "Filter dashboard tidak valid. Muat ulang halaman lalu ekspor lagi.");
  }
  if (!(await deps.rendererHealth())) {
    return failure("RENDERER_UNAVAILABLE", RENDERER_UNAVAILABLE_MESSAGE);
  }
  const now = deps.now?.() ?? new Date();
  const encoded = encodePdfFilter(sanitizePdfFilter(state, d));
  const created = await deps.repo.createIfRoom(
    {
      userId,
      dashboardId: d.id,
      widgetId: null,
      format: "PDF",
      params: { ...(encoded ? { f: encoded } : {}), requestedAt: now.toISOString() },
      fileName: exportFileName(d.name, now, "pdf"),
    },
    EXPORT_IN_FLIGHT_MAX,
    new Date(now.getTime() - IN_FLIGHT_STALE_MS),
  );
  if (!created) return failure("EXPORT_BUSY", BUSY_MESSAGE);
  try {
    await deps.enqueue(created.id);
  } catch (e) {
    await deps.repo.fail(created.id, EXPORT_CODES.UNAVAILABLE, FAILED_MESSAGE).catch(() => {});
    throw e;
  }
  return { ok: true, exportId: created.id };
}

/** Kedaluwarsa: lewat expiresAt, objek sudah dihapus, atau tidak pernah punya objek. */
export function isExpired(row: ExportRow, now: Date): boolean {
  return row.deletedAt !== null || !row.key || !row.expiresAt || row.expiresAt <= now;
}

export function statusView(row: ExportRow, now: Date): ExportStatusView {
  const name = row.fileName ? { fileName: row.fileName } : {};
  switch (row.status) {
    case "QUEUED":
      return { state: "queued", ...name };
    case "RUNNING":
      return { state: "running", ...name };
    case "FAILED":
      return {
        state: "failed",
        code: row.errorCode ?? EXPORT_CODES.EXPORT_FAILED,
        message: row.errorMessage ?? FAILED_MESSAGE,
      };
    case "DONE":
      if (isExpired(row, now)) {
        return { state: "expired", code: EXPORT_CODES.EXPORT_EXPIRED, message: EXPIRED_MESSAGE };
      }
      return {
        state: "done",
        ...(row.rows !== null ? { rows: row.rows } : {}),
        expiresAt: row.expiresAt!.toISOString(),
        ...name,
      };
  }
}

/**
 * GET /api/exports/[id]: pemilik yang masih punya akses ke dashboard-nya (lainnya 404, sama seperti unduh —
 * akses dicabut tidak lagi tampil "selesai" lalu gagal diam-diam saat diunduh, review T-017 CL-3), tanpa
 * efek samping.
 */
export async function exportStatus(
  userId: string,
  id: string,
  deps: Pick<ExportDeps, "repo" | "now">,
): Promise<({ ok: true } & ExportStatusView) | ExportFailure> {
  if (!isExportId(id)) return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  const row = await deps.repo.findOwned(userId, id);
  if (!row || !row.dashboardId) return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  if (!(await deps.repo.dashboardRole(userId, row.dashboardId))) {
    return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  }
  return { ok: true, ...statusView(row, deps.now?.() ?? new Date()) };
}

/**
 * GET /api/exports/[id]/download: bukan pemilik atau akses dashboard sudah tidak ada → 404; pemilik +
 * kedaluwarsa/terhapus → 410; selesai → presigned GET ≤ 5 menit (≤ sisa umur) + AuditLog. Audit gagal →
 * galat dilempar (tanpa tautan): unduhan tanpa jejak tidak pernah diberikan. Rate limit per user dicek
 * paling awal (setelah sesi, sebelum DB/presign/AuditLog); Redis mati → galat (503), bukan lolos.
 */
export async function downloadExport(
  userId: string,
  id: string,
  ip: string,
  deps: Pick<ExportDeps, "repo" | "presign" | "downloadRateLimit" | "now">,
): Promise<{ ok: true; url: string } | ExportFailure> {
  const rl = await deps.downloadRateLimit(userId);
  if (!rl.allowed) {
    return failure(
      "RATE_LIMITED",
      `Terlalu banyak unduhan ekspor. Coba lagi dalam ${rl.retryAfterSec} detik.`,
      rl.retryAfterSec,
    );
  }
  if (!isExportId(id)) return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  const row = await deps.repo.findOwned(userId, id);
  if (!row || !row.dashboardId) return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  const role = await deps.repo.dashboardRole(userId, row.dashboardId);
  const ext = extOf(row.format);
  if (!role) return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  if (row.status === "QUEUED" || row.status === "RUNNING") {
    return failure("NOT_READY", "Ekspor belum selesai. Tunggu sebentar lalu coba lagi.");
  }
  if (row.status === "FAILED") return failure("NOT_FOUND", NOT_FOUND_MESSAGE);
  const now = deps.now?.() ?? new Date();
  const left = row.expiresAt ? Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000) : 0;
  if (isExpired(row, now) || left < 1) return failure("EXPORT_EXPIRED", EXPIRED_MESSAGE);
  const url = await deps.presign(row.key!, {
    expiresIn: Math.min(DOWNLOAD_URL_SEC, left),
    contentDisposition: contentDisposition(row.fileName ?? `ekspor.${ext}`),
    contentType: MIME[ext],
  });
  // PDF dashboard: aksi sendiri, meta tanpa nilai filter (T-018 D16).
  await deps.repo.audit(
    ext === "pdf"
      ? {
          actorId: userId,
          action: "dashboard.export",
          targetType: "dashboard",
          targetId: row.dashboardId,
          meta: { exportId: row.id, format: ext, role },
          ip,
        }
      : {
          actorId: userId,
          action: "dashboard.widget.export",
          targetType: "dashboard",
          targetId: row.dashboardId,
          meta: { widgetId: row.widgetId, exportId: row.id, format: ext, rows: row.rows, role },
          ip,
        },
  );
  return { ok: true, url };
}
