import "server-only";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterSourcesFor } from "@/features/dashboards/service";
import type { ColumnSchema } from "@/features/ingest/infer";
import { prisma } from "@/lib/db";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { env } from "@/lib/env";
import { downloadToFile, objectSize } from "@/lib/storage/files";
import { ResultCache } from "./cache";
import { HistoryCache } from "./history-cache";
import { registerLocalParquet } from "./local-parquet";
import type { CachedQuery, FilterSource, QueryDeps, QueryRepo } from "./service";

/*
 * Perakitan produksi query (T-009): satu cache parquet, satu mesin DuckDB, dan satu cache hasil per
 * proses aplikasi.
 */

/** Jeda sebelum mencoba lagi inisialisasi yang gagal (DuckDB tidak dibuat ulang per permintaan). */
const INIT_RETRY_MS = 10_000;

type History = Awaited<ReturnType<NonNullable<QueryRepo["sheetHistory"]>>>;
const historyCache = new HistoryCache<History>({
  ttlMs: 30_000,
  maxEntries: 500,
  // Total kolom skema lama yang disimpan (skema bisa ribuan kolom per sheet).
  maxSize: 100_000,
  size: (h) => 1 + (h?.old.schema.length ?? 0),
});

/**
 * Sumber filter per dashboard (T-012: kolom filter + dimensi cross-filter beserta tipenya): dibaca
 * sekali untuk banyak query widget dalam satu muat dashboard. Kunci memuat versi aktif + updatedAt
 * dashboard (atur widget/kolom filter menaikkannya), jadi perubahan pemilik langsung berlaku; umur
 * pendek menutup sisanya (mis. kolom disembunyikan atau tipenya diubah — filter pada kolom tersembunyi
 * tetap dilewati widget).
 */
const filterSourceCache = new HistoryCache<FilterSource[]>({
  ttlMs: 30_000,
  maxEntries: 1_000,
  maxSize: 50_000,
  size: (sources) => 1 + sources.length,
});

async function loadSheetHistory(
  datasetId: string,
  activeVersionId: string,
  sheetId: string,
): Promise<History> {
  const old = await prisma.sheet.findFirst({
    where: { id: sheetId, version: { datasetId } },
    select: { id: true, name: true, index: true, schema: true, versionId: true },
  });
  if (!old) return null;
  // Sheet aktif tanpa skema (bisa ribuan kolom per sheet); skema target dibaca segar oleh query.
  const active = await prisma.sheet.findMany({
    where: { versionId: activeVersionId, typedKey: { not: null } },
    orderBy: { index: "asc" },
    select: { id: true, name: true, index: true },
  });
  const oldSheetCount = await prisma.sheet.count({ where: { versionId: old.versionId } });
  const schema = (old.schema as unknown as ColumnSchema[] | null) ?? [];
  return {
    old: { id: old.id, name: old.name, index: old.index, schema },
    oldSheetCount,
    active,
  };
}

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
  sheetHistory(datasetId, activeVersionId, sheetId) {
    // Widget lama dibaca berulang (tiap muat dashboard): skema lama + daftar sheet aktif di-cache sebentar.
    return historyCache.get(`${datasetId}:${activeVersionId}:${sheetId}`, () =>
      loadSheetHistory(datasetId, activeVersionId, sheetId),
    );
  },

  async widget(userId, widgetId) {
    // Pemilik dataset saja untuk saat ini; non-pemilik lewat berbagi (T-016).
    const w = await prisma.widget.findFirst({
      where: { id: widgetId, dashboard: { dataset: { ownerId: userId } } },
      select: {
        type: true,
        spec: true,
        missingColumns: true,
        dashboard: {
          select: {
            id: true,
            datasetId: true,
            filterColumns: true,
            updatedAt: true,
            dataset: { select: { activeVersionId: true } },
          },
        },
      },
    });
    return (
      w && {
        type: w.type,
        spec: w.spec,
        missingColumns: w.missingColumns,
        datasetId: w.dashboard.datasetId,
        activeVersionId: w.dashboard.dataset.activeVersionId,
        dashboardId: w.dashboard.id,
        filterColumns: w.dashboard.filterColumns,
        dashboardUpdatedAt: w.dashboard.updatedAt,
      }
    );
  },
  filterSources({ dashboardId, activeVersionId, updatedAt }) {
    return filterSourceCache.get(
      `${dashboardId}:${activeVersionId ?? "-"}:${updatedAt?.getTime() ?? 0}`,
      () => filterSourcesFor(dashboardId),
    );
  },
  async filterSource(userId, dashboardId) {
    // Pemilik dataset saja untuk saat ini (berbagi di T-016); lainnya null → 404.
    const d = await prisma.dashboard.findFirst({
      where: { id: dashboardId, dataset: { ownerId: userId } },
      select: {
        datasetId: true,
        filterColumns: true,
        dataset: { select: { activeVersionId: true } },
      },
    });
    if (!d) return null;
    const activeVersionId = d.dataset.activeVersionId;
    const sheets = activeVersionId
      ? await prisma.sheet.findMany({
          where: { versionId: activeVersionId, typedKey: { not: null } },
          orderBy: { index: "asc" },
          select: { id: true, name: true },
        })
      : [];
    return { datasetId: d.datasetId, activeVersionId, filterColumns: d.filterColumns, sheets };
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
  // Repo diambil dari modul saat ini, bukan dari runtime global yang dibuat sekali per proses:
  // setelah hot reload (dev) runtime lama tidak membawa method repo yang baru ditambahkan.
  return { ...(await runtime()).deps, repo: prismaQueryRepo };
}
