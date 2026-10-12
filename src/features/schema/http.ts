import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser } from "@/features/auth/session";
import { isSameOrigin } from "@/features/uploads/http";
import { env } from "@/lib/env";
import { readTextLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { prismaSchemaRepo, schemaDeps } from "./runtime";
import { ingestStatus, recastStatus, requestRecast, type SchemaCode } from "./service";

/*
 * HTTP T-008: GET progres ingest dan status koreksi (polling, tanpa efek samping), POST koreksi skema
 * (Origin wajib = APP_URL, body JSON ≤ 900 KB). Antrean/DB tidak tersedia → 503 tanpa detail internal.
 */

const STATUS: Record<SchemaCode, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  NOT_READY: 409,
  STALE: 409,
  BUSY: 409,
  NO_CHANGE: 422,
  QUEUE_FULL: 429,
  RATE_LIMITED: 429,
};
/**
 * Ganti nama 2.048 kolom × 120 karakter ≈ 290 KB (ASCII), lebih untuk huruf non-Latin (review T-008
 * L6); tetap di bawah buffer proxy 1 MB (next.config.ts).
 */
const RECAST_BODY_MAX = 900 * 1024;
const noStore = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...noStore, ...headers } });

async function withUser(
  label: string,
  fn: (userId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser("action")).id;
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  try {
    return await fn(userId);
  } catch (e) {
    logger.error({ userId, err: e instanceof Error ? e.message : String(e) }, label);
    return json(
      {
        ok: false,
        code: "UNAVAILABLE",
        message: "Layanan sedang tidak tersedia. Coba lagi beberapa saat lagi.",
      },
      503,
    );
  }
}

export function progressRoute(datasetId: string): Promise<NextResponse> {
  return withUser("progres ingest gagal", async (userId) => {
    const s = await ingestStatus(userId, datasetId, prismaSchemaRepo);
    if (s === null) {
      return json({ ok: false, code: "NOT_FOUND", message: "Dataset tidak ditemukan." }, 404);
    }
    return json({ ok: true, status: s === "none" ? null : s });
  });
}

export async function recastRoute(req: NextRequest, sheetId: string): Promise<NextResponse> {
  if (!isSameOrigin(req, env().APP_URL)) {
    return json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
  }
  return withUser("koreksi skema gagal", async (userId) => {
    const invalid = () =>
      json({ ok: false, code: "INVALID", message: "Permintaan tidak valid." }, 400);
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return invalid();
    const text = await readTextLimited(req, RECAST_BODY_MAX);
    if (text === null) {
      return json(
        {
          ok: false,
          code: "TOO_LARGE",
          message: "Terlalu banyak perubahan sekaligus. Simpan sebagian dulu, lalu lanjutkan.",
        },
        413,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return invalid();
    }
    const r = await requestRecast(userId, sheetId, body, schemaDeps);
    // Nama/sembunyikan langsung diterapkan (200); perubahan tipe/format/baris judul antre (202).
    if (r.ok) return json(r, "applied" in r ? 200 : 202);
    return json(
      r,
      STATUS[r.code],
      r.retryAfterSec ? { "Retry-After": String(r.retryAfterSec) } : {},
    );
  });
}

export function recastStatusRoute(sheetId: string, jobId: string): Promise<NextResponse> {
  return withUser("status koreksi skema gagal", async (userId) => {
    const r = await recastStatus(userId, sheetId, jobId, schemaDeps);
    return r.ok ? json(r) : json(r, STATUS[r.code]);
  });
}
