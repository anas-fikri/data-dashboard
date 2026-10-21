import "server-only";
import { join } from "node:path";
import { filterSourcesFor } from "@/features/dashboards/service";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isoDay } from "@/features/ingest/period";
import { canViewWhere, dashboardAccess, roleOf, roleSelect } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import { QueryEngine } from "@/lib/duckdb/engine";
import { env } from "@/lib/env";
import { ResultCache } from "./cache";
import { GridGate, gridEngine } from "./grid-gate";
import type { GridOrder } from "./grid-order";
import { HistoryCache } from "./history-cache";
import { localParquetCache, queryCacheBase, registerOrderCache } from "./local-parquet";
import { ORDER_CACHE_TTL_MS, OrderCache } from "./order-cache";
import { withPeriodColumn } from "./period-column";
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
 * dashboard (atur widget/kolom filter menaikkannya) + jumlah schemaRevision sheet aktif (sembunyikan /
 * ubah tipe kolom menaikkannya), jadi perubahan pemilik langsung berlaku; umur pendek menutup sisanya.
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
    select: { id: true, name: true, aliasName: true, index: true, schema: true, versionId: true },
  });
  if (!old) return null;
  // Sheet aktif tanpa skema (bisa ribuan kolom per sheet); skema target dibaca segar oleh query.
  const active = await prisma.sheet.findMany({
    where: { versionId: activeVersionId, typedKey: { not: null } },
    orderBy: { index: "asc" },
    select: { id: true, name: true, aliasName: true, index: true },
  });
  const oldSheetCount = await prisma.sheet.count({ where: { versionId: old.versionId } });
  const schema = (old.schema as unknown as ColumnSchema[] | null) ?? [];
  return {
    old: { id: old.id, name: old.name, aliasName: old.aliasName, index: old.index, schema },
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
      select: {
        typedKey: true,
        schemaRevision: true,
        schema: true,
        periodSource: true,
        periodColumn: true,
        version: { select: { periodGrain: true } },
        // Manifest segmen (ADR-0008, T-037): sumber query = daftar file typed urut ordinal.
        segments: {
          orderBy: { ordinal: "asc" },
          select: {
            segmentTyped: {
              select: {
                typedKey: true,
                legacyRow: true,
                columns: true,
                segment: {
                  select: { periodKey: true, periodStart: true, minDate: true, maxDate: true },
                },
              },
            },
          },
        },
      },
    });
    if (!s) return null;
    // Sheet periode (T-058): kolom sistem Periode + periode tiap segmen (pemangkasan). min/max hanya
    // untuk sumber KOLOM — di sheet berlabel itu rentang kolom tanggal acuan (T-054).
    const grain = s.version.periodGrain;
    const periodic = !!grain && !!s.periodSource && s.segments.length > 0;
    const column = s.periodSource === "COLUMN" ? (s.periodColumn ?? null) : null;
    const time = (d: Date | null) => (d && column !== null ? d.toISOString().slice(0, 19) : null);
    const segments = s.segments.map(({ segmentTyped: { segment: g, ...t } }) => {
      const start = isoDay(g.periodStart);
      return periodic && g.periodKey && start
        ? { ...t, period: { key: g.periodKey, start, min: time(g.minDate), max: time(g.maxDate) } }
        : t;
    });
    const latest = segments.reduce<string | null>(
      (m, f) => ("period" in f && f.period && (!m || f.period.start > m) ? f.period.start : m),
      null,
    );
    const schema = (s.schema as unknown as ColumnSchema[] | null) ?? null;
    return {
      typedKey: s.typedKey,
      schemaRevision: s.schemaRevision,
      schema: periodic
        ? withPeriodColumn(schema, { grain, source: s.periodSource, latest })
        : schema,
      segments,
      period: periodic ? { column } : null,
    };
  },
  sheetHistory(datasetId, activeVersionId, sheetId) {
    // Widget lama dibaca berulang (tiap muat dashboard): skema lama + daftar sheet aktif di-cache sebentar.
    return historyCache.get(`${datasetId}:${activeVersionId}:${sheetId}`, () =>
      loadSheetHistory(datasetId, activeVersionId, sheetId),
    );
  },

  async widget(userId, widgetId) {
    // Akses per DASHBOARD widget ini (T-016): pemilik, share user, atau share organisasi — tidak
    // pernah lewat dataset (widget dashboard lain yang tidak dibagikan tetap 404). Peran dihitung di
    // query yang sama dan tidak di-cache: pencabutan berlaku pada muatan berikutnya.
    const w = await prisma.widget.findFirst({
      where: { id: widgetId, dashboard: canViewWhere(userId) },
      select: {
        type: true,
        spec: true,
        updatedAt: true,
        missingColumns: true,
        dashboard: {
          select: {
            id: true,
            datasetId: true,
            filterColumns: true,
            updatedAt: true,
            ...roleSelect(userId),
            dataset: {
              select: {
                ownerId: true,
                activeVersionId: true,
                activeVersion: { select: { sheets: { select: { schemaRevision: true } } } },
              },
            },
          },
        },
      },
    });
    const role = w && roleOf(userId, w.dashboard);
    return (
      w &&
      role && {
        type: w.type,
        spec: w.spec,
        updatedAt: w.updatedAt,
        missingColumns: w.missingColumns,
        datasetId: w.dashboard.datasetId,
        activeVersionId: w.dashboard.dataset.activeVersionId,
        dashboardId: w.dashboard.id,
        filterColumns: w.dashboard.filterColumns,
        dashboardUpdatedAt: w.dashboard.updatedAt,
        schemaStamp: (w.dashboard.dataset.activeVersion?.sheets ?? []).reduce(
          (sum, s) => sum + s.schemaRevision,
          0,
        ),
        role,
      }
    );
  },
  filterSources({ dashboardId, activeVersionId, updatedAt, schemaStamp }) {
    return filterSourceCache.get(
      `${dashboardId}:${activeVersionId ?? "-"}:${updatedAt?.getTime() ?? 0}:${schemaStamp ?? 0}`,
      () => filterSourcesFor(dashboardId),
    );
  },
  async filterSource(userId, dashboardId) {
    // Slicer untuk semua peran yang boleh melihat dashboard (T-016); lainnya null → 404. Tanpa cache.
    // Peran dihitung di query yang sama (pesan kolom tidak tersedia per peran, review T-016 R3 SEC-1).
    const d = await prisma.dashboard.findFirst({
      where: { id: dashboardId, ...canViewWhere(userId) },
      select: {
        ...roleSelect(userId),
        datasetId: true,
        filterColumns: true,
        dataset: { select: { ownerId: true, activeVersionId: true } },
      },
    });
    const role = d && roleOf(userId, d);
    if (!d || !role) return null;
    const activeVersionId = d.dataset.activeVersionId;
    const sheets = activeVersionId
      ? await prisma.sheet.findMany({
          where: { versionId: activeVersionId, typedKey: { not: null } },
          orderBy: { index: "asc" },
          select: { id: true, name: true },
        })
      : [];
    return {
      datasetId: d.datasetId,
      activeVersionId,
      filterColumns: d.filterColumns,
      sheets,
      role,
    };
  },
  // Mode { dashboardId, spec } (T-016): service yang memutuskan peran mana yang boleh.
  dashboardAccess,
};

interface Runtime {
  deps: QueryDeps;
  /** Gerbang grid "Lihat data" (T-042): slot global terpisah dari widget, in-flight per user. */
  gridGate: GridGate;
  /** Cache urutan "Lihat data" (T-062); tidak ada = mati (atau runtime sebelum hot reload). */
  order?: GridOrder;
}

const globalForQuery = globalThis as unknown as {
  queryRuntime?: Promise<Runtime>;
  queryInitFailedAt?: number;
};

async function build(): Promise<Runtime> {
  const e = env();
  // Cache dibagi dengan pemanasan versi aktif (T-pvq8): bisa sudah dibuat sebelum mesin query.
  const parquet = localParquetCache();
  const orderDir = join(queryCacheBase(), "order");
  const engine = await QueryEngine.create({
    dataDir: parquet.dir,
    tmpDir: join(queryCacheBase(), "tmp"),
    extraDirs: [orderDir],
    memoryLimit: e.QUERY_MEMORY_LIMIT,
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: e.MAX_QUERY_CONCURRENCY,
    // Satu user tidak boleh memegang semua slot (review T-009 F2).
    perUser: Math.max(1, Math.floor(e.MAX_QUERY_CONCURRENCY / 2)),
    queueWaitMs: 10_000,
  });
  const deps: QueryDeps = {
    repo: prismaQueryRepo,
    parquet,
    engine,
    cache: new ResultCache<CachedQuery>(e.QUERY_RESULT_CACHE_BYTES),
    timeoutMs: e.QUERY_TIMEOUT_MS,
  };
  const gridGate = newGridGate(e);
  return { deps, gridGate, order: newOrder(e, orderDir, deps, gridGate) };
}

/**
 * Cache urutan (T-062): berkas di QUERY_CACHE_DIR/order (subdirektori per proses, sisa proses mati dibersihkan). Permutasi
 * dibangun di belakang lewat gerbang grid yang sama (slot grid → widget tetap kebagian) tanpa sinyal
 * permintaan; entri kedaluwarsa disapu tiap menit.
 */
function newOrder(
  e: ReturnType<typeof env>,
  dir: string,
  deps: QueryDeps,
  gate: GridGate,
): GridOrder | undefined {
  if (e.GRID_ORDER_CACHE_BYTES <= 0) return undefined;
  const cache = new OrderCache({
    dir,
    maxBytes: e.GRID_ORDER_CACHE_BYTES,
    ttlMs: ORDER_CACHE_TTL_MS,
  });
  registerOrderCache(cache);
  setInterval(() => cache.sweep(), 60_000).unref();
  const { parquet, engine, timeoutMs } = deps;
  return { cache, background: { parquet, engine: gridEngine(engine, gate), timeoutMs } };
}

function newGridGate(e: ReturnType<typeof env>): GridGate {
  return new GridGate({
    // Widget kebagian ≥ 1 slot global bila MAX_QUERY_CONCURRENCY ≥ 2 (dengan 1 slot, grid bisa
    // memegangnya — konfigurasi produksi 4).
    maxGlobal: Math.max(1, Math.min(e.GRID_MAX_CONCURRENCY, e.MAX_QUERY_CONCURRENCY - 1)),
    perUser: 2,
    queueWaitMs: 10_000,
  });
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

/** Dependensi query + gerbang grid (T-042) untuk route "Lihat data". */
export async function gridRuntime(): Promise<{
  deps: QueryDeps;
  gate: GridGate;
  order: GridOrder | null;
}> {
  const r = await runtime();
  // Runtime yang dibuat sebelum hot reload (dev) belum punya gridGate (review T-042 L2).
  r.gridGate ??= newGridGate(env());
  return { deps: { ...r.deps, repo: prismaQueryRepo }, gate: r.gridGate, order: r.order ?? null };
}
