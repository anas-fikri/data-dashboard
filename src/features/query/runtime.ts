import "server-only";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ColumnSchema } from "@/features/ingest/infer";
import { prisma } from "@/lib/db";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { env } from "@/lib/env";
import { redisReady } from "@/lib/redis";
import { downloadToFile } from "@/lib/storage/files";
import type { ResultStore } from "./cache";
import type { QueryDeps, QueryRepo } from "./service";

/*
 * Perakitan produksi query (T-009): satu cache parquet + satu mesin DuckDB per proses aplikasi.
 */

/** Query bersamaan per user (selain batas global MAX_QUERY_CONCURRENCY). */
const PER_USER = 4;

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
};

/** Cache hasil di Redis; Redis tidak tersedia → tanpa cache (query tetap jalan). */
const redisStore: ResultStore = {
  get: async (key) => (await redisReady()).get(key),
  set: async (key, value, ex, ttl) => (await redisReady()).set(key, value, ex, ttl),
};

const globalForQuery = globalThis as unknown as { queryDeps?: Promise<QueryDeps> };

export function queryDeps(): Promise<QueryDeps> {
  globalForQuery.queryDeps ??= (async () => {
    const e = env();
    const base = e.QUERY_CACHE_DIR ?? join(tmpdir(), "dd-query");
    const dataDir = join(base, "parquet");
    const parquet = new ParquetCache(dataDir, e.MAX_LOCAL_PARQUET_BYTES, async (key, dest) => {
      await downloadToFile(key, dest);
    });
    const engine = await QueryEngine.create({
      dataDir,
      tmpDir: join(base, "tmp"),
      memoryLimit: e.QUERY_MEMORY_LIMIT,
      threads: 2,
      maxTempSize: "4GB",
      maxConcurrency: e.MAX_QUERY_CONCURRENCY,
      perUser: PER_USER,
      queueWaitMs: 10_000,
    });
    return {
      repo: prismaQueryRepo,
      parquet,
      engine,
      cache: redisStore,
      timeoutMs: e.QUERY_TIMEOUT_MS,
    };
  })().catch((err: unknown) => {
    globalForQuery.queryDeps = undefined; // coba lagi pada permintaan berikutnya
    throw err;
  });
  return globalForQuery.queryDeps;
}
