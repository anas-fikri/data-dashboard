import "server-only";
import type { NextRequest } from "next/server";
import { hit, RULES } from "@/features/auth/rate-limit";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { canEditWhere } from "@/features/sharing/access";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { redisReady } from "@/lib/redis";
import { GRID_BODY_MAX } from "./grid";
import {
  runGridCell,
  runGridRows,
  type GridCode,
  type GridDeps,
  type GridRepo,
} from "./grid-service";
import { gridEngine } from "./grid-gate";
import { gridRuntime } from "./runtime";

/*
 * HTTP jendela baris "Lihat data" (T-041): POST /api/sheets/:id/rows dan GET /api/sheets/:id/cell.
 * Route Handler terpisah dari /api/query (otorisasi widget tidak tersentuh). Sesi wajib, Origin = APP_URL
 * untuk POST, rate limit per user (aturan grid sendiri, T-042), body ≤ 64 KB. Mesin lewat gerbang grid
 * (≤ 2 slot global, 2 in-flight per user); cache hasil hanya untuk count, bukan blok baris.
 * Error tak terduga → 503 tanpa detail (withUser).
 */

const STATUS: Record<GridCode, number> = {
  FORBIDDEN: 403,
  VERSION_CHANGED: 409,
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

/** Sheet + peran peminta pada dataset-nya: pemilik dataset, atau editor salah satu dashboard-nya. */
export const prismaGridRepo: GridRepo = {
  async sheet(userId, sheetId) {
    if (!isIdShape(sheetId)) return null;
    const s = await prisma.sheet.findUnique({
      where: { id: sheetId },
      select: {
        versionId: true,
        typedKey: true,
        rawKey: true,
        schemaRevision: true,
        schema: true,
        version: {
          select: {
            status: true,
            originalName: true,
            datasetId: true,
            dataset: { select: { ownerId: true, activeVersionId: true } },
          },
        },
        segments: {
          orderBy: { ordinal: "asc" },
          select: {
            segmentTyped: {
              select: {
                typedKey: true,
                legacyRow: true,
                columns: true,
                dataRows: true,
                segment: {
                  select: {
                    rowBase: true,
                    maxSrcRow: true,
                    rawKey: true,
                    colMap: true,
                    createdByVersion: { select: { originalName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!s) return null;
    const ds = s.version.dataset;
    let role: "OWNER" | "EDITOR" | null = ds.ownerId === userId ? "OWNER" : null;
    if (!role) {
      const d = await prisma.dashboard.findFirst({
        where: { datasetId: s.version.datasetId, ...canEditWhere(userId) },
        select: { id: true },
      });
      role = d ? "EDITOR" : null;
    }
    return {
      versionId: s.versionId,
      versionStatus: s.version.status,
      activeVersionId: ds.activeVersionId,
      role,
      typedKey: s.typedKey,
      rawKey: s.rawKey,
      fileName: s.version.originalName,
      schemaRevision: s.schemaRevision,
      schema: (s.schema as unknown as ColumnSchema[] | null) ?? null,
      segments: s.segments.map(({ segmentTyped: t }) => ({
        typedKey: t.typedKey,
        legacyRow: t.legacyRow,
        columns: t.columns,
        dataRows: t.dataRows,
        rowBase: Number(t.segment.rowBase),
        maxSrcRow: t.segment.maxSrcRow,
        rawKey: t.segment.rawKey,
        colMap: t.segment.colMap,
        fileName: t.segment.createdByVersion?.originalName ?? null,
      })),
    };
  },
};

async function gridDeps(signal: AbortSignal): Promise<GridDeps> {
  const { deps, gate } = await gridRuntime();
  const { repo: _r, engine, ...rest } = deps;
  return { ...rest, engine: gridEngine(engine, gate, signal), repo: prismaGridRepo, signal };
}

async function limited(userId: string) {
  const rl = await hit(await redisReady(), RULES.grid, userId);
  return rl.allowed
    ? null
    : json(
        {
          ok: false,
          code: "RATE_LIMITED",
          message: `Terlalu banyak permintaan data. Coba lagi dalam ${rl.retryAfterSec} detik.`,
        },
        429,
        { "Retry-After": String(rl.retryAfterSec) },
      );
}

export function gridRowsRoute(req: NextRequest, sheetId: string) {
  const cross = rejectCrossOrigin(req);
  if (cross) return Promise.resolve(cross);
  return withUser("jendela baris gagal", async (userId) => {
    const rl = await limited(userId);
    if (rl) return rl;
    const read = await readJson(req, GRID_BODY_MAX);
    if ("response" in read) return read.response;
    const r = await runGridRows(userId, sheetId, read.body, await gridDeps(req.signal));
    return r.ok ? json(r) : json(r, STATUS[r.code]);
  });
}

export function gridCellRoute(req: NextRequest, sheetId: string) {
  return withUser("isi sel gagal", async (userId) => {
    const rl = await limited(userId);
    if (rl) return rl;
    const p = req.nextUrl.searchParams;
    const r = await runGridCell(
      userId,
      sheetId,
      { versionId: p.get("versionId"), row: p.get("row"), pos: p.get("pos") },
      await gridDeps(req.signal),
    );
    return r.ok ? json(r) : json(r, STATUS[r.code]);
  });
}
