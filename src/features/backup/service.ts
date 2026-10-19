import "server-only";
import { recordAudit } from "@/features/audit/service";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  backupAlert,
  fingerprint,
  parseOffsite,
  readOffsite,
  readStatus,
  writeOffsite,
  type ParsedOffsite,
  type StoredOffsite,
} from "./config";
import { probeOffsite } from "./probe";
import type { BackupAlert, BackupResult, BackupStatus, OffsiteProbe, OffsiteView } from "./types";

/*
 * Admin › Backup (T-7psf, NAS Synology T-y8qq). Pemanggil WAJIB sudah lolos requireAdmin (halaman) atau
 * currentAdmin (Server Action). Password NAS tidak pernah dikembalikan ke browser, dicatat di log, atau di
 * audit.
 */

const view = (c: StoredOffsite | null): OffsiteView | null =>
  c && {
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    username: c.username,
    folder: c.folder,
    hostKey: c.hostKey,
    fingerprint: fingerprint(c.hostKey),
    hasPassword: c.password.length > 0,
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

/** Isian + password tersimpan bila kolom password dikosongkan. */
async function withPassword(
  raw: unknown,
): Promise<BackupResult<{ offsite: ParsedOffsite; passwordChanged: boolean }>> {
  const p = parseOffsite(raw);
  if (!p.ok) return { ok: false, code: "INVALID", message: p.message, field: p.field };
  const typed = p.data.password;
  const stored = typed ? null : await readOffsite();
  // Password tersimpan hanya dipakai ulang untuk NAS + akun yang sama: admin (atau sesi yang dibajak) tidak
  // bisa mengarahkannya ke server lain lewat "Tes koneksi".
  const same =
    stored !== null &&
    stored.host === p.data.host &&
    stored.port === p.data.port &&
    stored.username === p.data.username;
  const password = typed || (same ? stored.password : "");
  if (!password) {
    return {
      ok: false,
      code: "INVALID",
      message: stored ? "NAS, port, atau username berubah — isi password lagi." : "Isi password.",
      field: "password",
    };
  }
  return { ok: true, data: { offsite: { ...p.data, password }, passwordChanged: !!typed } };
}

export async function testOffsite(raw: unknown): Promise<BackupResult<OffsiteProbe>> {
  const c = await withPassword(raw);
  if (!c.ok) return c;
  const r = await probeOffsite(c.data.offsite);
  return r.ok
    ? { ok: true, data: { hostKey: r.hostKey, fingerprint: fingerprint(r.hostKey) } }
    : { ok: false, code: "UNAVAILABLE", message: r.message };
}

export async function saveOffsite(
  actor: { id: string; email: string },
  raw: unknown,
  ip: string,
): Promise<BackupResult<OffsiteView>> {
  const c = await withPassword(raw);
  if (!c.ok) return c;
  if (!c.data.offsite.hostKey) {
    return {
      ok: false,
      code: "INVALID",
      message: "Tekan Tes koneksi dulu agar kunci host NAS tersimpan, lalu Simpan.",
    };
  }
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
      host: stored.host,
      port: stored.port,
      username: stored.username,
      folder: stored.folder,
      hostKey: fingerprint(stored.hostKey),
      passwordChanged: c.data.passwordChanged,
    },
    ip,
  });
  logger.info({ actorId: actor.id, enabled: stored.enabled }, "target backup off-VM diubah");
  return { ok: true, data: view(stored)! };
}
