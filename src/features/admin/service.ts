import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { DATASETS_PER_USER, isIdShape } from "@/features/datasets/validation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { s3Multipart, type MultipartStorage } from "@/lib/storage/multipart";
import { planNames } from "./transfer-names";
import type { AdminErrorCode, AdminResult, TransferSummary } from "./types";

/*
 * Admin pengguna (T-019). Pemanggil WAJIB sudah lolos requireAdmin() (halaman) atau
 * requireAdmin("action") (Server Action); di sini status admin pelaku dicek ulang di bawah lock
 * 'admins' karena peran bisa dicabut admin lain di antara pengecekan dan perubahan.
 * Semua perubahan peran/status/kepemilikan memegang pg_advisory_xact_lock(hashtext('admins')) →
 * cek "admin aktif terakhir" tidak bisa ditembus dua permintaan bersamaan, dan AuditLog ditulis
 * di transaksi yang sama.
 */

export const USERS_PAGE_SIZE = 50;
const QUERY_MAX = 100;
/** Daftar tujuan alih kepemilikan: pengguna internal, ratusan; batas hanya pengaman. */
const TARGETS_MAX = 1000;

export interface Actor {
  id: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  datasetCount: number;
}

const fail = <T>(code: AdminErrorCode, message: string): AdminResult<T> => ({
  ok: false,
  code,
  message,
});
const userNotFound = <T>() => fail<T>("NOT_FOUND", "Pengguna tidak ditemukan.");
/** Pelaku bukan admin aktif lagi: sama seperti non-admin (D2), tanpa membocorkan alasan. */
const pageNotFound = <T>() => fail<T>("NOT_FOUND", "Halaman tidak ditemukan.");
const lastAdmin = <T>() => fail<T>("LAST_ADMIN", "Minimal harus ada satu admin aktif.");
const invalid = <T>() => fail<T>("INVALID", "Permintaan tidak valid.");
const busy = <T>() => fail<T>("BUSY", "Sedang memproses permintaan lain. Coba lagi.");
const badTarget = <T>() =>
  fail<T>("INVALID", "Pilih pengguna tujuan yang aktif dan sudah memverifikasi email.");

/** Antrean lock melewati batas waktu transaksi → coba lagi, bukan 500 (pola datasets/uploads). */
const isLockTimeout = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028";
/** Pemilik baru mengganti nama datasetnya bersamaan (updateDataset tidak memegang lock). */
const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

type Tx = Prisma.TransactionClient;

const lock = (tx: Tx, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

async function actorIsActiveAdmin(tx: Tx, actorId: string): Promise<boolean> {
  const a = await tx.user.findUnique({
    where: { id: actorId },
    select: { isAdmin: true, isActive: true },
  });
  return !!a && a.isAdmin && a.isActive;
}

const activeAdminCount = (tx: Tx) => tx.user.count({ where: { isActive: true, isAdmin: true } });

/** Membatalkan transaksi yang sudah menulis, dengan hasil yang dikembalikan ke pemanggil. */
class Rollback extends Error {
  constructor(public readonly result: AdminResult<never>) {
    super(result.ok ? "rollback" : result.code);
  }
}

async function guarded<T>(run: () => Promise<AdminResult<T>>): Promise<AdminResult<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    if (isLockTimeout(e) || isUniqueViolation(e)) return busy();
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Baca

function cleanQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const s = q
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, QUERY_MAX);
  return s || null;
}

const userRowSelect = {
  id: true,
  email: true,
  name: true,
  isAdmin: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { datasets: true } },
} satisfies Prisma.UserSelect;

/** Daftar pengguna untuk /admin/pengguna: cari email/nama (tanpa peka kapital), aktif dulu. */
export async function listUsers(opts: { q?: string; page?: number } = {}): Promise<{
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const q = cleanQuery(opts.q);
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const total = await prisma.user.count({ where });
  const lastPage = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const requested =
    typeof opts.page === "number" && Number.isSafeInteger(opts.page) && opts.page >= 1
      ? opts.page
      : 1;
  const page = Math.min(requested, lastPage);
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    skip: (page - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
    select: userRowSelect,
  });
  return {
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      isAdmin: r.isAdmin,
      isActive: r.isActive,
      emailVerified: r.emailVerifiedAt !== null,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
      datasetCount: r._count.datasets,
    })),
    total,
    page,
    pageSize: USERS_PAGE_SIZE,
  };
}

/** Calon pemilik baru: aktif + terverifikasi, selain pengguna sumber. */
export async function listTransferTargets(
  excludeUserId: string,
): Promise<{ id: string; email: string; name: string | null }[]> {
  return prisma.user.findMany({
    where: { id: { not: excludeUserId }, isActive: true, emailVerifiedAt: { not: null } },
    orderBy: { email: "asc" },
    take: TARGETS_MAX,
    select: { id: true, email: true, name: true },
  });
}

// ---------------------------------------------------------------------------------------------
// Peran admin

export interface SetAdminOk {
  changed: boolean;
  /** Pelaku mencabut perannya sendiri: Server Action menerbitkan ulang sesi perangkat ini. */
  selfDemoted: boolean;
  /** sessionVersion target setelah perubahan (untuk createSession bila selfDemoted). */
  sessionVersion: number;
}

/**
 * Beri/cabut admin. Pencabutan menaikkan sessionVersion target (AC6: semua sesinya putus; isAdmin
 * selalu dibaca dari DB). Mencabut admin aktif terakhir — termasuk diri sendiri — ditolak LAST_ADMIN.
 */
export async function setUserAdmin(
  actor: Actor,
  userId: unknown,
  isAdmin: unknown,
  ip: string,
): Promise<AdminResult<SetAdminOk>> {
  if (!isIdShape(userId)) return userNotFound();
  if (typeof isAdmin !== "boolean") return invalid();
  return guarded(() =>
    prisma.$transaction(async (tx): Promise<AdminResult<SetAdminOk>> => {
      await lock(tx, "admins");
      if (!(await actorIsActiveAdmin(tx, actor.id))) return pageNotFound();
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isAdmin: true,
          isActive: true,
          emailVerifiedAt: true,
          sessionVersion: true,
        },
      });
      if (!target) return userNotFound();
      if (target.isAdmin === isAdmin) {
        return {
          ok: true,
          data: { changed: false, selfDemoted: false, sessionVersion: target.sessionVersion },
        };
      }
      if (isAdmin) {
        if (!target.isActive) return fail("INVALID", "Aktifkan pengguna dulu.");
        if (!target.emailVerifiedAt) {
          return fail("INVALID", "Pengguna belum memverifikasi email.");
        }
      } else if (target.isActive && (await activeAdminCount(tx)) <= 1) {
        return lastAdmin();
      }
      const updated = await tx.user.update({
        where: { id: target.id },
        // Hanya pencabutan memutus sesi (AC6); pemberian cukup dibaca dari DB di permintaan berikutnya.
        data: isAdmin ? { isAdmin } : { isAdmin, sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: isAdmin ? "user.admin.grant" : "user.admin.revoke",
        targetType: "user",
        targetId: target.id,
        ip,
      });
      logger.info({ actorId: actor.id, userId: target.id, isAdmin }, "peran admin diubah");
      return {
        ok: true,
        data: {
          changed: true,
          selfDemoted: !isAdmin && target.id === actor.id,
          sessionVersion: updated.sessionVersion,
        },
      };
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Aktif / nonaktif

/**
 * Nonaktifkan: isActive=false + sessionVersion naik (AC1: sesi putus di permintaan berikutnya).
 * Menonaktifkan diri sendiri ditolak (LAST_ADMIN bila admin aktif terakhir, selain itu FORBIDDEN).
 * Aktifkan: isActive=true; sessionVersion tetap (token lama sudah basi sejak dinonaktifkan).
 */
export async function setUserActive(
  actor: Actor,
  userId: unknown,
  isActive: unknown,
  ip: string,
): Promise<AdminResult<{ changed: boolean }>> {
  if (!isIdShape(userId)) return userNotFound();
  if (typeof isActive !== "boolean") return invalid();
  return guarded(() =>
    prisma.$transaction(async (tx): Promise<AdminResult<{ changed: boolean }>> => {
      await lock(tx, "admins");
      if (!(await actorIsActiveAdmin(tx, actor.id))) return pageNotFound();
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, isAdmin: true, isActive: true },
      });
      if (!target) return userNotFound();
      if (!isActive && target.id === actor.id) {
        return (await activeAdminCount(tx)) <= 1
          ? lastAdmin()
          : fail("FORBIDDEN", "Anda tidak bisa menonaktifkan akun sendiri.");
      }
      if (target.isActive === isActive) return { ok: true, data: { changed: false } };
      if (!isActive && target.isAdmin && (await activeAdminCount(tx)) <= 1) return lastAdmin();
      await tx.user.update({
        where: { id: target.id },
        data: isActive ? { isActive: true } : { isActive: false, sessionVersion: { increment: 1 } },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: isActive ? "user.activate" : "user.deactivate",
        targetType: "user",
        targetId: target.id,
        ip,
      });
      logger.info({ actorId: actor.id, userId: target.id, isActive }, "status pengguna diubah");
      return { ok: true, data: { changed: true } };
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Alih kepemilikan dataset

export interface TransferDeps {
  storage?: MultipartStorage;
  quotaBytes?: number;
}

const UPLOAD_CANCELLED =
  "Unggahan dibatalkan karena dataset dialihkan ke pemilik lain. Unggah ulang file.";

interface PendingAbort {
  id: string;
  sourceKey: string | null;
  uploadId: string | null;
}

/**
 * Pindahkan SEMUA dataset pengguna nonaktif ke pengguna aktif lain, semua-atau-tidak-sama-sekali.
 * Dashboard dan widget ikut otomatis (kepemilikan hanya lewat Dataset.ownerId). Lock sama dengan
 * createDataset ('datasets:<to>') dan initUpload ('uploads:<to>') → batas 50 dataset dan kuota
 * pemilik baru tidak bisa diakali permintaan paralel. Nama bentrok → akhiran " (n)".
 * Unggahan sumber yang belum selesai ditandai FAILED (pemilik baru tidak bisa melanjutkannya karena
 * di-scope uploadedById); multipart-nya di-abort setelah commit (best-effort).
 */
export async function transferDatasets(
  actor: Actor,
  fromUserId: unknown,
  toUserId: unknown,
  ip: string,
  deps: TransferDeps = {},
): Promise<AdminResult<TransferSummary>> {
  if (!isIdShape(fromUserId)) return userNotFound();
  if (!isIdShape(toUserId) || toUserId === fromUserId) return badTarget();
  const quota = deps.quotaBytes ?? env().USER_STORAGE_QUOTA_BYTES;
  let aborts: PendingAbort[] = [];

  const result = await guarded(() =>
    prisma.$transaction(async (tx): Promise<AdminResult<TransferSummary>> => {
      // Urutan lock tetap (admins → datasets → uploads): tidak ada jalur lain yang memegang
      // 'admins', dan createDataset/initUpload masing-masing hanya memegang satu lock.
      await lock(tx, "admins");
      if (!(await actorIsActiveAdmin(tx, actor.id))) return pageNotFound();
      await lock(tx, `datasets:${toUserId}`);
      await lock(tx, `uploads:${toUserId}`);

      const from = await tx.user.findUnique({
        where: { id: fromUserId },
        select: { id: true, isActive: true },
      });
      if (!from) return userNotFound();
      if (from.isActive) {
        return fail("INVALID", "Nonaktifkan pengguna dulu sebelum mengalihkan datasetnya.");
      }
      const to = await tx.user.findUnique({
        where: { id: toUserId },
        select: { id: true, isActive: true, emailVerifiedAt: true },
      });
      if (!to || !to.isActive || !to.emailVerifiedAt) return badTarget();

      const incoming = await tx.dataset.findMany({
        where: { ownerId: from.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, nameKey: true },
      });
      if (incoming.length === 0) return fail("INVALID", "Pengguna ini tidak punya dataset.");
      const existing = await tx.dataset.findMany({
        where: { ownerId: to.id },
        select: { name: true, nameKey: true },
      });
      const room = Math.max(0, DATASETS_PER_USER - existing.length);
      if (incoming.length > room) {
        return fail(
          "LIMIT_REACHED",
          `Pengguna tujuan sudah punya ${existing.length} dataset, jadi hanya ${room} lagi yang muat, ` +
            `sedangkan yang akan dialihkan ${incoming.length} (batas ${DATASETS_PER_USER} per pengguna). ` +
            "Pilih pengguna lain atau minta pengguna tujuan menghapus dataset yang tidak dipakai.",
        );
      }

      const ids = incoming.map((d) => d.id);
      const pending = await tx.datasetVersion.findMany({
        where: { datasetId: { in: ids }, status: "UPLOADING" },
        select: { id: true, sourceKey: true, uploadId: true },
      });
      if (pending.length > 0) {
        await tx.datasetVersion.updateMany({
          where: { id: { in: pending.map((v) => v.id) }, status: "UPLOADING" },
          data: {
            status: "FAILED",
            uploadId: null,
            completingAt: null,
            errorMessage: UPLOAD_CANCELLED,
          },
        });
      }

      const plan = planNames(incoming, existing);
      const keep = plan.filter((p) => p.renamedFrom === null).map((p) => p.id);
      let moved = 0;
      if (keep.length > 0) {
        const r = await tx.dataset.updateMany({
          where: { id: { in: keep }, ownerId: from.id },
          data: { ownerId: to.id },
        });
        moved += r.count;
      }
      const renamed: TransferSummary["renamed"] = [];
      for (const p of plan) {
        if (p.renamedFrom === null) continue;
        const r = await tx.dataset.updateMany({
          where: { id: p.id, ownerId: from.id },
          data: { ownerId: to.id, name: p.name, nameKey: p.nameKey },
        });
        moved += r.count;
        renamed.push({ from: p.renamedFrom, to: p.name });
      }
      // Semua-atau-tidak: dataset berubah di tengah jalan → batalkan seluruh transaksi.
      if (moved !== incoming.length) throw new Rollback(busy());

      // Sama dengan hitungan kuota initUpload (uploads/service.ts): versi non-FAILED milik pemilik.
      const used = await tx.datasetVersion.aggregate({
        where: { dataset: { ownerId: to.id }, status: { not: "FAILED" } },
        _sum: { sizeBytes: true },
      });
      const quotaExceeded = Number(used._sum.sizeBytes ?? 0n) > quota;

      await recordAudit(tx, {
        actorId: actor.id,
        action: "datasets.transfer",
        targetType: "user",
        targetId: from.id,
        meta: {
          from: from.id,
          to: to.id,
          moved,
          datasetIds: ids,
          renamed,
          failedUploads: pending.length,
        },
        ip,
      });
      aborts = pending;
      return { ok: true, data: { moved, renamed, quotaExceeded } };
    }),
  );
  if (!result.ok) return result;

  const storage = deps.storage ?? s3Multipart;
  for (const v of aborts) {
    if (v.sourceKey && v.uploadId) {
      await storage
        .abort(v.sourceKey, v.uploadId)
        .catch((e: unknown) =>
          logger.warn(
            { versionId: v.id, err: String(e) },
            "abort multipart gagal (lifecycle membersihkan)",
          ),
        );
    }
    // Complete bisa sudah sukses tanpa versi sempat berubah: buang objek agar tidak yatim.
    if (v.sourceKey) await storage.remove(v.sourceKey).catch(() => {});
  }
  logger.info(
    {
      actorId: actor.id,
      from: fromUserId,
      to: toUserId,
      moved: result.data.moved,
      renamed: result.data.renamed.length,
      failedUploads: aborts.length,
    },
    "dataset dialihkan",
  );
  return result;
}
