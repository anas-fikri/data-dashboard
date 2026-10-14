import type { UploadProgress } from "@/features/uploads/client";

/*
 * Model status panel unggah (T-013), murni agar bisa diuji unit. `ownVersion` = versi server yang
 * dimulai/dilanjutkan tab ini dan mungkin masih UPLOADING: selama ada, "Aktifkan" ditahan dan galat
 * menawarkan "Batalkan unggahan". Dihapus saat selesai, batal berhasil, atau versi terbukti hilang.
 */
export type UploadPanelState =
  | { kind: "idle" }
  | { kind: "cancelled" }
  | { kind: "running"; file: File; progress: UploadProgress }
  | { kind: "paused"; file: File; progress: UploadProgress }
  | { kind: "error"; file: File | null; message: string; retryable: boolean }
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
  const file =
    prev.kind === "running" || prev.kind === "paused" || prev.kind === "error" ? prev.file : null;
  return {
    kind: "error",
    file,
    message: !err || err.code === "NETWORK" ? CANCEL_FAILED : err.message,
    retryable: false,
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
