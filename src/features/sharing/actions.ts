"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { RULES, clientIp, hit, type RateLimitRule } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import * as service from "./service";
import type { ShareActionResult, ShareRole, ShareState, ShareUserOption } from "./types";

/*
 * Server Action dialog share (T-016). Urutan: sesi aktif + terverifikasi (tanpa sesi → NOT_FOUND, D2)
 * → rate limit per pengguna (RULES.share untuk perubahan, RULES.shareSearch untuk baca/cari) → service
 * (cek pemilik + lock + AuditLog). Tidak pernah melempar: error tak terduga → pesan umum, detail di log.
 * Redis mati: perubahan pemilik atas dashboard-nya tetap jalan (dicatat); pencarian pengguna DITOLAK
 * (penjelajahan direktori tanpa batas lebih berbahaya daripada pemilih yang sementara tidak tersedia).
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Dashboard tidak ditemukan." } as const;
const FAILED = {
  ok: false,
  code: "BUSY",
  message: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
} as const;

async function rateLimited(
  userId: string,
  rule: RateLimitRule,
  failClosed: boolean,
): Promise<ShareActionResult<never> | null> {
  try {
    const rl = await hit(await redisReady(), rule, userId);
    if (rl.allowed) return null;
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Terlalu banyak permintaan. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
    };
  } catch (e) {
    logger.warn(
      { userId, rule: rule.name, err: e instanceof Error ? e.message : String(e) },
      failClosed
        ? "rate limit berbagi tidak tersedia; permintaan ditolak"
        : "rate limit berbagi tidak tersedia; aksi dilanjutkan",
    );
    return failClosed ? FAILED : null;
  }
}

async function run<T>(
  action: string,
  opts: { rule: RateLimitRule; failClosed?: boolean; changes?: boolean },
  fn: (userId: string, ip: string) => Promise<ShareActionResult<T>>,
): Promise<ShareActionResult<T>> {
  try {
    const user = await requireUser("action");
    const r =
      (await rateLimited(user.id, opts.rule, opts.failClosed ?? false)) ??
      (await fn(user.id, clientIp(await headers(), env().TRUST_PROXY)));
    // Lencana akses di daftar dashboard pemilik ("Pribadi / n orang / Organisasi").
    if (r.ok && opts.changes) revalidatePath("/dashboards");
    return r;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) return NOT_FOUND;
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi berbagi gagal");
    return FAILED;
  }
}

const read = { rule: RULES.shareSearch };
const change = { rule: RULES.share, changes: true };

/** Isi dialog share: share organisasi, daftar orang + perannya, dan kedua peringatan. */
export async function listSharesAction(
  dashboardId: string,
): Promise<ShareActionResult<ShareState>> {
  return run("listShares", read, (userId) => service.listShares(userId, dashboardId));
}

/** Pemilih pengguna (per ketikan, di-debounce klien): ≥ 3 karakter, maks. 10. */
export async function searchShareUsersAction(
  dashboardId: string,
  q: string,
): Promise<ShareActionResult<ShareUserOption[]>> {
  return run("searchShareUsers", { ...read, failClosed: true }, (userId) =>
    service.searchShareUsers(userId, dashboardId, q),
  );
}

export async function grantShareAction(
  dashboardId: string,
  target: { userId?: string; email?: string },
  role: ShareRole,
): Promise<ShareActionResult<ShareState>> {
  return run("grantShare", change, (userId, ip) =>
    service.grantShare(userId, dashboardId, target, role, ip),
  );
}

export async function setShareRoleAction(
  dashboardId: string,
  userId: string,
  role: ShareRole,
): Promise<ShareActionResult<ShareState>> {
  return run("setShareRole", change, (actorId, ip) =>
    service.setShareRole(actorId, dashboardId, userId, role, ip),
  );
}

export async function revokeShareAction(
  dashboardId: string,
  userId: string,
): Promise<ShareActionResult<ShareState>> {
  return run("revokeShare", change, (actorId, ip) =>
    service.revokeShare(actorId, dashboardId, userId, ip),
  );
}

export async function setOrgShareAction(
  dashboardId: string,
  on: boolean,
): Promise<ShareActionResult<ShareState>> {
  return run("setOrgShare", change, (actorId, ip) =>
    service.setOrgShare(actorId, dashboardId, on, ip),
  );
}
