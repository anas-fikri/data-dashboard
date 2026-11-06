import type { UploadProgress } from "@/features/uploads/client";

/*
 * Model status panel unggah (T-013), murni agar bisa diuji unit. `ownVersion` = versi server yang
 * dimulai/dilanjutkan tab ini dan mungkin masih UPLOADING: selama ada, "Aktifkan" ditahan dan galat
 * menawarkan "Batalkan unggahan". Dihapus saat selesai, batal berhasil, atau versi terbukti hilang.
 */
/**
 * Pilihan unggahan (T-053): REPLACE = ganti semua data; PERIOD = tambah/perbarui periode (label = awal
 * periode untuk sheet bersumber label). Dibawa bersama file agar "Coba lagi"/"Lanjutkan" memakai
 * pilihan yang sama — server hanya melanjutkan versi dengan mode + label yang sama.
 */
export type UploadChoice =
  /** `sheets` = sheet xlsx yang diimpor (T-85tb); tanpa/kosong = semua sheet. */
  { mode: "REPLACE"; sheets?: string[] } | { mode: "PERIOD"; label: string | null };

export const REPLACE_CHOICE: UploadChoice = { mode: "REPLACE" };

export type UploadPanelState =
  | { kind: "idle" }
  | { kind: "cancelled" }
  | { kind: "running"; file: File; progress: UploadProgress; choice?: UploadChoice }
  | { kind: "paused"; file: File; progress: UploadProgress; choice?: UploadChoice }
  | {
      kind: "error";
      file: File | null;
      message: string;
      retryable: boolean;
      choice?: UploadChoice;
      /** Versi aktif berganti sejak halaman dibuka (STALE): tawarkan muat ulang. */
      stale?: boolean;
    }
  | { kind: "done"; name: string }
  | { kind: "discarded"; name: string };

type ErrorState = Extract<UploadPanelState, { kind: "error" }>;

interface UploadErrLike {
  code: string;
  message: string;
  versionId?: string;
}

export const RETRYABLE = new Set([
  "NETWORK",
  "STORAGE_ERROR",
  "BUSY",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
]);

export const CANCEL_FAILED =
  "Unggahan gagal dibatalkan. Periksa koneksi, lalu tekan “Batalkan unggahan” lagi.";

/**
 * Versi server sudah tidak UPLOADING: hilang (NOT_FOUND) atau gagal permanen di server. UPLOAD_FAILED/
 * UPLOAD_CORRUPT hanya dikirim server (mis. init: unggahan lama kedaluwarsa, tanpa versionId);
 * INVALID_FORMAT/FILE_TOO_LARGE juga dari pra-cek file lokal, jadi hanya dihitung bila membawa
 * versionId (complete menandai versinya FAILED).
 */
export function versionGone(err: Pick<UploadErrLike, "code" | "versionId">): boolean {
  return (
    err.code === "NOT_FOUND" ||
    err.code === "UPLOAD_FAILED" ||
    err.code === "UPLOAD_CORRUPT" ||
    ((err.code === "INVALID_FORMAT" || err.code === "FILE_TOO_LARGE") && Boolean(err.versionId))
  );
}

/** `ownVersion` setelah start() gagal; DATASET_BUSY (file lain) dan galat tanpa versionId mempertahankannya. */
export function ownVersionAfterError(
  err: Pick<UploadErrLike, "code" | "versionId">,
  current: string | undefined,
): string | undefined {
  return versionGone(err) ? undefined : (err.versionId ?? current);
}

/**
 * Status galat saat "Batalkan" gagal: file tetap (konteks tidak hilang), tetapi tanpa "Coba lagi" —
 * tombol itu melanjutkan unggahan yang justru ingin dibatalkan. Yang ditawarkan "Batalkan unggahan"
 * (selama versi milik tab ini masih ada); melanjutkan tetap bisa dengan memilih file yang sama.
 */
export function cancelFailedState(prev: UploadPanelState, err: UploadErrLike | null): ErrorState {
  const held = prev.kind === "running" || prev.kind === "paused" || prev.kind === "error";
  return {
    kind: "error",
    file: held ? prev.file : null,
    message: !err || err.code === "NETWORK" ? CANCEL_FAILED : err.message,
    retryable: false,
    ...(held && prev.choice ? { choice: prev.choice } : {}),
  };
}

export function isIdleLike(state: UploadPanelState): boolean {
  return (
    state.kind === "idle" ||
    state.kind === "cancelled" ||
    state.kind === "error" ||
    state.kind === "done" ||
    state.kind === "discarded"
  );
}

/**
 * Riwayat versi di tab ini menahan "Aktifkan": selama transfer (versi UPLOADING sudah ada), selama galat
 * masih memegang versi milik tab ini, dan setelah selesai sampai refresh membawa status server.
 */
export function holdsActivation(
  state: UploadPanelState,
  ownVersion: string | undefined,
  refreshing: boolean,
): boolean {
  const progress = state.kind === "running" || state.kind === "paused" ? state.progress : null;
  return (
    Boolean(progress?.versionId) ||
    (state.kind === "error" && Boolean(ownVersion)) ||
    (state.kind === "done" && refreshing)
  );
}

/** Kartu unggahan tertunda; disembunyikan selama galat memegang versi yang sama (tanpa kontrol ganda). */
export function showsPendingCard(
  state: UploadPanelState,
  pendingVersionId: string | undefined,
  ownVersion: string | undefined,
): boolean {
  return (
    Boolean(pendingVersionId) &&
    isIdleLike(state) &&
    !(state.kind === "error" && ownVersion === pendingVersionId)
  );
}

/**
 * Tindakan untuk file yang dipilih di dropzone utama:
 *  - "start": langsung diunggah dengan pilihan itu;
 *  - "pick": pemilih periode diisi dulu (sheet berlabel, termasuk unggahan periode tertunda tanpa label
 *    padahal data aktif kini berlabel — review L2);
 *  - "confirm-replace": file sama dengan unggahan "ganti semua data" yang tertunda, dipilih di dropzone
 *    "Tambah atau perbarui periode" → konfirmasi "Ganti semua data" dulu (review M2).
 * File sama dengan unggahan tertunda (nama + ukuran) melanjutkan pilihannya (server: mode + label sama,
 * R20). Dataset non-periode: panel biasa = ganti data.
 */
export type FileAction =
  { kind: "start"; choice: UploadChoice } | { kind: "pick" } | { kind: "confirm-replace" };

export function actionForFile(
  file: Pick<File, "name" | "size">,
  ctx: {
    period: { needsLabel: boolean } | null;
    pending: {
      originalName: string;
      sizeBytes: number;
      mode: "REPLACE" | "PERIOD";
      label: string | null;
    } | null;
  },
): FileAction {
  const p = ctx.pending;
  const same = p !== null && p.originalName === file.name && p.sizeBytes === file.size;
  if (!ctx.period) return { kind: "start", choice: REPLACE_CHOICE };
  if (same && p.mode === "REPLACE") return { kind: "confirm-replace" };
  if (same && p.mode === "PERIOD" && (p.label || !ctx.period.needsLabel)) {
    return { kind: "start", choice: { mode: "PERIOD", label: p.label } };
  }
  return ctx.period.needsLabel
    ? { kind: "pick" }
    : { kind: "start", choice: { mode: "PERIOD", label: null } };
}

export const PERIOD_GONE =
  "Dataset ini tidak lagi menyimpan data per periode, jadi file tidak dikirim. Muat ulang data, lalu pilih lagi cara mengunggahnya.";

/**
 * Isian init untuk pilihan unggahan. PERIOD tanpa konteks periode (data aktif berganti ke mode biasa)
 * TIDAK pernah diturunkan menjadi ganti semua data (review M1): `ok: false` → tidak ada yang dikirim.
 */
export function periodRequest(
  choice: UploadChoice,
  period: { baseVersionId: string } | null,
):
  | {
      ok: true;
      period?: { baseVersionId: string; label: string | null };
      sheets?: string[];
    }
  | { ok: false; message: string } {
  if (choice.mode === "REPLACE") {
    return choice.sheets?.length ? { ok: true, sheets: choice.sheets } : { ok: true };
  }
  if (!period) return { ok: false, message: PERIOD_GONE };
  return { ok: true, period: { baseVersionId: period.baseVersionId, label: choice.label } };
}

/** Kalimat konfirmasi "Ganti semua data…" (tanpa "Semua 0 periode", review L3). */
export function replaceAllText(periodCount: number): string {
  return periodCount > 0
    ? `Semua ${periodCount.toLocaleString("id-ID")} periode akan diganti`
    : "Semua data akan diganti";
}
