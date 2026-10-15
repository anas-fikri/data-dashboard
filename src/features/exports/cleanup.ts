/*
 * Pembersihan ekspor (T-017, E10). Lapisan:
 *  1. job tertunda "delete-export" tepat saat kedaluwarsa (selesai + 60 menit) — expireExport;
 *  2. sapuan "export-cleanup" tiap 5 menit: ekspor kedaluwarsa yang objeknya belum dihapus (job tertunda
 *     hilang/gagal), ekspor QUEUED/RUNNING basi (> 2 jam) → FAILED, dan objek yatim di exports/ yang
 *     lebih tua dari 2 jam (mis. user dihapus → baris Export ikut terhapus) — runExportCleanup;
 *  3. lifecycle bucket exports/ 1 hari (scripts/storage-init.mjs) sebagai jaring terakhir.
 * Objek hanya dihapus lewat deleteExportObject (pola kunci ketat). Dependensi diinjeksi (uji tanpa DB).
 */
import { FAILED_MESSAGE, IN_FLIGHT_STALE_MS } from "./service";
import { EXPORT_CODES } from "./types";

export interface ExportCleanupRepo {
  /** DONE yang lewat expiresAt, punya objek, dan belum ditandai terhapus (paling banyak `limit`). */
  expired(now: Date, limit: number): Promise<{ id: string; key: string }[]>;
  /** Satu ekspor (job delete-export); null bila barisnya sudah tidak ada. */
  one(
    id: string,
  ): Promise<{ key: string | null; expiresAt: Date | null; deletedAt: Date | null } | null>;
  markDeleted(ids: string[], at: Date): Promise<void>;
  /** Baris yang objeknya `keys` ditandai terhapus (sapuan yatim). */
  markDeletedByKeys(keys: string[], at: Date): Promise<void>;
  /** Kunci di antara `keys` yang masih berlaku (DONE, belum terhapus, expiresAt > now). */
  liveKeys(keys: string[], now: Date): Promise<Set<string>>;
  /** QUEUED/RUNNING dibuat sebelum `before` → FAILED; mengembalikan jumlahnya. */
  failStale(before: Date, code: string, message: string): Promise<number>;
}

export interface ExportCleanupStorage {
  /** deleteExportObject (pola kunci ketat). */
  remove(key: string): Promise<void>;
  /** Kunci exports/ yang terakhir diubah sebelum `before`. */
  listOlderThan(before: Date, limit: number): Promise<string[]>;
}

export interface ExportCleanupDeps {
  repo: ExportCleanupRepo;
  storage: ExportCleanupStorage;
  now?: () => Date;
  log?: (msg: string, meta: Record<string, unknown>) => void;
}

/** Objek exports/ lebih tua dari ini tanpa ekspor yang masih berlaku → dihapus (yatim). */
export const ORPHAN_AGE_MS = 2 * 60 * 60 * 1000;
const BATCH = 500;

/** Job delete-export: hapus objek satu ekspor bila sudah kedaluwarsa (atau barisnya sudah hilang). */
export async function expireExport(
  exportId: string,
  key: string,
  deps: ExportCleanupDeps,
): Promise<"deleted" | "not-due" | "done-before"> {
  const now = deps.now?.() ?? new Date();
  const row = await deps.repo.one(exportId);
  if (row?.deletedAt) return "done-before";
  // Belum jatuh tempo (jam berbeda): sapuan berikutnya yang menghapus.
  if (row?.expiresAt && row.expiresAt > now) return "not-due";
  await deps.storage.remove(row?.key ?? key);
  if (row) await deps.repo.markDeleted([exportId], now);
  return "deleted";
}

export async function runExportCleanup(
  deps: ExportCleanupDeps,
): Promise<{ deleted: number; failed: number; stale: number; orphans: number }> {
  const now = deps.now?.() ?? new Date();
  let deleted = 0;
  let failed = 0;
  // 1. Kedaluwarsa: hapus objek dulu, baru tandai — gagal hapus → dicoba lagi sapuan berikutnya.
  for (;;) {
    const due = await deps.repo.expired(now, BATCH);
    const ok: string[] = [];
    for (const e of due) {
      try {
        await deps.storage.remove(e.key);
        ok.push(e.id);
      } catch (err) {
        failed++;
        deps.log?.("objek ekspor gagal dihapus", {
          exportId: e.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (ok.length) await deps.repo.markDeleted(ok, now);
    deleted += ok.length;
    // Tidak ada kemajuan (semua gagal) → berhenti, jangan berputar.
    if (due.length < BATCH || !ok.length) break;
  }
  // 2. Job yang hilang (Redis dikosongkan, worker mati) tidak menahan batas berjalan user selamanya.
  const stale = await deps.repo.failStale(
    new Date(now.getTime() - IN_FLIGHT_STALE_MS),
    EXPORT_CODES.EXPORT_FAILED,
    FAILED_MESSAGE,
  );
  // 3. Objek yatim: lebih tua dari 2 jam (selalu lewat kedaluwarsa 60 menit) dan tidak berlaku lagi.
  const old = await deps.storage.listOlderThan(new Date(now.getTime() - ORPHAN_AGE_MS), 1000);
  const live = old.length ? await deps.repo.liveKeys(old, now) : new Set<string>();
  const gone: string[] = [];
  for (const key of old) {
    if (live.has(key)) continue;
    try {
      await deps.storage.remove(key);
      gone.push(key);
    } catch (err) {
      failed++;
      deps.log?.("objek ekspor yatim gagal dihapus", {
        key,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (gone.length) await deps.repo.markDeletedByKeys(gone, now);
  return { deleted, failed, stale, orphans: gone.length };
}
