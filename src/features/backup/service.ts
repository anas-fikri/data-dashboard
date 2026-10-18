import "server-only";
import { recordAudit } from "@/features/audit/service";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  backupAlert,
  parseOffsite,
  readOffsite,
  readStatus,
  writeOffsite,
  type ParsedOffsite,
  type StoredOffsite,
} from "./config";
import { probeOffsite } from "./probe";
import type { BackupAlert, BackupResult, BackupStatus, OffsiteView } from "./types";

/*
 * Admin › Backup (T-7psf). Pemanggil WAJIB sudah lolos requireAdmin (halaman) atau currentAdmin
 * (Server Action). Secret target tidak pernah dikembalikan ke browser, dicatat di log, atau di audit.
 */

const view = (c: StoredOffsite | null): OffsiteView | null =>
  c && {
    enabled: c.enabled,
    endpoint: c.endpoint,
    bucket: c.bucket,
    prefix: c.prefix,
    region: c.region,
    accessKeyId: c.accessKeyId,
    hasSecret: c.secretAccessKey.length > 0,
    updatedAt: c.updatedAt,
  };

export async function getBackupPage(): Promise<{
  offsite: OffsiteView | null;
  status: BackupStatus | null;
  alert: BackupAlert | null;
}> {
  const [offsite, status] = await Promise.all([readOffsite(), readStatus()]);
  return { offsite: view(offsite), status, alert: backupAlert(status) };
}

/** Untuk banner admin di shell: galat baca (volume tidak terpasang di dev) → tanpa banner. */
export async function currentBackupAlert(): Promise<BackupAlert | null> {
  try {
    return backupAlert(await readStatus());
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "status backup tidak terbaca");
    return null;
  }
}

/** Isian + secret tersimpan bila kolom secret dikosongkan. */
async function withSecret(
  raw: unknown,
): Promise<BackupResult<{ offsite: ParsedOffsite; secretChanged: boolean }>> {
  const p = parseOffsite(raw);
  if (!p.ok) return { ok: false, code: "INVALID", message: p.message, field: p.field };
  const typed = p.data.secretAccessKey;
  const secret = typed || (await readOffsite())?.secretAccessKey || "";
  if (!secret) {
    return { ok: false, code: "INVALID", message: "Isi secret key.", field: "secretAccessKey" };
  }
  return {
    ok: true,
    data: { offsite: { ...p.data, secretAccessKey: secret }, secretChanged: !!typed },
  };
}

export async function testOffsite(raw: unknown): Promise<BackupResult> {
  const c = await withSecret(raw);
  if (!c.ok) return c;
  const problem = await probeOffsite(c.data.offsite);
  return problem ? { ok: false, code: "UNAVAILABLE", message: problem } : { ok: true, data: null };
}

export async function saveOffsite(
  actor: { id: string; email: string },
  raw: unknown,
  ip: string,
): Promise<BackupResult<OffsiteView>> {
  const c = await withSecret(raw);
  if (!c.ok) return c;
  const stored: StoredOffsite = {
    ...c.data.offsite,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
  };
  try {
    await writeOffsite(stored);
  } catch (e) {
    logger.error(
      { actorId: actor.id, err: (e as NodeJS.ErrnoException).code ?? String(e) },
      "konfigurasi backup tidak bisa ditulis",
    );
    return {
      ok: false,
      code: "UNAVAILABLE",
      message:
        "Konfigurasi tidak bisa disimpan: folder backup-config di server tidak bisa ditulis. Hubungi pengelola server.",
    };
  }
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "backup.target.update",
    targetType: "system",
    targetId: "backup-offsite",
    meta: {
      enabled: stored.enabled,
      endpoint: stored.endpoint,
      bucket: stored.bucket,
      prefix: stored.prefix,
      secretChanged: c.data.secretChanged,
    },
    ip,
  });
  logger.info({ actorId: actor.id, enabled: stored.enabled }, "target backup off-VM diubah");
  return { ok: true, data: view(stored)! };
}
