import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/features/uploads/http";
import { env } from "@/lib/env";
import { readTextLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { queryDeps } from "./runtime";
import { runQuery, type QueryCode } from "./service";
import { SPEC_MAX_BYTES } from "./spec";

/*
 * HTTP /api/query (T-009): Origin wajib sama dengan APP_URL (CSRF), body JSON ≤ 64 KB + amplop,
 * status per kode. Error tak terduga → 500 tanpa detail internal.
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
};
const BODY_MAX = SPEC_MAX_BYTES + 1024;
const noStore = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function runtimeQuery(req: NextRequest, userId: string): Promise<NextResponse> {
  if (!isSameOrigin(req, env().APP_URL)) {
    return json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
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
  try {
    const result = await runQuery(userId, body, await queryDeps());
    return result.ok ? json(result) : json(result, STATUS[result.code]);
  } catch (e) {
    logger.error({ userId, err: e instanceof Error ? e.message : String(e) }, "query gagal");
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
