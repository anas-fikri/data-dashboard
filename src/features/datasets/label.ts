/*
 * Label profil dataset diturunkan dari versi, tidak disimpan sebagai kolom (flow-kerja B5).
 * Fungsi murni: dipakai server (daftar/detail) dan diuji unit.
 */

export type VersionStatus =
  "UPLOADING" | "UPLOADED" | "INGESTING" | "AWAITING_MAPPING" | "READY" | "FAILED";

export interface VersionLike {
  id: string;
  status: VersionStatus;
  errorMessage: string | null;
}

export type BadgeKind = "uploading" | "processing" | "awaiting_mapping" | "failed";

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
