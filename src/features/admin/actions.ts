"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { clientIp } from "@/features/auth/rate-limit";
import { createSession, type SessionUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { currentAdmin, rateLimited } from "./guard";
import * as service from "./service";
import type {
  AdminErrorCode as Code,
  AdminResult as Result,
  TransferSummary,
  TransferTarget,
} from "./types";

export type AdminErrorCode = Code;
export type AdminResult<T = null> = Result<T>;

/*
 * Server Action admin pengguna (T-019). Setiap aksi: requireAdmin("action") lebih dulu — non-admin,
 * tanpa sesi, atau sesi yang sudah dicabut → NOT_FOUND tanpa menyentuh data (D2, AC3/AC6) — lalu
 * rate limit per admin (hanya aksi yang mengubah data), lalu service (cek ulang peran pelaku +
 * AuditLog dalam satu transaksi).
 * Log keamanan (ASVS V7): penolakan akses → warn "aksi admin ditolak" { userId bila ada sesi, code,
 * action }, dibatasi per pengguna + aksi per menit (denial-log.ts); penolakan aturan
 * (LAST_ADMIN/FORBIDDEN/RATE_LIMITED) → info. Tanpa isi permintaan.
 */

const PATH = "/admin/pengguna";
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." } as const;

/** Kode penolakan aturan bisnis yang dicatat (info): jejak percobaan tanpa membanjiri warn. */
const RULE_REJECTIONS: ReadonlySet<Code> = new Set(["LAST_ADMIN", "FORBIDDEN", "RATE_LIMITED"]);

async function asAdmin<T>(
  action: string,
  run: (actor: SessionUser, ip: string) => Promise<AdminResult<T>>,
  opts: { rateLimit?: boolean } = {},
): Promise<AdminResult<T>> {
  try {
    const actor = await currentAdmin(action);
    if (!actor) return NOT_FOUND;
    const r =
      (opts.rateLimit === false ? null : await rateLimited(actor.id)) ??
      (await run(actor, clientIp(await headers(), env().TRUST_PROXY)));
    if (!r.ok && RULE_REJECTIONS.has(r.code)) {
      logger.info({ userId: actor.id, code: r.code, action }, "aksi admin ditolak aturan");
    }
    return r;
  } catch (e) {
    // Error tak terduga (DB mati, dll.): pesan umum ke klien, detail hanya di log.
    unstable_rethrow(e);
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi admin gagal");
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}

/**
 * Beri/cabut peran admin. Bila pelaku mencabut perannya sendiri (masih ada admin aktif lain), sesi
 * perangkat ini diterbitkan ulang (sessionVersion baru) dan halaman TIDAK di-revalidate: halaman admin
 * kini 404 untuknya, jadi UI yang mengarahkan keluar saat selfDemoted.
 */
export async function setUserAdminAction(
  userId: string,
  isAdmin: boolean,
): Promise<AdminResult<{ selfDemoted: boolean }>> {
  return asAdmin("setUserAdmin", async (actor, ip) => {
    const r = await service.setUserAdmin(actor, userId, isAdmin, ip);
    if (!r.ok) return r;
    if (r.data.selfDemoted) {
      await createSession({ id: actor.id, sessionVersion: r.data.sessionVersion });
    } else if (r.data.changed) {
      revalidatePath(PATH);
    }
    return { ok: true, data: { selfDemoted: r.data.selfDemoted } };
  });
}

/** Aktifkan/nonaktifkan. Nonaktif memutus semua sesi pengguna itu (sessionVersion naik). */
export async function setUserActiveAction(userId: string, isActive: boolean): Promise<AdminResult> {
  return asAdmin("setUserActive", async (actor, ip) => {
    const r = await service.setUserActive(actor, userId, isActive, ip);
    if (!r.ok) return r;
    if (r.data.changed) revalidatePath(PATH);
    return { ok: true, data: null };
  });
}

/** Alihkan semua dataset pengguna nonaktif ke pengguna aktif lain (dashboard ikut). */
export async function transferDatasetsAction(
  fromUserId: string,
  toUserId: string,
): Promise<AdminResult<TransferSummary>> {
  return asAdmin("transferDatasets", async (actor, ip) => {
    const r = await service.transferDatasets(actor, fromUserId, toUserId, ip);
    if (!r.ok) return r;
    revalidatePath(PATH);
    revalidatePath("/datasets");
    revalidatePath("/dashboards");
    return r;
  });
}

/**
 * Cari calon pemilik baru untuk dialog alih dataset (per ketikan, di-debounce klien): ≤ 20 pengguna
 * aktif + terverifikasi selain sumber, cocok email/nama; q kosong → 20 pertama urut email. Hanya baca,
 * jadi tidak memakai jatah rate limit perubahan admin.
 */
export async function searchTransferTargetsAction(
  fromUserId: string,
  q: string,
): Promise<AdminResult<TransferTarget[]>> {
  return asAdmin("searchTransferTargets", () => service.searchTransferTargets(fromUserId, q), {
    rateLimit: false,
  });
}
