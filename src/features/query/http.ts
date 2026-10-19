import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { hit, RULES } from "@/features/auth/rate-limit";
import { isSameOrigin } from "@/features/uploads/http";
import { json as routeJson, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { redisReady } from "@/lib/redis";
import { appOrigins } from "@/lib/env";
import { readTextLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { runFilterValues } from "./filter-values";
import { queryDeps } from "./runtime";
import { runDashboardQuery, runQuery, runWidgetQuery, type QueryCode } from "./service";
import { SPEC_MAX_BYTES } from "./spec";

/*
 * HTTP /api/query (T-009, T-011, T-016): Origin wajib sama dengan APP_URL (CSRF), body JSON ≤ 64 KB +
 * amplop, status per kode. Tiga bentuk body (dipilih dari kunci, lalu divalidasi strict):
 * { widgetId, dashboardFilters?, page?, sort? } (widget dashboard: pemilik/editor/viewer),
 * { dashboardId, spec } (pratinjau editor: pemilik/editor dashboard), dan { datasetId, spec } (query
 * bebas: pemilik dataset saja). Tanpa akses → 404. Error tak terduga → 500 tanpa detail internal.
 */

const STATUS: Record<QueryCode, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  NOT_READY: 409,
  QUERY_BUSY: 429,
  QUERY_TOO_HEAVY: 422,
  RESULT_TOO_LARGE: 422,
  QUERY_TIMEOUT: 504,
  QUERY_FAILED: 500,
  COLUMN_UNAVAILABLE: 409,
  SHEET_UNAVAILABLE: 409,
};
const BODY_MAX = SPEC_MAX_BYTES + 1024;
const noStore = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function runtimeQuery(req: NextRequest, userId: string): Promise<NextResponse> {
  if (!isSameOrigin(req, appOrigins())) {
    return json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
  }
  const rl = await hit(await redisReady(), RULES.query, userId);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        message: `Terlalu banyak permintaan data. Coba lagi dalam ${rl.retryAfterSec} detik.`,
      },
      { status: 429, headers: { ...noStore, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const invalid = () =>
    json({ ok: false, code: "INVALID", message: "Permintaan tidak valid (JSON ≤ 64 KB)." }, 400);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return invalid();
  const text = await readTextLimited(req, BODY_MAX);
  if (text === null) return invalid();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalid();
  }
  const mode =
    !body || typeof body !== "object"
      ? "free"
      : "widgetId" in body
        ? "widget"
        : "dashboardId" in body
          ? "dashboard"
          : "free";
  try {
    // { widgetId, … } = widget dashboard (spec dari DB, T-011); { dashboardId, spec } = editor
    // (T-016); { datasetId, spec } = query bebas pemilik.
    const deps = await queryDeps();
    const result =
      mode === "widget"
        ? await runWidgetQuery(userId, body, deps)
        : mode === "dashboard"
          ? await runDashboardQuery(userId, body, deps)
          : await runQuery(userId, body, deps);
    return result.ok ? json(result) : json(result, STATUS[result.code]);
  } catch (e) {
    logger.error({ userId, mode, err: e instanceof Error ? e.message : String(e) }, "query gagal");
    return json(
      {
        ok: false,
        code: "QUERY_FAILED",
        message: "Query gagal diproses. Coba lagi beberapa saat lagi.",
      },
      500,
    );
  }
}

/** Body slicer kecil: nama kolom ≤ 200 + kata cari ≤ 100 (+ escape JSON). */
const FILTER_VALUES_BODY_MAX = 8 * 1024;

/**
 * POST /api/dashboards/[id]/filter-values (T-012): Origin = APP_URL, sesi, rate limit per user
 * (RULES.filterValues — terpisah dari query widget karena dipanggil per ketikan), body JSON kecil.
 * Error tak terduga → 503 tanpa detail; log hanya userId + pesan error (tanpa kolom/kata cari/nilai).
 */
export function filterValuesRoute(req: NextRequest, dashboardId: string): Promise<NextResponse> {
  const cross = rejectCrossOrigin(req);
  if (cross) return Promise.resolve(cross);
  return withUser("nilai filter gagal", async (userId) => {
    const rl = await hit(await redisReady(), RULES.filterValues, userId);
    if (!rl.allowed) {
      return routeJson(
        {
          ok: false,
          code: "RATE_LIMITED",
          message: `Terlalu banyak pencarian nilai filter. Coba lagi dalam ${rl.retryAfterSec} detik.`,
        },
        429,
        { "Retry-After": String(rl.retryAfterSec) },
      );
    }
    const read = await readJson(req, FILTER_VALUES_BODY_MAX);
    if ("response" in read) return read.response;
    const r = await runFilterValues(userId, dashboardId, read.body, await queryDeps(), req.signal);
    return r.ok ? routeJson(r) : routeJson(r, STATUS[r.code]);
  });
}
