import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "@/features/audit/service";
import { logAccessDenied } from "@/features/auth/denial-log";
import { normalizeEmail } from "@/features/auth/email-domain";
import { filterOverlapFor } from "@/features/dashboards/service";
import { isIdShape } from "@/features/datasets/validation";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { cleanLine, cleanName, escapeLike } from "@/lib/text";
import {
  canViewWhere,
  dashboardAccess,
  roleOf,
  roleSelect,
  type DashboardAccessRole,
} from "./access";
import {
  SHARE_ROLES,
  type ShareActionResult,
  type ShareRole,
  type ShareState,
  type ShareUserOption,
} from "./types";

/*
 * Berbagi dashboard (T-016), pemilik dataset saja: viewer/tanpa akses → NOT_FOUND, editor (bisa melihat)
 * → FORBIDDEN, dicatat sebagai penolakan akses (ASVS V7). Perubahan akses memegang lock
 * `dashboard:<id>` yang sama dengan penulisan widget/tata letak — pencabutan berurutan tegas dengan
 * simpan editor yang sedang berjalan — dan menulis AuditLog di transaksi yang sama. Penerima: hanya
 * akun aktif + terverifikasi, bukan pemilik. Pemanggil (actions.ts) sudah lolos requireUser("action")
 * dan rate limit.
 */

type Result<T> = ShareActionResult<T>;

/** Kata cari minimal (prefix email/nama) dan hasil maksimal pemilih pengguna. */
export const SHARE_SEARCH_MIN = 3;
export const SHARE_SEARCH_MAX = 10;
const QUERY_MAX = 100;
/** Batas share per dashboard: dialog memuat semua share sekaligus tanpa halaman. */
export const SHARES_PER_DASHBOARD = 200;
/** Dedup audit "dashboard.open" per (user, dashboard). */
export const OPEN_DEDUP_SEC = 30 * 60;

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string, message: string): Result<T> => ({ ok: false, code, message });
const userNotFound = <T>() => fail<T>("NOT_FOUND", "Pengguna tidak ditemukan atau belum aktif.");
const badRole = <T>() => fail<T>("INVALID", "Peran tidak valid.");
const busy = <T>() => fail<T>("BUSY", "Sedang memproses perubahan lain. Coba lagi.");

const isRole = (v: unknown): v is ShareRole => SHARE_ROLES.includes(v as ShareRole);
const isLockTimeout = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028";
/** Dashboard/pengguna terhapus bersamaan (FK atau baris hilang di tengah transaksi). */
const isGone = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025");

/**
 * Bukan pemilik: tanpa akses → NOT_FOUND (tidak membocorkan keberadaan dashboard), bisa melihat →
 * FORBIDDEN. Dicatat dengan pembatas volume log (denial-log.ts).
 */
async function deny<T>(
  userId: string,
  dashboardId: unknown,
  action: string,
  role: DashboardAccessRole | null,
): Promise<Result<T>> {
  const code = role ? "FORBIDDEN" : "NOT_FOUND";
  await logAccessDenied(
    `share:${action}`,
    { userId, code, action, ...(isIdShape(dashboardId) ? { dashboardId } : {}) },
    "aksi berbagi ditolak",
  );
  return role
    ? fail(code, "Hanya pemilik dataset yang bisa mengatur akses dashboard ini.")
    : fail(code, "Dashboard tidak ditemukan.");
}

/** Cek pemilik untuk jalur baca (tanpa lock). null = boleh. */
async function readGate<T>(
  userId: string,
  dashboardId: unknown,
  action: string,
): Promise<Result<T> | null> {
  const a = await dashboardAccess(userId, dashboardId);
  return a?.role === "OWNER" ? null : deny(userId, dashboardId, action, a?.role ?? null);
}

type Tx = Prisma.TransactionClient;
interface Owned {
  ownerId: string;
  orgShared: boolean;
}

/**
 * Perubahan akses: lock `dashboard:<id>` → peran peminta dibaca SETELAH lock → `fn` + AuditLog dalam
 * transaksi yang sama. Lock antre terlalu lama → BUSY; dashboard terhapus bersamaan → NOT_FOUND.
 */
async function ownerTx(
  userId: string,
  dashboardId: unknown,
  action: string,
  fn: (tx: Tx, id: string, d: Owned) => Promise<Result<null>>,
): Promise<Result<null>> {
  if (!isIdShape(dashboardId)) return deny(userId, dashboardId, action, null);
  const id = dashboardId;
  try {
    const out = await prisma.$transaction(
      async (tx): Promise<{ result: Result<null> } | { role: DashboardAccessRole | null }> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dashboard:${id}`}))`;
        const d = await tx.dashboard.findFirst({
          where: { id, ...canViewWhere(userId) },
          select: roleSelect(userId),
        });
        const role = d ? roleOf(userId, d) : null;
        if (!d || role !== "OWNER") return { role };
        return { result: await fn(tx, id, { ownerId: d.dataset.ownerId, orgShared: d.orgShared }) };
      },
    );
    return "result" in out ? out.result : deny(userId, id, action, out.role);
  } catch (e) {
    if (isLockTimeout(e)) return busy();
    if (isGone(e)) return fail("NOT_FOUND", "Dashboard tidak ditemukan.");
    throw e;
  }
}

/**
 * Isi dialog share. HANYA dipanggil setelah peminta dipastikan pemilik (filterOverlapFor sendiri tidak
 * memeriksa akses).
 */
async function shareState(dashboardId: string): Promise<ShareState> {
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId },
    select: {
      orgShared: true,
      shares: {
        orderBy: { createdAt: "asc" },
        take: SHARES_PER_DASHBOARD,
        select: {
          role: true,
          user: {
            select: { id: true, email: true, name: true, isActive: true, emailVerifiedAt: true },
          },
        },
      },
    },
  });
  const grants = (d?.shares ?? []).map((s) => ({
    userId: s.user.id,
    name: cleanName(s.user.name),
    email: s.user.email,
    role: s.role,
    active: s.user.isActive && s.user.emailVerifiedAt !== null,
  }));
  return {
    orgShared: d?.orgShared ?? false,
    grants,
    warnings: {
      editor: grants.some((g) => g.role === "EDITOR"),
      filterColumns: d ? await filterOverlapFor(dashboardId) : [],
    },
  };
}

/** Hasil perubahan: keadaan dialog terbaru (dibaca setelah commit, peminta sudah lolos cek pemilik). */
async function withState(r: Result<null>, dashboardId: unknown): Promise<Result<ShareState>> {
  return r.ok ? ok(await shareState(dashboardId as string)) : r;
}

export async function listShares(
  userId: string,
  dashboardId: unknown,
): Promise<Result<ShareState>> {
  const denied = await readGate<ShareState>(userId, dashboardId, "list");
  return denied ?? ok(await shareState(dashboardId as string));
}

/**
 * Pemilih pengguna: q dibersihkan, ≥ 3 karakter (selain itu daftar kosong — tidak ada daftar awal yang
 * bisa dijelajahi), prefix email atau nama tanpa peka kapital (wildcard literal), maks. 10, hanya akun
 * aktif + terverifikasi selain pemilik. Email lengkap yang persis selalu ditemukan (didahulukan).
 */
export async function searchShareUsers(
  userId: string,
  dashboardId: unknown,
  q: unknown,
): Promise<Result<ShareUserOption[]>> {
  const denied = await readGate<ShareUserOption[]>(userId, dashboardId, "search");
  if (denied) return denied;
  const s = cleanLine(q, QUERY_MAX);
  if (!s || Array.from(s).length < SHARE_SEARCH_MIN) return ok([]);
  const base: Prisma.UserWhereInput = {
    id: { not: userId },
    isActive: true,
    emailVerifiedAt: { not: null },
  };
  const select = { id: true, email: true, name: true } as const;
  const email = normalizeEmail(s);
  const exact = email ? await prisma.user.findFirst({ where: { ...base, email }, select }) : null;
  const like = escapeLike(s);
  const rows = await prisma.user.findMany({
    where: {
      ...base,
      ...(exact ? { NOT: { id: exact.id } } : {}),
      OR: [
        { email: { startsWith: like, mode: "insensitive" } },
        { name: { startsWith: like, mode: "insensitive" } },
      ],
    },
    orderBy: { email: "asc" },
    take: exact ? SHARE_SEARCH_MAX - 1 : SHARE_SEARCH_MAX,
    select,
  });
  return ok([...(exact ? [exact] : []), ...rows].map((u) => ({ ...u, name: cleanName(u.name) })));
}

/** Penerima: tepat salah satu, userId (dari pemilih) atau email lengkap (diketik). */
const targetSchema = z
  .object({ userId: z.string().max(64).optional(), email: z.string().max(320).optional() })
  .strict()
  .transform((t) =>
    t.userId !== undefined && t.email === undefined
      ? { userId: t.userId }
      : t.email !== undefined && t.userId === undefined
        ? { email: t.email }
        : null,
  );

/**
 * Beri akses ke satu pengguna (dari pemilih: userId; atau email lengkap). Sudah punya akses → perannya
 * diganti (audit role), peran sama → tanpa perubahan. Pengguna tidak dikenal/nonaktif/belum verifikasi
 * atau pemilik sendiri → NOT_FOUND dengan pesan yang sama (bukan oracle keberadaan akun).
 */
export async function grantShare(
  userId: string,
  dashboardId: unknown,
  target: unknown,
  role: unknown,
  ip: string,
): Promise<Result<ShareState>> {
  const t = targetSchema.safeParse(target).data;
  if (!t) return fail("INVALID", "Pilih pengguna yang akan diberi akses.");
  if (!isRole(role)) return badRole();
  const who = "email" in t ? normalizeEmail(t.email) : isIdShape(t.userId) ? t.userId : null;
  if (!who) return userNotFound();
  const match: Prisma.UserWhereInput = "email" in t ? { email: who } : { id: who };
  const r = await ownerTx(userId, dashboardId, "grant", async (tx, id, d) => {
    const grantee = await tx.user.findFirst({
      where: { ...match, isActive: true, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!grantee || grantee.id === d.ownerId) return userNotFound();
    const key = { dashboardId_userId: { dashboardId: id, userId: grantee.id } };
    const existing = await tx.dashboardShare.findUnique({ where: key, select: { role: true } });
    if (existing?.role === role) return ok(null);
    if (existing) {
      await tx.dashboardShare.update({ where: key, data: { role }, select: { id: true } });
      await recordAudit(tx, {
        actorId: userId,
        action: "dashboard.share.role",
        targetType: "dashboard",
        targetId: id,
        meta: { userId: grantee.id, from: existing.role, to: role },
        ip,
      });
      return ok(null);
    }
    if ((await tx.dashboardShare.count({ where: { dashboardId: id } })) >= SHARES_PER_DASHBOARD) {
      return fail(
        "LIMIT_REACHED",
        `Batas ${SHARES_PER_DASHBOARD} orang per dashboard tercapai. Pertimbangkan berbagi ke seluruh organisasi.`,
      );
    }
    await tx.dashboardShare.create({
      data: { dashboardId: id, userId: grantee.id, role, createdById: userId },
      select: { id: true },
    });
    await recordAudit(tx, {
      actorId: userId,
      action: "dashboard.share.grant",
      targetType: "dashboard",
      targetId: id,
      meta: { userId: grantee.id, role },
      ip,
    });
    return ok(null);
  });
  return withState(r, dashboardId);
}

/** Ganti peran share yang sudah ada (akun nonaktif juga boleh diubah; tetap tidak berlaku). */
export async function setShareRole(
  userId: string,
  dashboardId: unknown,
  targetUserId: unknown,
  role: unknown,
  ip: string,
): Promise<Result<ShareState>> {
  if (!isRole(role)) return badRole();
  const noShare = <T>() => fail<T>("NOT_FOUND", "Pengguna ini belum punya akses ke dashboard ini.");
  if (!isIdShape(targetUserId)) return noShare();
  const target = targetUserId;
  const r = await ownerTx(userId, dashboardId, "role", async (tx, id) => {
    const key = { dashboardId_userId: { dashboardId: id, userId: target } };
    const existing = await tx.dashboardShare.findUnique({ where: key, select: { role: true } });
    if (!existing) return noShare();
    if (existing.role === role) return ok(null);
    await tx.dashboardShare.update({ where: key, data: { role }, select: { id: true } });
    await recordAudit(tx, {
      actorId: userId,
      action: "dashboard.share.role",
      targetType: "dashboard",
      targetId: id,
      meta: { userId: target, from: existing.role, to: role },
      ip,
    });
    return ok(null);
  });
  return withState(r, dashboardId);
}

/**
 * Cabut akses satu pengguna. Sudah tidak punya akses (klik ganda, tab lain) → berhasil tanpa audit.
 * Berlaku pada muatan data berikutnya: akses tidak pernah di-cache (AC4).
 */
export async function revokeShare(
  userId: string,
  dashboardId: unknown,
  targetUserId: unknown,
  ip: string,
): Promise<Result<ShareState>> {
  const target = isIdShape(targetUserId) ? targetUserId : null;
  const r = await ownerTx(userId, dashboardId, "revoke", async (tx, id) => {
    if (!target) return ok(null);
    const key = { dashboardId_userId: { dashboardId: id, userId: target } };
    const existing = await tx.dashboardShare.findUnique({ where: key, select: { role: true } });
    if (!existing) return ok(null);
    await tx.dashboardShare.delete({ where: key, select: { id: true } });
    await recordAudit(tx, {
      actorId: userId,
      action: "dashboard.share.revoke",
      targetType: "dashboard",
      targetId: id,
      meta: { userId: target, role: existing.role },
      ip,
    });
    return ok(null);
  });
  return withState(r, dashboardId);
}

/** Bagikan ke seluruh organisasi (semua pengguna aktif) sebagai VIEWER, atau matikan. */
export async function setOrgShare(
  userId: string,
  dashboardId: unknown,
  on: unknown,
  ip: string,
): Promise<Result<ShareState>> {
  if (typeof on !== "boolean") return fail("INVALID", "Permintaan tidak valid.");
  const r = await ownerTx(userId, dashboardId, "org", async (tx, id, d) => {
    if (d.orgShared === on) return ok(null);
    await tx.dashboard.update({ where: { id }, data: { orgShared: on }, select: { id: true } });
    await recordAudit(tx, {
      actorId: userId,
      action: "dashboard.org.share",
      targetType: "dashboard",
      targetId: id,
      meta: { on },
      ip,
    });
    return ok(null);
  });
  return withState(r, dashboardId);
}

/**
 * Audit "dashboard.open" (AC4/AC7) untuk SEMUA peran, termasuk pemilik: dipanggil dari render halaman
 * dashboard (bukan generateMetadata) setelah getDashboard memberi akses. Dedup per (user, dashboard)
 * 30 menit lewat Redis SET NX EX — muat ulang, ganti mode, dan revalidatePath tidak menambah baris.
 * Redis tidak tersedia → tetap ditulis (jejak lebih penting dari duplikat). Tidak pernah melempar:
 * kegagalan audit tidak boleh menggagalkan halaman (dicatat di log).
 */
export async function recordDashboardOpen(
  userId: string,
  dashboardId: string,
  role: DashboardAccessRole,
  ip: string,
): Promise<void> {
  const key = `audit:open:${userId}:${dashboardId}`;
  let claimed = false;
  try {
    const r = await redisReady();
    if ((await r.set(key, "1", "EX", OPEN_DEDUP_SEC, "NX")) !== "OK") return;
    claimed = true;
  } catch (e) {
    logger.warn(
      { userId, dashboardId, err: e instanceof Error ? e.message : String(e) },
      "dedup audit buka dashboard tidak tersedia; tetap dicatat",
    );
  }
  try {
    await recordAudit(prisma, {
      actorId: userId,
      action: "dashboard.open",
      targetType: "dashboard",
      targetId: dashboardId,
      meta: { role },
      ip,
    });
  } catch (e) {
    logger.error(
      { userId, dashboardId, err: e instanceof Error ? e.message : String(e) },
      "audit buka dashboard gagal",
    );
    // Kunci dedup dilepas agar pembukaan berikutnya tetap tercatat.
    if (claimed)
      await redisReady()
        .then((r) => r.del(key))
        .catch(() => {});
  }
}
