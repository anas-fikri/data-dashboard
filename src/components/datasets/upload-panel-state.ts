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
export type UploadChoice = { mode: "REPLACE" } | { mode: "PERIOD"; label: string | null };

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
 * Pilihan untuk file yang dipilih di dropzone utama. File sama dengan unggahan tertunda (nama + ukuran)
 * → pilihan unggahan itu (melanjutkan, R20); dataset non-periode → REPLACE; dataset periode tanpa
 * sheet berlabel → PERIOD tanpa label; dengan sheet berlabel → null (pemilih periode harus diisi dulu).
 */
export function choiceForFile(
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
): UploadChoice | null {
  const p = ctx.pending;
  // Unggahan periode tertunda hanya dilanjutkan selama dataset masih per periode (ada versi dasar).
  if (
    p &&
    p.originalName === file.name &&
    p.sizeBytes === file.size &&
    (p.mode === "REPLACE" || ctx.period)
  ) {
    return p.mode === "PERIOD" ? { mode: "PERIOD", label: p.label } : REPLACE_CHOICE;
  }
  if (!ctx.period) return REPLACE_CHOICE;
  return ctx.period.needsLabel ? null : { mode: "PERIOD", label: null };
}
