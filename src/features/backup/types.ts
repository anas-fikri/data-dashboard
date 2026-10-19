/** Status yang ditulis service backup (deploy/backup.sh) ke status.json (T-7psf). */
export type BackupState = "ok" | "pending" | "failed" | "off";

export interface BackupStatus {
  state: BackupState;
  /** Target off-VM tanpa rahasia, mis. "dashboard-backup@10.3.3.50:22/backup-data-dashboard". */
  target: string | null;
  /** Arsip di VM yang belum tersalin ke target. */
  pending: number;
  pendingSince: string | null;
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
  lastArchive: string | null;
  lastSizeBytes: number | null;
  lastOffsiteOkAt: string | null;
  error: string | null;
  updatedAt: string;
}

/** Target NAS Synology (SFTP) untuk form Admin › Backup: password tidak pernah dikirim balik ke browser. */
export interface OffsiteView {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  folder: string;
  /** Kunci publik host NAS yang dipin ("ssh-ed25519 AAAA…"), bukan rahasia. */
  hostKey: string;
  fingerprint: string;
  hasPassword: boolean;
  updatedAt: string | null;
}

/** Isian form (password kosong = pakai password tersimpan untuk NAS + akun yang sama). */
export interface OffsiteInput {
  enabled: boolean;
  host: string;
  port: string;
  username: string;
  password: string;
  folder: string;
  /** Diisi dari hasil "Tes koneksi" (kosong = terima kunci host baru pada tes berikutnya). */
  hostKey: string;
}

export type OffsiteField = keyof OffsiteInput;

/** Hasil tes koneksi: kunci host yang dilihat (dipin saat disimpan) + sidik jarinya untuk dicocokkan. */
export interface OffsiteProbe {
  hostKey: string;
  fingerprint: string;
}

export type BackupErrorCode = "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "BUSY";

export type BackupResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: BackupErrorCode; message: string; field?: OffsiteField };

/** Peringatan untuk banner admin: null = tidak ada yang perlu ditindak. */
export interface BackupAlert {
  tone: "warning" | "error";
  text: string;
}
