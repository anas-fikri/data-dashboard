import "server-only";
import { recordAudit } from "@/features/audit/service";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  backupAlert,
  clearRetention,
  fingerprint,
  parseOffsite,
  parseRetention,
  readOffsite,
  readRetention,
  readRunning,
  readStatus,
  syncRequested,
  writeOffsite,
  writeRetention,
  writeSyncRequest,
  type ParsedOffsite,
  type StoredOffsite,
} from "./config";
import { probeOffsite } from "./probe";
import type {
  BackupAlert,
  BackupResult,
  BackupStatus,
  OffsiteProbe,
  OffsiteView,
  RetentionField,
  RetentionView,
  SyncState,
} from "./types";

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
  retention: RetentionView | null;
  sync: SyncState;
}> {
  const [offsite, status, retention, requested, running] = await Promise.all([
    readOffsite(),
    readStatus(),
    readRetention(),
    syncRequested(),
    readRunning(),
  ]);
  return {
    offsite: view(offsite),
    status,
    alert: backupAlert(status),
    retention,
    sync: { requested, running },
  };
}

/** Keadaan tombol "Kirim ulang sekarang" (dipantau halaman selama permintaan/run berjalan). */
export async function getSyncState(): Promise<{ sync: SyncState; updatedAt: string | null }> {
  const [requested, running, status] = await Promise.all([
    syncRequested(),
    readRunning(),
    readStatus(),
  ]);
  return { sync: { requested, running }, updatedAt: status?.updatedAt ?? null };
}

const UNWRITABLE = {
  ok: false,
  code: "UNAVAILABLE",
  message:
    "Tidak bisa disimpan: folder backup-config di server tidak bisa ditulis. Hubungi pengelola server.",
} as const;

function unwritable(actorId: string, e: unknown, what: string) {
  logger.error(
    { actorId, err: (e as NodeJS.ErrnoException).code ?? String(e) },
    `${what} tidak bisa ditulis`,
  );
  return UNWRITABLE;
}

/**
 * "Kirim ulang sekarang": service backup (cron --tick tiap menit) mengirim arsip tertunda walau sedang dijeda,
 * paling sering sekali per 5 menit. Permintaan yang belum diambil tidak ditulis ulang.
 */
export async function requestSync(
  actor: { id: string; email: string },
  ip: string,
): Promise<BackupResult<SyncState>> {
  if (!(await syncRequested())) {
    try {
      await writeSyncRequest();
    } catch (e) {
      return unwritable(actor.id, e, "permintaan kirim ulang");
    }
    await recordAudit(prisma, {
      actorId: actor.id,
      action: "backup.sync.request",
      targetType: "system",
      targetId: "backup-offsite",
      meta: {},
      ip,
    });
    logger.info({ actorId: actor.id }, "kirim ulang backup diminta");
  }
  return { ok: true, data: { requested: true, running: await readRunning() } };
}

/** Pengaturan baru diterapkan service backup dalam ± 1 menit, bukan menunggu kirim ulang/backup berikutnya. */
async function applySoon(actorId: string) {
  try {
    await writeSyncRequest();
  } catch (e) {
    logger.warn(
      { actorId, err: (e as NodeJS.ErrnoException).code ?? String(e) },
      "permintaan penerapan backup tidak bisa ditulis",
    );
  }
}

export async function saveRetention(
  actor: { id: string; email: string },
  raw: unknown,
  ip: string,
): Promise<BackupResult<RetentionView, RetentionField>> {
  const p = parseRetention(raw);
  if (!p.ok) return { ok: false, code: "INVALID", message: p.message, field: p.field };
  const value: RetentionView = {
    ...p.data,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
  };
  try {
    await writeRetention(value);
  } catch (e) {
    return unwritable(actor.id, e, "lama simpan backup");
  }
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "backup.retention.update",
    targetType: "system",
    targetId: "backup-retention",
    meta: { localDays: value.localDays, remoteDays: value.remoteDays },
    ip,
  });
  await applySoon(actor.id);
  return { ok: true, data: value };
}

/** Kembali ke lama simpan bawaan server (.env.prod). */
export async function resetRetention(
  actor: { id: string; email: string },
  ip: string,
): Promise<BackupResult<null, RetentionField>> {
  try {
    await clearRetention();
  } catch (e) {
    return unwritable(actor.id, e, "lama simpan backup");
  }
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "backup.retention.reset",
    targetType: "system",
    targetId: "backup-retention",
    meta: {},
    ip,
  });
  await applySoon(actor.id);
  return { ok: true, data: null };
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
  // Password tersimpan hanya dipakai ulang untuk NAS + akun + kunci host yang dipin: admin (atau sesi yang
  // dibajak) tidak bisa mengarahkannya ke server lain lewat "Tes koneksi", termasuk dengan melupakan kunci
  // host (kunci baru diterima apa adanya) atau menyimpan kunci pilihannya sendiri.
  const same =
    stored !== null &&
    stored.host === p.data.host &&
    stored.port === p.data.port &&
    stored.username === p.data.username &&
    p.data.hostKey === stored.hostKey;
  const password = typed || (same ? stored.password : "");
  if (!password) {
    return {
      ok: false,
      code: "INVALID",
      message: stored
        ? "NAS, port, username, atau kunci host berubah — isi password lagi."
        : "Isi password.",
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
    ? {
        ok: true,
        data: { hostKey: r.hostKey, fingerprint: fingerprint(r.hostKey), space: r.space ?? null },
      }
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
  // NAS baru/aktif lagi: arsip tertunda langsung dikirim, tidak menunggu kirim ulang 30 menit berikutnya.
  if (stored.enabled) await applySoon(actor.id);
  return { ok: true, data: view(stored)! };
}
