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
  | "datasets.transfer"
  /** Pemilik mengaktifkan versi lama dataset (rollback, T-013). */
  | "dataset.version.activate"
  /** Pemetaan kolom versi yang menunggu pemetaan disimpan lalu versinya aktif (T-014). */
  | "dataset.version.map";

export interface AuditEntry {
  /** null hanya untuk tindakan sistem (tanpa pelaku manusia). */
  actorId: string | null;
  action: AuditAction;
  targetType: "user" | "dataset";
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
