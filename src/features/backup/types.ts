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
  /** Kirim ulang gagal berturut-turut karena NAS menolak menyimpan (T-tsvf); 0 = tidak dijeda. */
  syncFailures: number;
  /** Kirim ulang otomatis berikutnya saat dijeda; null = tiap 30 menit seperti biasa. */
  nextSyncAt: string | null;
  /** "Kirim ulang sekarang" terakhir yang dijalankan service backup. */
  lastRequestAt: string | null;
  /** Lama simpan yang berlaku di run terakhir (Admin › Backup atau .env.prod). */
  retention: BackupRetention | null;
  /** Arsip di server, terbaru dulu. */
  archives: BackupArchive[];
  localBytes: number | null;
  /** Ruang disk volume backup di server. */
  disk: SpaceInfo | null;
  /** Ringkasan arsip di NAS (dicek setelah salinan berhasil). */
  remote: RemoteSummary | null;
  /** Sisa ruang volume NAS (rclone about); kuota folder/akun DSM tidak selalu terlihat. */
  nasSpace: (SpaceInfo & { target: string; checkedAt: string }) | null;
}

export interface SpaceInfo {
  totalBytes: number;
  freeBytes: number;
}

export interface BackupArchive {
  name: string;
  sizeBytes: number;
  /** Sudah tersalin ke target off-VM saat ini. */
  offsite: boolean;
}

export interface RemoteSummary {
  target: string;
  count: number;
  bytes: number;
  oldest: string | null;
  newest: string | null;
  checkedAt: string;
}

export interface BackupRetention {
  localDays: number;
  remoteDays: number;
  /** app = Admin › Backup, env = .env.prod (bawaan server). */
  source: "app" | "env";
}

/** Lama simpan yang diatur admin (app/retention.json); null = bawaan server (.env.prod). */
export interface RetentionView {
  localDays: number;
  remoteDays: number;
  updatedAt: string;
  updatedBy: string;
}

export interface RetentionInput {
  localDays: string;
  remoteDays: string;
}

export type RetentionField = keyof RetentionInput;

/** Run service backup yang sedang berjalan (running.json). */
export interface BackupRun {
  kind: "backup" | "sync";
  since: string;
}

/** Keadaan "Kirim ulang sekarang" untuk tombol di Admin › Backup. */
export interface SyncState {
  /** Permintaan sudah ditulis dan belum diambil service backup. */
  requested: boolean;
  running: BackupRun | null;
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
  /** Sisa ruang volume NAS (statvfs@openssh.com); null = NAS tidak mendukung. */
  space: SpaceInfo | null;
}

export type BackupErrorCode = "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "BUSY";

export type BackupResult<T = null, F extends string = OffsiteField> =
  { ok: true; data: T } | { ok: false; code: BackupErrorCode; message: string; field?: F };

/** Peringatan untuk banner admin: null = tidak ada yang perlu ditindak. */
export interface BackupAlert {
  tone: "warning" | "error";
  text: string;
}
