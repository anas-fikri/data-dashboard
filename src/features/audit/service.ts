import "server-only";
import type { Prisma } from "@prisma/client";

/*
 * AuditLog (D14): satu baris per tindakan sensitif, ditulis di DALAM transaksi perubahannya sehingga
 * perubahan tanpa jejak (atau jejak tanpa perubahan) tidak mungkin terjadi. T-016/T-017 menambah aksi.
 */

export type AuditAction =
  | "user.admin.grant"
  | "user.admin.revoke"
  | "user.deactivate"
  | "user.activate"
  /** Admin menambah akun + mengirim undangan buat password, meta { isAdmin } (T-c7wf). */
  | "user.create"
  /** Admin menghapus akun tanpa dataset; meta { email, wasAdmin, wasActive } (T-c7wf). */
  | "user.delete"
  /** Admin mengubah target backup off-VM (Admin › Backup); meta tanpa secret (T-7psf). */
  | "backup.target.update"
  /** Admin mengubah pengaturan SMTP (Admin › Email); meta tanpa password (T-byys). */
  | "smtp.settings.update"
  /** Admin mengirim email uji dengan isian SMTP (tujuan + server, tanpa password) (T-byys). */
  | "smtp.settings.test"
  | "datasets.transfer"
  /** Pemilik mengaktifkan versi lama dataset (rollback, T-013). */
  | "dataset.version.activate"
  /** Pemetaan kolom versi yang menunggu pemetaan disimpan lalu versinya aktif (T-014). */
  | "dataset.version.map"
  /**
   * Mode periode diaktifkan lewat "Atur periode" (T-051) atau diatur ulang (T-qqyx): versi PERIOD_SETUP
   * aktif, meta { from, versionId, grain, fromGrain (null = aktivasi pertama), periods, droppedRows,
   * sheets[{ sheetId, source, column, label }] }.
   */
  | "dataset.period.activate"
  /** Pengaturan periode dataset diubah (T-051), meta { from, to } berisi { keepPeriods, onLimit }. */
  | "dataset.period.settings"
  /**
   * Pemilik menerapkan unggahan periode yang menunggu konfirmasi (T-052): meta { from, versionId,
   * summary, include, droppedRows }.
   */
  | "dataset.period.confirm"
  /**
   * Pemilik menghapus satu periode (T-056): versi PERIOD_REMOVE aktif, meta { from, versionId, period,
   * rows }.
   */
  | "dataset.period.remove"
  /**
   * Pemilik memulihkan satu periode dari versi lama yang masih tersimpan (T-056): versi PERIOD_RESTORE
   * aktif, meta { from, versionId, period, sourceVersionId, beforeRows, afterRows }.
   */
  | "dataset.period.restore"
  /** Pemilik menghapus dataset beserta dashboard dan share-nya (T-016). */
  | "dataset.delete"
  /** Share dashboard per user: diberikan, perannya diubah, dicabut (T-016). */
  | "dashboard.share.grant"
  | "dashboard.share.role"
  | "dashboard.share.revoke"
  /** Share organisasi dinyalakan/dimatikan (meta.on) (T-016). */
  | "dashboard.org.share"
  /** Dashboard dibuka (dedup per user+dashboard 30 menit) (T-016). */
  | "dashboard.open"
  /** Pemilik menghapus dashboard; share user + organisasinya ikut berakhir (review T-016 R3 CC-2). */
  | "dashboard.delete"
  /**
   * File ekspor widget (CSV/XLSX) diunduh (T-017): ditulis setiap kali tautan unduh diberikan, meta
   * { widgetId, exportId, format, rows, role }.
   */
  | "dashboard.widget.export"
  /**
   * File PDF dashboard diunduh (T-018): ditulis setiap kali tautan unduh diberikan, meta
   * { exportId, format: "pdf", role } (tanpa nilai filter).
   */
  | "dashboard.export"
  /**
   * File "Unduh tampilan" Lihat data (CSV/XLSX) diunduh (T-046): ditulis setiap kali tautan unduh
   * diberikan, target = dataset, meta { sheetId, exportId, format, rows, role } tanpa nilai saringan.
   */
  | "dataset.sheet.export"
  /**
   * Admin membuat / mengubah (T-0vjt) / menerbitkan / menarik / menghapus artikel panduan (T-020), meta
   * { slug, role } tanpa isi artikel. Terbit/tarik hanya bila statusnya benar-benar berubah.
   */
  | "guide.create"
  | "guide.update"
  | "guide.publish"
  | "guide.unpublish"
  | "guide.delete"
  /** Admin menambah (unggah selesai) / menghapus video panduan (T-021), meta { videoId, … }. */
  | "guide.video.add"
  | "guide.video.delete"
  /** Takarir/poster video panduan (T-qqbc), meta { videoId } (+ replaced untuk takarir), tanpa isi file. */
  | "guide.video.caption"
  | "guide.video.caption.delete"
  | "guide.video.poster";

export interface AuditEntry {
  /** null hanya untuk tindakan sistem (tanpa pelaku manusia). */
  actorId: string | null;
  action: AuditAction;
  targetType: "user" | "dataset" | "dashboard" | "guide" | "system";
  targetId: string;
  /** Detail tanpa rahasia (tanpa password/token/cookie). */
  meta?: Prisma.InputJsonValue;
  /** Dari clientIp(): "local" di dev, "unknown" bila header proxy hilang. */
  ip: string;
}

/** Klien minimal (transaksi atau prisma) agar mudah dipalsukan di unit test. */
export interface AuditClient {
  auditLog: Pick<Prisma.TransactionClient["auditLog"], "create">;
}

const IP_MAX = 64;

export async function recordAudit(tx: AuditClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      meta: entry.meta,
      ip: entry.ip.slice(0, IP_MAX) || "unknown",
    },
    select: { id: true },
  });
}
