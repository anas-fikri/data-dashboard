/*
 * Jalur cache urutan "Lihat data" (T-062, P-30) untuk jendela terurut/dicari (jalur 2 grid):
 *  1. Permintaan jalur 2 yang dijawab tanpa cache menjadwalkan pembangunan permutasi `_row` di belakang
 *     (satu per proses, lewat gerbang grid dengan pengguna semu, tanpa sinyal permintaan): `COPY (SELECT
 *     _row … ORDER BY <urutan tampilan>) TO perm.parquet` — ORDER BY yang sama dengan jalur tanpa cache
 *     (kunci urut, `_period`, `_row` unik), jadi posisi = urutan tanpa cache.
 *  2. Blok berikutnya: posisi → potongan (chunkRows baris tampilan). Potongan yang belum ada diambil
 *     isinya dari sumber sekali (`_row IN` potongan permutasi, ±biaya satu blok tanpa cache) dan ditulis
 *     dalam urutan tampilan; blok di potongan yang sudah ada dibaca dengan `_pos BETWEEN` (milidetik).
 * Kunci memuat sheet + versi + revisi skema + file typed segmen (setelah pemilih periode) + urut +
 * saringan + cari, jadi entri tidak pernah dipakai untuk versi/revisi/tampilan lain. Nilai sel = ekspresi
 * keluaran grid yang sama (teks dipotong GRID_CELL_TEXT_MAX + penanda). Identifier hanya c<pos>, `_row`,
 * `_pos`; path berkas cache buatan program (hex), nilai lewat parameter.
 */
import { lit } from "@/lib/duckdb";
import { logger } from "@/lib/logger";
import { resultKey } from "./cache";
import { GRID_CELL_TEXT_MAX, gridOrderSql, gridWhereSql, type GridPlan } from "./grid";
import type { OrderCache, OrderChunk, OrderMeta } from "./order-cache";
import { runOnLocal, runOnParquet, type QueryDeps, type QueryFailure } from "./service";
import type { ParquetSource } from "./source";
import type { BuiltSql } from "./sql";

/** Dependensi cache urutan (GridDeps.order). */
export interface GridOrder {
  cache: OrderCache;
  /** Mesin untuk membangun permutasi di belakang: gerbang grid tanpa sinyal permintaan. */
  background: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs">;
  /** Tampilan dengan baris lebih sedikit dari ini tidak di-cache. */
  minRows?: number;
  /** Baris per potongan (uji); bawaan orderChunkRows(kolom terlihat). */
  chunkRows?: number;
}

/** Pengguna semu gerbang grid untuk pembangunan permutasi di belakang. */
export const ORDER_BUILD_USER = "grid-order-cache";
/** Permutasi gagal karena slot sibuk: dicoba lagi setelah jeda pendek ini. */
export const ORDER_BUSY_RETRY_MS = 30_000;
/** Tampilan kecil cukup dilayani jalur tanpa cache. */
export const ORDER_MIN_ROWS = 1_000;

/** Jalur 2 yang di-cache: ada urut atau cari (saring saja sudah ≤ 0,5 s, T-061). */
export const usesOrderCache = (plan: GridPlan) => plan.sort.length > 0 || plan.search !== null;

/**
 * Baris per potongan: ±1,5 jt sel per potongan (30 kolom → 50 rb baris ≈ 5 MB), minimal 5 rb. Biaya
 * mengambil satu potongan hampir sama dengan satu blok (didominasi dekompresi row group sumber).
 */
export function orderChunkRows(visibleCols: number): number {
  const cols = Math.max(1, Math.min(64, visibleCols));
  return Math.max(5_000, Math.min(50_000, Math.floor(1_500_000 / cols)));
}

/** Kunci entri: sheet + versi + revisi + file typed segmen + urut + saringan + cari + periode. */
export function orderKey(meta: OrderMeta, plan: GridPlan, period: string[]): string {
  return resultKey({
    datasetId: "grid-order",
    versionId: meta.versionId,
    sheetId: meta.sheetId,
    schemaRevision: meta.schemaRevision,
    spec: {
      files: meta.typedKeys,
      sort: plan.sort.map((s) => ({
        pos: s.col.pos,
        type: s.col.type,
        float: !!s.col.float,
        dir: s.dir,
      })),
      clauses: plan.clauses,
      search: plan.search && {
        text: plan.search.text,
        cols: plan.search.cols.map((c) => c.pos),
      },
      periodic: !!plan.periodic,
      period,
    },
  });
}

const cid = (pos: number) => `c${Math.trunc(pos)}`;

/** Permutasi: `_row` dalam urutan tampilan (posisi = file_row_number). */
export function buildOrderPermSql(plan: GridPlan, parquetPath: string, file: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const sql = [
    `COPY (`,
    `  SELECT _row FROM read_parquet($path)`,
    `  ${gridWhereSql(plan, params)}`,
    `  ORDER BY ${gridOrderSql(plan)}`,
    `) TO ${lit(file)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
  ].join("\n");
  return { sql, params };
}

/**
 * Isi potongan posisi [from, to]: kolom keluaran grid (teks dipotong + penanda k<pos>) diambil dari
 * sumber untuk `_row` potongan permutasi, ditulis urut `_pos`.
 */
export function buildOrderChunkSql(
  cols: Pick<GridPlan["cols"][number], "pos" | "type">[],
  parquetPath: string,
  perm: string,
  from: number,
  to: number,
  file: string,
): BuiltSql {
  const out = cols.flatMap((c) =>
    c.type === "text"
      ? [
          `left(s.${cid(c.pos)}, ${GRID_CELL_TEXT_MAX}) AS ${cid(c.pos)}`,
          `coalesce(length(s.${cid(c.pos)}) > ${GRID_CELL_TEXT_MAX}, false) AS k${Math.trunc(c.pos)}`,
        ]
      : [`s.${cid(c.pos)} AS ${cid(c.pos)}`],
  );
  const sql = [
    `COPY (`,
    `  WITH ids AS (`,
    `    SELECT _row, file_row_number AS _pos FROM read_parquet($perm, file_row_number = true)`,
    `    WHERE file_row_number BETWEEN $a AND $b`,
    `  )`,
    `  SELECT ids._pos AS _pos, CAST(s._row AS BIGINT) AS _row, ${out.join(", ")}`,
    `  FROM (SELECT _row, ${cols.map((c) => cid(c.pos)).join(", ")} FROM read_parquet($path)`,
    `        WHERE _row IN (SELECT _row FROM ids)) s`,
    `  JOIN ids ON s._row = ids._row`,
    `  ORDER BY ids._pos`,
    `) TO ${lit(file)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 2048)`,
  ].join("\n");
  return { sql, params: { path: parquetPath, perm, a: from, b: to } };
}

/** Blok dari satu potongan: urutan kolom keluaran = jalur tanpa cache (`_row`, v0, [k0], v1, …). */
export function buildOrderReadSql(
  cols: Pick<GridPlan["cols"][number], "pos" | "type">[],
  file: string,
  from: number,
  to: number,
): BuiltSql {
  const out = cols.flatMap((c, i) =>
    c.type === "text"
      ? [`${cid(c.pos)} AS v${i}`, `k${Math.trunc(c.pos)} AS k${i}`]
      : [`${cid(c.pos)} AS v${i}`],
  );
  return {
    sql: [
      `SELECT _row, ${out.join(", ")}`,
      `FROM read_parquet($file)`,
      `WHERE _pos BETWEEN $a AND $b`,
      `ORDER BY _pos`,
    ].join("\n"),
    params: { file, a: from, b: to },
  };
}

class ChunkFailed extends Error {
  constructor(readonly failure: QueryFailure) {
    super(failure.message);
    this.name = "ChunkFailed";
  }
}

export interface OrderWindow {
  ok: true;
  rows: unknown[][];
  filteredTotal: number;
  total: number;
}

/**
 * Jendela dari cache urutan: null = entri belum ada (pemanggil memakai jalur tanpa cache). Potongan yang
 * belum ada dibangun di permintaan ini (gerbang user + slot grid seperti blok biasa).
 */
export async function orderWindow(
  userId: string,
  key: string,
  plan: GridPlan,
  source: ParquetSource,
  order: GridOrder,
  deps: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs" | "signal">,
): Promise<OrderWindow | QueryFailure | null> {
  const { cache } = order;
  const e = cache.lookup(key);
  if (!e) return null;
  const release = cache.pin(e);
  const held: OrderChunk[] = [];
  try {
    const head = { ok: true as const, filteredTotal: e.rows, total: e.total };
    const end = Math.min(e.rows, plan.rowStart + plan.rowCount);
    if (plan.rowStart >= end) return { ...head, rows: [] };
    const C = e.chunkRows;
    const cols = plan.cols.map((c) => c.pos);
    const parts: { c: OrderChunk; from: number; to: number }[] = [];
    for (let k = Math.floor(plan.rowStart / C); k <= Math.floor((end - 1) / C); k++) {
      let c = cache.chunk(e, k, cols);
      // Single-flight: pekerjaan bersama berjalan di bawah gerbang/sinyal/batas waktu peminta pertama.
      // Bila gagal dan bukan pekerjaan kita sendiri (mis. peminta pertama membatalkan), kita mencoba
      // sekali lagi dengan gerbang dan sinyal kita sendiri (review T-062 M1).
      for (let attempt = 0; !c; attempt++) {
        let mine = false;
        try {
          c = await cache.buildChunk(e, k, cols, async (file) => {
            mine = true;
            const r = await runOnParquet(userId, source, deps, (path, exec) =>
              exec(
                buildOrderChunkSql(
                  plan.cols,
                  path,
                  e.perm,
                  k * C,
                  Math.min((k + 1) * C, e.rows) - 1,
                  file,
                ),
              ),
            );
            if (!r.ok) throw new ChunkFailed(r);
          });
        } catch (err) {
          if (!(err instanceof ChunkFailed)) throw err;
          if (mine || attempt > 0 || deps.signal?.aborted) return err.failure;
          continue;
        }
        // Entri dibuang selagi membangun (versi/revisi berganti, anggaran): jalur tanpa cache.
        if (!c) return null;
      }
      held.push(c);
      parts.push({ c, from: Math.max(plan.rowStart, k * C), to: Math.min(end, (k + 1) * C) - 1 });
    }
    const r = await runOnLocal(userId, deps, async (exec) => {
      const rows: unknown[][] = [];
      for (const p of parts) {
        rows.push(...(await exec(buildOrderReadSql(plan.cols, p.c.file, p.from, p.to))).rows);
      }
      return rows;
    });
    return r.ok ? { ...head, rows: r.value } : r;
  } finally {
    for (const c of held) cache.unpin(c);
    release();
  }
}

/**
 * Jadwalkan permutasi untuk tampilan ini di belakang (tidak ditunggu): tidak bila tampilan kecil, sudah
 * ada/sedang dibangun, atau permutasi lain sedang dibangun (satu per proses — CPU tetap untuk widget).
 * Gagal (sibuk/batas waktu/galat) → tidak ada entri; kunci itu dijeda (30 s sibuk, 5 menit lainnya).
 */
export function scheduleOrder(
  key: string,
  meta: OrderMeta,
  plan: GridPlan,
  source: ParquetSource,
  counts: { filteredTotal: number; total: number },
  chunkRows: number,
  order: GridOrder,
): Promise<unknown> | null {
  const { cache } = order;
  if (counts.filteredTotal < (order.minRows ?? ORDER_MIN_ROWS)) return null;
  if (cache.failed(key) || cache.pending(key) || cache.buildingPerm || cache.lookup(key))
    return null;
  return cache
    .buildPerm(key, meta, chunkRows, async (file) => {
      const r = await runOnParquet(ORDER_BUILD_USER, source, order.background, (path, exec) =>
        exec(buildOrderPermSql(plan, path, file)),
      );
      // Gagal → jeda sebelum dicoba lagi (review T-062 L5): sibuk sebentar, lainnya ORDER_FAIL_MS.
      if (!r.ok) {
        cache.markFailed(key, r.code === "QUERY_BUSY" ? ORDER_BUSY_RETRY_MS : undefined);
        return null;
      }
      const rows = Number(r.value.rows[0]?.[0]);
      // Data berubah di antara dua query tidak mungkin (file typed imutabel); jaga-jaga saja.
      if (!Number.isSafeInteger(rows) || rows !== counts.filteredTotal) {
        cache.markFailed(key);
        return null;
      }
      return { rows, total: counts.total };
    })
    .catch((err: unknown) => {
      logger.warn(
        { sheetId: meta.sheetId, versionId: meta.versionId, err: String(err) },
        "cache urutan grid gagal dibangun",
      );
      return null;
    });
}
