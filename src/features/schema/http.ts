import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
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
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  return withUser("koreksi skema gagal", async (userId) => {
    const read = await readJson(
      req,
      RECAST_BODY_MAX,
      "Terlalu banyak perubahan sekaligus. Simpan sebagian dulu, lalu lanjutkan.",
    );
    if ("response" in read) return read.response;
    const r = await requestRecast(userId, sheetId, read.body, schemaDeps);
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
