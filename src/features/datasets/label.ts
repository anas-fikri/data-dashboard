/*
 * Label profil dataset diturunkan dari versi, tidak disimpan sebagai kolom (flow-kerja B5).
 * Fungsi murni: dipakai server (daftar/detail) dan diuji unit.
 */

export type VersionStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "INGESTING"
  | "AWAITING_MAPPING"
  | "AWAITING_CONFIRM"
  | "READY"
  | "FAILED";

/**
 * Status belum terminal: paling banyak satu versi seperti ini per dataset (D4) — menahan unggahan baru
 * dan aktivasi/rollback. AWAITING_CONFIRM (T-049) = unggahan periode menunggu keputusan pemilik.
 */
export const NON_TERMINAL_STATUSES = [
  "UPLOADING",
  "UPLOADED",
  "INGESTING",
  "AWAITING_MAPPING",
  "AWAITING_CONFIRM",
] as const satisfies readonly VersionStatus[];

export interface VersionLike {
  id: string;
  status: VersionStatus;
  errorMessage: string | null;
}

export type BadgeKind =
  "uploading" | "processing" | "awaiting_mapping" | "awaiting_confirm" | "failed";

export interface DatasetLabel {
  /** kosong = belum ada versi READY aktif; siap = ada versi aktif. */
  state: "kosong" | "siap";
  /** Status versi terbaru bila versi itu belum menjadi versi aktif. */
  badge: { kind: BadgeKind; text: string; message?: string } | null;
}

const BADGE: Record<Exclude<VersionStatus, "READY">, { kind: BadgeKind; text: string }> = {
  UPLOADING: { kind: "uploading", text: "Belum selesai" },
  UPLOADED: { kind: "processing", text: "Menunggu diproses" },
  INGESTING: { kind: "processing", text: "Memproses" },
  AWAITING_MAPPING: { kind: "awaiting_mapping", text: "Menunggu pemetaan" },
  AWAITING_CONFIRM: { kind: "awaiting_confirm", text: "Menunggu konfirmasi" },
  FAILED: { kind: "failed", text: "Gagal" },
};

export function deriveLabel(
  activeVersionId: string | null,
  latest: VersionLike | null,
): DatasetLabel {
  const state = activeVersionId ? "siap" : "kosong";
  if (!latest || latest.id === activeVersionId || latest.status === "READY") {
    return { state, badge: null };
  }
  const b = BADGE[latest.status];
  return {
    state,
    badge: {
      ...b,
      ...(latest.status === "FAILED" && latest.errorMessage
        ? { message: latest.errorMessage }
        : {}),
    },
  };
}
