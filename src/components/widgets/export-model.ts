/*
 * Ekspor widget (T-017) dan PDF dashboard (T-018), logika murni: body permintaan, mesin status satu
 * ekspor per sasaran (kartu widget, atau dashboard untuk PDF), dan teks status/galat. Alur: tombol
 * format → POST /api/exports (202 {exportId}) → status GET /api/exports/<id> tiap 1 s → selesai:
 * unduhan otomatis lewat /api/exports/<id>/download + tautan "Unduh lagi" sampai kedaluwarsa (60 menit)
 * → setelah itu galat "kedaluwarsa" + "Ekspor lagi". Satu ekspor berjalan per sasaran; server membatasi
 * 2 per user (EXPORT_BUSY).
 */
import {
  EXPORT_CODES as C,
  type ExportCreateBody,
  type ExportFileFormat,
  type ExportFormatInput,
  type ExportStatusView,
  type PdfExportCreateBody,
} from "@/features/exports/types";
import type { WidgetRequest } from "./widget-query";

export const FORMAT_LABEL: Record<ExportFileFormat, string> = {
  csv: "CSV",
  xlsx: "Excel (XLSX)",
  pdf: "PDF",
};
export const exportStatusUrl = (id: string) => `/api/exports/${encodeURIComponent(id)}`;
export const exportDownloadUrl = (id: string) => `${exportStatusUrl(id)}/download`;
/**
 * Sasaran ekspor di export-store: id widget (T-017, kunci lama tetap) atau PDF satu dashboard. Id
 * widget berbentuk cuid (tanpa ":"), jadi tidak pernah bertabrakan dengan awalan "dashboard:".
 */
export const dashboardExportTarget = (dashboardId: string) => `dashboard:${dashboardId}`;
/** Body POST yang dimulai use-export-job: ekspor widget atau PDF dashboard. */
export type ExportStartBody = ExportCreateBody | PdfExportCreateBody;

/**
 * Body ekspor dari body query widget yang sedang tampil (body-state.ts widgetRequest): filter dashboard
 * dan urutan tabel yang sama persis; halaman tidak ikut (ekspor = semua baris).
 */
export function exportBody(request: WidgetRequest, format: ExportFormatInput): ExportCreateBody {
  return {
    widgetId: request.widgetId,
    format,
    ...(request.dashboardFilters ? { dashboardFilters: request.dashboardFilters } : {}),
    ...(request.pivotFilters ? { pivotFilters: request.pivotFilters } : {}),
    ...(request.sort ? { sort: request.sort } : {}),
  };
}

export interface ExportError {
  code: string;
  message: string;
  /** Langkah konkret tambahan (EXPORT_TOO_LARGE: cara mempersempit). */
  hint?: string;
  /** Ekspor ulang dengan format yang sama menolong (tautan kedaluwarsa / ekspor hilang). */
  again: boolean;
}

/** Kode klien (bukan dari server): jaringan, sesi habis, ekspor hilang dari polling (403). */
const OFFLINE = "OFFLINE";
const SESSION = "SESSION";
const EXPORT_GONE = "EXPORT_GONE";

const TEXT: Record<string, string> = {
  [C.EXPORT_TOO_LARGE]: "Hasil melebihi batas 1.000.000 baris. Persempit filter lalu ekspor lagi.",
  [C.EXPORT_BUSY]: "Masih ada 2 ekspor yang berjalan. Tunggu salah satu selesai.",
  [C.RATE_LIMITED]: "Terlalu banyak permintaan ekspor. Coba lagi dalam beberapa menit.",
  [C.EXPORT_TIMEOUT]: "Ekspor melewati batas waktu 10 menit. Persempit filter lalu ekspor lagi.",
  [C.EXPORT_FAILED]: "Ekspor gagal dibuat. Coba lagi beberapa saat lagi.",
  [C.EXPORT_EXPIRED]: "Tautan unduhan sudah kedaluwarsa.",
  [C.NOT_FOUND]: "Widget ini tidak ditemukan atau akses Anda sudah dicabut. Muat ulang halaman.",
  [EXPORT_GONE]: "Ekspor ini tidak ditemukan lagi.",
  [OFFLINE]: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
  [SESSION]: "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi.",
  [C.RENDERER_UNAVAILABLE]:
    "Layanan pembuat PDF sedang tidak tersedia. Coba lagi beberapa saat lagi.",
};
/** PDF dashboard (T-018): sasarannya dashboard utuh, batasnya waktu render dan ukuran file. */
const PDF_TEXT: Record<string, string> = {
  [C.NOT_FOUND]: "Dashboard ini tidak ditemukan atau akses Anda sudah dicabut. Muat ulang halaman.",
  [C.EXPORT_TIMEOUT]: "PDF tidak selesai dibuat dalam batas waktu. Coba lagi beberapa saat lagi.",
  [C.EXPORT_TOO_LARGE]:
    "PDF melebihi batas ukuran file. Persempit filter dashboard lalu ekspor lagi.",
  [C.EXPORT_FAILED]: "PDF gagal dibuat. Coba lagi beberapa saat lagi.",
};
const FALLBACK = "Ekspor belum bisa dibuat. Coba lagi beberapa saat lagi.";
/** Kode yang teksnya milik klien: langkah berikutnya ada di tombol/teks sendiri, bukan pesan server. */
const OWN_TEXT = new Set<string>([C.EXPORT_EXPIRED, C.NOT_FOUND, EXPORT_GONE, OFFLINE, SESSION]);
export const TOO_LARGE_HINT =
  "Misalnya pilih rentang tanggal yang lebih pendek atau lebih sedikit nilai di filter dashboard.";

/** Kode → pesan. Pesan server (berbentuk peran, mis. jumlah baris atau menit tunggu) didahulukan. */
export function exportError(
  code: string,
  serverMessage?: string,
  format?: ExportFileFormat,
): ExportError {
  const own = OWN_TEXT.has(code) ? undefined : serverMessage?.trim();
  const pdf = format === "pdf";
  return {
    code,
    message: own || (pdf ? PDF_TEXT[code] : undefined) || TEXT[code] || FALLBACK,
    // Saran mempersempit baris hanya untuk file tabular (batas PDF = ukuran file, bukan baris).
    ...(code === C.EXPORT_TOO_LARGE && !pdf ? { hint: TOO_LARGE_HINT } : {}),
    again: code === C.EXPORT_EXPIRED || code === EXPORT_GONE,
  };
}

/** Jawaban gagal POST /api/exports → kode (status 0 = jaringan). */
export function rejectCode(status: number, code?: string): string {
  if (status === 0) return OFFLINE;
  if (status === 401) return SESSION;
  if (status === 404) return C.NOT_FOUND;
  return code || (status === 429 ? C.RATE_LIMITED : C.UNAVAILABLE);
}

export type ExportJob =
  | { phase: "idle" }
  | { phase: "starting"; format: ExportFileFormat }
  | { phase: "running"; format: ExportFileFormat; id: string }
  | {
      phase: "done";
      format: ExportFileFormat;
      id: string;
      rows: number | null;
      expiresAt: string | null;
    }
  | { phase: "error"; format: ExportFileFormat; error: ExportError };

export type ExportEvent =
  | { type: "start"; format: ExportFileFormat }
  | { type: "created"; id: string }
  | { type: "rejected"; status: number; code?: string; message?: string }
  | { type: "status"; id: string; view: ExportStatusView }
  /** Polling berhenti tanpa hasil: 401/403/404/410 (use-polling onStop; 404 = akses dicabut). */
  | { type: "stopped"; id: string; status: number }
  /** Jam lokal melewati expiresAt (dikurangi margin). */
  | { type: "expired"; id: string }
  /** "Unduh lagi" membaca status ulang dan tautannya tidak berlaku lagi (recheckOutcome). */
  | { type: "recheck"; id: string; code: string; message?: string };

export const EXPORT_IDLE: ExportJob = { phase: "idle" };
export const exportBusy = (
  job: ExportJob,
): job is Extract<ExportJob, { phase: "starting" | "running" }> =>
  job.phase === "starting" || job.phase === "running";

const fail = (format: ExportFileFormat, code: string, message?: string): ExportJob => ({
  phase: "error",
  format,
  error: exportError(code, message, format),
});

/** Peristiwa milik ekspor lain (id lama) atau di luar urutan diabaikan. Murni. */
export function exportReducer(job: ExportJob, e: ExportEvent): ExportJob {
  switch (e.type) {
    case "start":
      return exportBusy(job) ? job : { phase: "starting", format: e.format };
    case "created":
      return job.phase === "starting" ? { phase: "running", format: job.format, id: e.id } : job;
    case "rejected":
      return job.phase === "starting"
        ? fail(job.format, rejectCode(e.status, e.code), e.message)
        : job;
    case "status": {
      if (job.phase !== "running" || job.id !== e.id) return job;
      const v = e.view;
      if (v.state === "done") {
        const { format, id } = job;
        return { phase: "done", format, id, rows: v.rows ?? null, expiresAt: v.expiresAt ?? null };
      }
      if (v.state === "queued" || v.state === "running") return job;
      if (v.state === "expired") return fail(job.format, C.EXPORT_EXPIRED);
      // failed, atau status yang tidak dikenal: polling sudah berhenti — jangan menunggu selamanya.
      return fail(job.format, v.code || C.EXPORT_FAILED, v.message);
    }
    case "stopped":
      return job.phase === "running" && job.id === e.id
        ? fail(job.format, stopCode(e.status))
        : job;
    case "expired":
      return job.phase === "done" && job.id === e.id ? fail(job.format, C.EXPORT_EXPIRED) : job;
    case "recheck":
      return job.phase === "done" && job.id === e.id ? fail(job.format, e.code, e.message) : job;
  }
}

/**
 * Status berhenti tanpa hasil (401/403/404/410) → kode galat. 404 pada ekspor milik sendiri = akses
 * dashboard dicabut (baris ekspor tidak pernah dihapus): NOT_FOUND tanpa "Ekspor lagi", sama dengan
 * membuat ekspor dan "Unduh lagi" (review R2-CL-2; pemanggil juga mengambil ulang halaman).
 */
const STOP_CODE: Record<number, string> = { 401: SESSION, 404: C.NOT_FOUND, 410: C.EXPORT_EXPIRED };
const stopCode = (status: number) => STOP_CODE[status] ?? EXPORT_GONE;

export type RecheckOutcome =
  | { kind: "download" }
  /** Jaringan/server sesaat (0, 5xx, 429): tautan tetap, user mencoba lagi. */
  | { kind: "retry" }
  | { kind: "error"; code: string; message?: string; accessLost: boolean };

/**
 * "Unduh lagi" (review R1 CL-3): status GET /api/exports/<id> dibaca dulu (tanpa jejak audit) agar tautan
 * yang mati tidak gagal diam-diam sebagai unduhan "download.json". Selesai dan belum lewat expiresAt
 * (margin sama dengan penghitung mundur) → unduh; kedaluwarsa → "Ekspor lagi"; gagal → pesan server;
 * 404 → akses dicabut: halaman diambil ulang seperti saat membuat ekspor. Murni.
 */
export function recheckOutcome(
  status: number,
  view: ExportStatusView | null,
  now: number,
): RecheckOutcome {
  const error = (code: string, message?: string): RecheckOutcome => ({
    kind: "error",
    code,
    ...(message ? { message } : {}),
    accessLost: status === 404,
  });
  if ([401, 403, 404, 410].includes(status)) return error(stopCode(status));
  if (status !== 200 || !view) return { kind: "retry" };
  if (view.state === "done") {
    const expired = expiryDelay(view.expiresAt ?? null, now) === 0;
    return expired ? error(C.EXPORT_EXPIRED) : { kind: "download" };
  }
  if (view.state === "expired") return error(C.EXPORT_EXPIRED);
  return error(view.code || C.EXPORT_FAILED, view.message);
}

/** "Unduh lagi" disembunyikan sedikit sebelum expiresAt server (jam klien bisa terlambat). */
export const EXPIRY_MARGIN_MS = 30_000;
const MAX_TIMEOUT = 2 ** 31 - 1;

/** Jeda sampai tautan dianggap kedaluwarsa; null = tanpa expiresAt yang terbaca (tidak dijadwalkan). */
export function expiryDelay(expiresAt: string | null, now: number): number | null {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  if (Number.isNaN(at)) return null;
  return Math.min(MAX_TIMEOUT, Math.max(0, at - EXPIRY_MARGIN_MS - now));
}

const CLOCK = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Rincian "Siap diunduh": "1.234 baris · berlaku sampai 15.42 WIB". */
export function doneDetail(rows: number | null, expiresAt: string | null): string {
  const at = expiresAt ? new Date(expiresAt) : null;
  return [
    rows !== null ? `${rows.toLocaleString("id-ID")} baris` : null,
    at && !Number.isNaN(at.getTime()) ? `berlaku sampai ${CLOCK.format(at)} WIB` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Baris status selama ekspor berjalan (teks yang juga diumumkan wilayah status). */
export const busyLabel = (format: ExportFileFormat) =>
  format === "pdf" ? "Menyiapkan PDF…" : "Menyiapkan ekspor…";

/** Pengumuman pembaca layar saat menu ekspor tertutup (wilayah status di dalam menu ikut tertutup). */
export function exportAnnouncement(job: ExportJob, title: string): string {
  if (job.phase !== "idle" && job.format === "pdf") return pdfAnnouncement(job);
  switch (job.phase) {
    case "starting":
    case "running":
      return `Menyiapkan ekspor ${title}…`;
    case "done":
      return `Ekspor ${title} siap diunduh.`;
    case "error":
      return `Ekspor ${title} gagal. Buka menu ekspor untuk detail.`;
    default:
      return "";
  }
}

/** PDF dashboard (T-018): satu sasaran per halaman, jadi tanpa judul widget. */
function pdfAnnouncement(job: Exclude<ExportJob, { phase: "idle" }>): string {
  if (job.phase === "done") return "PDF siap diunduh.";
  if (job.phase === "error") return "Ekspor PDF gagal. Buka Ekspor PDF untuk detail.";
  return busyLabel("pdf");
}
