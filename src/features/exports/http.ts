import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, hit, RULES } from "@/features/auth/rate-limit";
import { prismaQueryRepo } from "@/features/query/runtime";
import { SPEC_MAX_BYTES } from "@/features/query/spec";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { env } from "@/lib/env";
import { exportQueue, withQueueTimeout } from "@/lib/queue/connection";
import { redisReady } from "@/lib/redis";
import { presignExportGet } from "@/lib/storage/exports";
import { prismaExportRepo } from "./repo";
import {
  createExport,
  downloadExport,
  EXPORT_STATUS,
  exportStatus,
  type ExportDeps,
  type ExportFailure,
} from "./service";

/*
 * HTTP ekspor (T-017): POST /api/exports (Origin = APP_URL, sesi, rate limit + batas berjalan, body JSON
 * ≤ 64 KB) → 202 { ok, exportId }; GET /api/exports/[id] → status (pemilik saja); GET
 * /api/exports/[id]/download (rate limit per user) → 302 ke presigned GET (Referrer-Policy no-referrer)
 * atau 404/410/429 + Retry-After. Semua
 * no-store; galat tak terduga → 503 tanpa detail internal (withUser).
 */

const BODY_MAX = SPEC_MAX_BYTES + 1024;

function deps(): ExportDeps {
  return {
    repo: prismaExportRepo,
    query: { repo: prismaQueryRepo },
    enqueue: async (exportId) => {
      await withQueueTimeout(
        exportQueue().add("export", { exportId }, { jobId: exportId }),
        "enqueue ekspor",
      );
    },
    rateLimit: async (userId) => hit(await redisReady(), RULES.export, userId),
    downloadRateLimit: async (userId) => hit(await redisReady(), RULES.exportDownload, userId),
    presign: presignExportGet,
  };
}

const failed = (r: ExportFailure) =>
  json(r, EXPORT_STATUS[r.code], r.retryAfterSec ? { "Retry-After": String(r.retryAfterSec) } : {});

export function createExportRoute(req: NextRequest): Promise<NextResponse> {
  const cross = rejectCrossOrigin(req);
  if (cross) return Promise.resolve(cross);
  return withUser("ekspor gagal dibuat", async (userId) => {
    const read = await readJson(req, BODY_MAX, "Permintaan ekspor terlalu besar.");
    if ("response" in read) return read.response;
    const r = await createExport(userId, read.body, deps());
    return r.ok ? json(r, 202) : failed(r);
  });
}

export function exportStatusRoute(id: string): Promise<NextResponse> {
  return withUser("status ekspor gagal", async (userId) => {
    const r = await exportStatus(userId, id, deps());
    return r.ok ? json(r) : failed(r);
  });
}

export function exportDownloadRoute(req: NextRequest, id: string): Promise<NextResponse> {
  return withUser("unduh ekspor gagal", async (userId) => {
    const ip = clientIp(req.headers, env().TRUST_PROXY);
    const r = await downloadExport(userId, id, ip, deps());
    if (!r.ok) return failed(r);
    // Tautan bertanda tangan tidak boleh tersimpan di cache atau terkirim sebagai Referer.
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: r.url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
}
