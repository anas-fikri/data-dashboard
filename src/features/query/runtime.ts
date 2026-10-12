import "server-only";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ColumnSchema } from "@/features/ingest/infer";
import { prisma } from "@/lib/db";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { env } from "@/lib/env";
import { downloadToFile, objectSize } from "@/lib/storage/files";
import { ResultCache } from "./cache";
import { registerLocalParquet } from "./local-parquet";
import type { CachedQuery, QueryDeps, QueryRepo } from "./service";

/*
 * Perakitan produksi query (T-009): satu cache parquet, satu mesin DuckDB, dan satu cache hasil per
 * proses aplikasi.
 */

/** Jeda sebelum mencoba lagi inisialisasi yang gagal (DuckDB tidak dibuat ulang per permintaan). */
const INIT_RETRY_MS = 10_000;

export const prismaQueryRepo: QueryRepo = {
  ownedDataset: (userId, datasetId) =>
    prisma.dataset.findFirst({
      where: { id: datasetId, ownerId: userId },
      select: { activeVersionId: true },
    }),
  async sheet(versionId, sheetId) {
    const s = await prisma.sheet.findFirst({
      where: { id: sheetId, versionId },
      select: { typedKey: true, schemaRevision: true, schema: true },
    });
    return s && { ...s, schema: (s.schema as unknown as ColumnSchema[] | null) ?? null };
  },
  async widget(userId, widgetId) {
    // Pemilik dataset saja untuk saat ini; non-pemilik lewat berbagi (T-016).
    const w = await prisma.widget.findFirst({
      where: { id: widgetId, dashboard: { dataset: { ownerId: userId } } },
      select: {
        type: true,
        spec: true,
        dashboard: { select: { datasetId: true, dataset: { select: { activeVersionId: true } } } },
      },
    });
    return (
      w && {
        type: w.type,
        spec: w.spec,
        datasetId: w.dashboard.datasetId,
        activeVersionId: w.dashboard.dataset.activeVersionId,
      }
    );
  },
};

interface Runtime {
  deps: QueryDeps;
}

const globalForQuery = globalThis as unknown as {
  queryRuntime?: Promise<Runtime>;
  queryInitFailedAt?: number;
};

async function build(): Promise<Runtime> {
  const e = env();
  const base = e.QUERY_CACHE_DIR ?? join(tmpdir(), "dd-query");
  const dataDir = join(base, "parquet");
  const parquet = new ParquetCache({
    dir: dataDir,
    maxBytes: e.MAX_LOCAL_PARQUET_BYTES,
    sizeOf: (key, signal) => objectSize(key, signal),
    download: async (key, dest, signal) => {
      await downloadToFile(key, dest, signal);
    },
    // Unduhan dibatasi terpisah dari slot query (review T-009 N2).
    maxDownloads: 2,
    perOwnerDownloads: 1,
  });
  registerLocalParquet(parquet);
  const engine = await QueryEngine.create({
    dataDir,
    tmpDir: join(base, "tmp"),
    memoryLimit: e.QUERY_MEMORY_LIMIT,
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: e.MAX_QUERY_CONCURRENCY,
    // Satu user tidak boleh memegang semua slot (review T-009 F2).
    perUser: Math.max(1, Math.floor(e.MAX_QUERY_CONCURRENCY / 2)),
    queueWaitMs: 10_000,
  });
  return {
    deps: {
      repo: prismaQueryRepo,
      parquet,
      engine,
      cache: new ResultCache<CachedQuery>(e.QUERY_RESULT_CACHE_BYTES),
      timeoutMs: e.QUERY_TIMEOUT_MS,
    },
  };
}

function runtime(): Promise<Runtime> {
  const failedAt = globalForQuery.queryInitFailedAt;
  if (!globalForQuery.queryRuntime && failedAt && Date.now() - failedAt < INIT_RETRY_MS) {
    return Promise.reject(new Error("mesin query belum siap"));
  }
  globalForQuery.queryRuntime ??= build().catch((err: unknown) => {
    globalForQuery.queryRuntime = undefined;
    globalForQuery.queryInitFailedAt = Date.now();
    throw err;
  });
  return globalForQuery.queryRuntime;
}

export async function queryDeps(): Promise<QueryDeps> {
  return (await runtime()).deps;
}
