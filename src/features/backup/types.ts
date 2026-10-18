/** Status yang ditulis service backup (deploy/backup.sh) ke status.json (T-7psf). */
export type BackupState = "ok" | "pending" | "failed" | "off";

export interface BackupStatus {
  state: BackupState;
  /** Target off-VM tanpa rahasia, mis. "s3.contoh.lan:9000/backup-data-dashboard/data-dashboard". */
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

/** Target off-VM untuk form Admin › Backup: secret tidak pernah dikirim balik ke browser. */
export interface OffsiteView {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  hasSecret: boolean;
  updatedAt: string | null;
}

/** Isian form (secret kosong = pakai secret yang sudah tersimpan). */
export interface OffsiteInput {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type OffsiteField = keyof OffsiteInput;

export type BackupErrorCode = "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "BUSY";

export type BackupResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: BackupErrorCode; message: string; field?: OffsiteField };

/** Peringatan untuk banner admin: null = tidak ada yang perlu ditindak. */
export interface BackupAlert {
  tone: "warning" | "error";
  text: string;
}
