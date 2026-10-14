import type { BadgeKind, DatasetLabel } from "@/features/datasets/label";
import type { VersionCode, VersionRow } from "@/features/versions/types";

/*
 * Teks dan nada riwayat versi (T-013), murni agar bisa diuji unit. Hanya versi aktif yang bernada
 * primer, jadi penanda "Aktif" tidak tertukar dengan status lain; status selalu teks + ikon.
 */
export type VersionKind = "active" | "ready" | "failed" | "mapping" | "processing" | "uploading";

export interface VersionStatusView {
  kind: VersionKind;
  label: string;
  tone: "neutral" | "primary" | "warning" | "destructive";
}

export function versionStatusView(v: Pick<VersionRow, "status" | "active">): VersionStatusView {
  if (v.active) return { kind: "active", label: "Aktif", tone: "primary" };
  switch (v.status) {
    case "READY":
      return { kind: "ready", label: "Siap", tone: "neutral" };
    case "FAILED":
      return { kind: "failed", label: "Gagal", tone: "destructive" };
    case "AWAITING_MAPPING":
      return { kind: "mapping", label: "Menunggu pemetaan", tone: "warning" };
    case "INGESTING":
      return { kind: "processing", label: "Memproses", tone: "neutral" };
    case "UPLOADED":
      return { kind: "processing", label: "Menunggu diproses", tone: "neutral" };
    default:
      return { kind: "uploading", label: "Belum selesai", tone: "neutral" };
  }
}

/** Alasan dataset sibuk = jenis badge versi terbaru yang belum terminal. */
export type ActivationBusy = Exclude<BadgeKind, "failed">;

/**
 * Dataset sibuk = versi terbaru belum aktif dan belum terminal (diunggah/diproses/menunggu
 * pemetaan); null bila tidak sibuk. Versi non-terminal selalu yang terbaru, jadi badge label cukup;
 * server tetap menolak DATASET_BUSY sebagai penjaga balapan. Versi terbaru GAGAL tidak menahan
 * aktivasi.
 */
export function activationBusy(badge: DatasetLabel["badge"]): ActivationBusy | null {
  return badge && badge.kind !== "failed" ? badge.kind : null;
}

/**
 * Keadaan sibuk yang ditampilkan: versi terbaru di server didahulukan; bila server belum melihatnya
 * (halaman tidak di-refresh di tengah unggahan), unggahan yang sedang ditransfer di tab ini.
 */
export function shownBusy(
  server: ActivationBusy | null,
  uploadingInTab: boolean,
): ActivationBusy | null {
  return server ?? (uploadingInTab ? "uploading" : null);
}

/** Satu kalimat per keadaan sibuk: hanya menyebut tindakan yang benar-benar membuka aktivasi. */
export const BUSY_TEXT: Record<ActivationBusy, string> = {
  uploading: "Versi aktif bisa diganti setelah unggahan selesai diproses atau dibatalkan.",
  processing: "Versi aktif bisa diganti setelah file baru selesai diproses.",
  awaiting_mapping:
    "Versi aktif bisa diganti setelah versi yang menunggu pemetaan dipetakan atau dibuang.",
};

/**
 * Pemberitahuan "Versi X aktif" hanya benar selama X masih aktif: bila versi aktif berganti
 * (mis. refresh yang cocok mengaktifkan unggahan baru), pemberitahuan versi lain dibuang.
 */
export function keepNotice<T extends { versionId: string }>(
  notice: T | null,
  activeVersionId: string | null,
): T | null {
  return notice && notice.versionId === activeVersionId ? notice : null;
}

/** Waktu yang ditampilkan: selesai diproses bila ada, selain itu waktu unggah. */
export function versionTime(v: Pick<VersionRow, "finishedAt" | "createdAt">): {
  verb: "Diproses" | "Diunggah";
  iso: string;
} {
  return v.finishedAt
    ? { verb: "Diproses", iso: v.finishedAt }
    : { verb: "Diunggah", iso: v.createdAt };
}

/** Waktu metadata selalu Asia/Jakarta (konvensi), sama dengan formatDate halaman profil. */
export function formatJakarta(at: string | Date): string {
  return new Date(at).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const NETWORK_ERROR = "Tidak bisa menghubungi server. Periksa koneksi, lalu coba lagi.";

/*
 * NOT_FOUND memakai teks UI (tidak membedakan "tidak ada" dari "tidak berhak", D2); kode lain
 * memakai pesan server yang lebih spesifik (sisa waktu rate limit, alasan sibuk/tidak valid).
 */
const ERRORS: Record<VersionCode, { text: string; preferServer: boolean }> = {
  NOT_FOUND: {
    text: "Versi ini tidak ditemukan lagi; mungkin sudah dihapus otomatis. Muat ulang halaman.",
    preferServer: false,
  },
  DATASET_BUSY: {
    text: "Tunggu file baru selesai diproses, atau versi yang menunggu pemetaan dipetakan atau dibuang, sebelum mengganti versi aktif.",
    preferServer: true,
  },
  INVALID: {
    text: "Status versi ini sudah berubah. Muat ulang halaman untuk melihat status terbaru.",
    preferServer: true,
  },
  RATE_LIMITED: {
    text: "Terlalu banyak perubahan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.",
    preferServer: true,
  },
  STALE: {
    text: "Skema aktif berubah. Muat ulang halaman ini.",
    preferServer: false,
  },
};

export function versionErrorText(code: string, serverMessage: string): string {
  // Kode baru yang belum dikenal UI: tampilkan pesan server apa adanya.
  const known: { text: string; preferServer: boolean } | undefined = ERRORS[code as VersionCode];
  if (!known) return serverMessage || NETWORK_ERROR;
  return known.preferServer && serverMessage ? serverMessage : known.text;
}
