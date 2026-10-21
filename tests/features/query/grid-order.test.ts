import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { RowsBody } from "@/features/query/grid";
import { orderChunkRows, ORDER_MIN_ROWS, type GridOrder } from "@/features/query/grid-order";
import {
  byPeriod,
  runGridRows,
  type GridDeps,
  type GridRows,
  type GridSegment,
  type GridSheet,
} from "@/features/query/grid-service";
import { OrderCache } from "@/features/query/order-cache";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-062 (P-30): cache urutan "Lihat data". Properti: untuk urut/saring/cari acak dan jendela acak
 * (termasuk yang melintasi batas potongan dan ujung hasil), jawaban lewat cache = jawaban jalur tanpa cache
 * (baris, nomor, `_row`, sel, penanda potong, total). AC2: entri versi/revisi lama dibuang dan tidak
 * pernah dipakai untuk versi lain. DuckDB sungguhan, data kecil dengan seri, NULL, huruf besar/kecil,
 * aksen, teks > 500 karakter, skema campuran antar segmen.
 */
const SHEET = "cmv4kljx40009oczvdgrdord1";
const VER = "cmv4kljx40009oczvdgrdorv1";
const VER2 = "cmv4kljx40009oczvdgrdorv2";
const OWNER = "cmv4kljx40009oczvdgrdorow";

const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Kota", "text"),
  col(2, "Jumlah", "integer"),
  col(3, "Tanggal", "date"),
  col(4, "Nilai", "decimal"),
  col(5, "Catatan", "text"),
];

/** Manifest urut unggah (Maret sebelum Februari); Februari tanpa c3 (skema campuran). */
const SEGS = [
  { m: "01", rows: 260, rowBase: 1000, c3: true },
  { m: "03", rows: 230, rowBase: 2000, c3: true },
  { m: "02", rows: 190, rowBase: 3000, c3: false },
];
const ALL = SEGS.reduce((n, s) => n + s.rows, 0);

let root: string;
let engine: QueryEngine;
const manifest: GridSegment[] = [];
const sqlLog: string[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-grid-order-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  for (const s of SEGS) {
    const c3 = s.c3 ? `, DATE '2026-${s.m}-01' + CAST(hash(i, 3) % 9 AS INTEGER) AS c3` : "";
    // Kota: seri banyak, beda huruf besar/kecil dan aksen (collation nocase.noaccent), NULL.
    await c.run(
      `COPY (SELECT (${s.rowBase} + i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row,
                    DATE '2026-${s.m}-01' AS _period,
                    CASE WHEN hash(i, 1) % 11 = 0 THEN NULL
                         ELSE ['Bandung', 'bandung', 'Bándung', 'Medan', 'MEDAN', 'Ciamis', 'cirebon']
                              [1 + CAST(hash(i, 1) % 7 AS INTEGER)] END AS c1,
                    CASE WHEN hash(i, 2) % 13 = 0 THEN NULL ELSE CAST(hash(i, 2) % 25 AS BIGINT) END AS c2
                    ${c3},
                    CAST((hash(i, 4) % 100000) / 100.0 AS DECIMAL(38,6)) AS c4,
                    CASE WHEN hash(i, 5) % 17 = 0 THEN repeat('x', 600 + CAST(hash(i, 5) % 9 AS INTEGER))
                         ELSE 'catatan ' || CAST(hash(i, 5) % 40 AS VARCHAR) END AS c5
             FROM range(${s.rows}) t(i) ORDER BY i)
       TO '${join(root, `typed-${s.m}.parquet`)}' (FORMAT parquet)`,
    );
    manifest.push({
      typedKey: `typed-${s.m}.parquet`,
      legacyRow: false,
      columns: s.c3 ? [1, 2, 3, 4, 5] : [1, 2, 4, 5],
      dataRows: s.rows,
      rowBase: s.rowBase,
      maxSrcRow: s.rows + 1,
      rawKey: `raw-${s.m}.parquet`,
      colMap: [],
      fileName: `periode-${s.m}.xlsx`,
      period: { key: `2026-${s.m}`, start: `2026-${s.m}-01`, min: null, max: null },
    });
  }
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    extraDirs: [join(root, "order")],
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "1GB",
    maxConcurrency: 4,
    perUser: 4,
    queueWaitMs: 5_000,
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function sheet(over: Partial<GridSheet> = {}): GridSheet {
  return {
    versionId: VER,
    versionStatus: "READY",
    activeVersionId: VER,
    role: "OWNER",
    typedKey: "typed-01.parquet",
    rawKey: "raw-01.parquet",
    fileName: null,
    schemaRevision: 1,
    schema: SCHEMA,
    segments: byPeriod(manifest),
    period: { column: null, grain: "MONTH" },
    ...over,
  };
}

const parquet = () =>
  new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });

const logged: GridDeps["engine"] = {
  withSlot: (u, fn) => engine.withSlot(u, fn),
  exec: (sql, params, ms, signal) => {
    sqlLog.push(sql);
    return engine.exec(sql, params, ms, signal);
  },
};

function deps(s: () => GridSheet = () => sheet(), order: GridOrder | null = null): GridDeps {
  const p = parquet();
  return {
    repo: { sheet: async (userId) => (userId === OWNER ? s() : null) },
    parquet: { acquire: (key, opts) => p.acquire(key, opts) },
    engine: logged,
    timeoutMs: 30_000,
    now: () => new Date("2026-03-15T03:00:00Z"),
    order,
  };
}

function newOrder(chunkRows = 37): GridOrder {
  const cache = new OrderCache({ dir: join(root, "order"), maxBytes: 1 << 30, ttlMs: 60_000 });
  const p = parquet();
  return {
    cache,
    background: { parquet: { acquire: (k, o) => p.acquire(k, o) }, engine, timeoutMs: 30_000 },
    minRows: 1,
    chunkRows,
  };
}

const body = (over: Partial<RowsBody> = {}): RowsBody => ({
  versionId: VER,
  rowStart: 0,
  rowCount: 50,
  cols: [1, 2, 3, 4, 5],
  ...over,
});

async function rows(b: RowsBody, d: GridDeps): Promise<GridRows> {
  const r = await runGridRows(OWNER, SHEET, b, d);
  if (!r.ok) throw new Error(`${r.code} ${r.message}`);
  return r;
}

/** PRNG deterministik (mulberry32): kasus acak bisa diulang. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type View = Pick<RowsBody, "sort" | "filters" | "search" | "period">;

function randomView(rand: () => number): View {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const keys = [1, 2, 3, 4, 5].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 3));
  const view: View = { sort: keys.map((pos) => ({ pos, dir: pick(["asc", "desc"] as const) })) };
  const f = rand();
  if (f < 0.25) view.filters = [{ pos: 2, op: "range", gte: 3, lte: 18 }];
  else if (f < 0.4) view.filters = [{ pos: 1, op: "in", values: ["Bandung", "Medan"] }];
  if (rand() < 0.2) view.search = { text: pick(["an", "catatan 1", "x"]), cols: [1, 5] };
  if (rand() < 0.15) view.period = pick([["2026-02"], ["2026-01", "2026-03"]]);
  return view;
}

describe("T-062 AC1: cache urutan memberi baris yang sama dengan jalur tanpa cache (properti)", () => {
  it("30 tampilan acak × jendela acak, lintas batas potongan dan ujung hasil", async () => {
    const rand = prng(62);
    const plain = deps();
    for (let n = 0; n < 30; n++) {
      const view = randomView(rand);
      const order = newOrder(17 + Math.floor(rand() * 40));
      const cached = deps(undefined, order);
      // Permintaan pertama: jalur tanpa cache + permutasi dijadwalkan di belakang.
      const first = await rows(body({ ...view }), cached);
      expect(first).toEqual(await rows(body({ ...view }), plain));
      await order.cache.idle();
      expect(order.cache.size).toBe(first.filteredTotal >= 1 ? 1 : 0);
      const total = first.filteredTotal;
      const chunk = order.chunkRows!;
      const starts = [
        0,
        chunk - 3,
        chunk * 2 - 1,
        Math.max(0, total - 5),
        total,
        total + 10,
        ...Array.from({ length: 4 }, () => Math.floor(rand() * (total + 1))),
      ];
      for (const rowStart of starts) {
        const rowCount = 1 + Math.floor(rand() * 80);
        const b = body({ ...view, rowStart, rowCount });
        sqlLog.length = 0;
        const got = await rows(b, cached);
        const viaCache = sqlLog.some((s) => s.includes("_pos BETWEEN"));
        expect(viaCache || rowStart >= total).toBe(true);
        expect(got, JSON.stringify({ view, rowStart, rowCount })).toEqual(await rows(b, plain));
      }
      order.cache.clear();
    }
  }, 120_000);

  it("kolom diminta berganti: potongan dengan kolom lebih banyak dipakai ulang, kolom baru diambil", async () => {
    const order = newOrder(40);
    const cached = deps(undefined, order);
    const view = { sort: [{ pos: 1, dir: "asc" as const }] };
    await rows(body(view), cached);
    await order.cache.idle();
    await rows(body({ ...view, rowStart: 45 }), cached);
    sqlLog.length = 0;
    const sub = body({ ...view, rowStart: 50, cols: [5, 2] });
    expect(await rows(sub, cached)).toEqual(await rows(sub, deps()));
    expect(sqlLog.some((s) => s.startsWith("COPY"))).toBe(false);
    order.cache.clear();
  });

  it("sheet non-periode satu file (sumber kunci typed polos)", async () => {
    const one = () => sheet({ segments: [{ ...manifest[0]!, period: undefined }], period: null });
    const order = newOrder(23);
    const cached = deps(one, order);
    const view = {
      sort: [
        { pos: 4, dir: "desc" as const },
        { pos: 1, dir: "asc" as const },
      ],
    };
    await rows(body(view), cached);
    await order.cache.idle();
    for (const rowStart of [0, 22, 100, 250]) {
      const b = body({ ...view, rowStart, rowCount: 30 });
      expect(await rows(b, cached)).toEqual(await rows(b, deps(one)));
    }
    order.cache.clear();
  });

  it("M1: peminta pertama membatalkan potongan bersama → penunggu mencoba lagi dengan gerbangnya sendiri", async () => {
    const order = newOrder(40);
    const view = { sort: [{ pos: 5, dir: "asc" as const }] };
    await rows(body(view), deps(undefined, order));
    await order.cache.idle();
    let hold!: () => void;
    const held = new Promise<void>((r) => (hold = r));
    let started!: () => void;
    const copyStarted = new Promise<void>((r) => (started = r));
    let copies = 0;
    const gated: GridDeps["engine"] = {
      withSlot: (u, fn) => engine.withSlot(u, fn),
      exec: async (sql, params, ms, signal) => {
        if (sql.startsWith("COPY") && copies++ === 0) {
          started();
          await held;
        }
        return engine.exec(sql, params, ms, signal);
      },
    };
    const ctl = new AbortController();
    const a = runGridRows(OWNER, SHEET, body({ ...view, rowStart: 100, rowCount: 10 }), {
      ...deps(undefined, order),
      engine: gated,
      signal: ctl.signal,
    });
    await copyStarted;
    const bBody = body({ ...view, rowStart: 110, rowCount: 10 });
    const b = runGridRows(OWNER, SHEET, bBody, { ...deps(undefined, order), engine: gated });
    await new Promise((r) => setTimeout(r, 50)); // b menunggu pekerjaan bersama
    ctl.abort();
    hold();
    expect((await a).ok).toBe(false);
    expect(await b).toEqual(await rows(bBody, deps()));
    expect(copies).toBe(2);
    order.cache.clear();
  });

  it("L5: permutasi yang gagal dibangun tidak dijadwalkan ulang di permintaan berikutnya", async () => {
    const order = newOrder();
    let attempts = 0;
    order.background = {
      ...order.background,
      engine: {
        withSlot: (u, fn) => engine.withSlot(u, fn),
        exec: async () => {
          attempts++;
          throw new Error("disk penuh");
        },
      },
    };
    const cached = deps(undefined, order);
    const view = { sort: [{ pos: 2, dir: "desc" as const }] };
    await rows(body(view), cached);
    await order.cache.idle();
    await rows(body({ ...view, rowStart: 50 }), cached);
    await order.cache.idle();
    expect(attempts).toBe(1);
    expect(order.cache.size).toBe(0);
  });

  it("tampilan kecil (< minRows) dan jalur polos tidak membangun cache", async () => {
    const order = { ...newOrder(), minRows: ORDER_MIN_ROWS };
    const cached = deps(undefined, order);
    await rows(body({ sort: [{ pos: 2, dir: "asc" }] }), cached);
    await rows(body({ rowStart: 10 }), cached);
    await order.cache.idle();
    expect(order.cache.size).toBe(0);
  });

  it("potongan bawaan: 30 kolom → 50 rb baris, 64 kolom → lebih kecil, minimal 5 rb", () => {
    expect(orderChunkRows(30)).toBe(50_000);
    expect(orderChunkRows(64)).toBe(23_437);
    expect(orderChunkRows(2_000)).toBe(23_437);
    expect(orderChunkRows(1)).toBe(50_000);
  });
});

describe("T-062 AC2: versi/revisi berganti → entri lama dibuang, tidak dipakai versi lain", () => {
  const view = { sort: [{ pos: 1, dir: "desc" as const }] };

  it("revisi skema naik: entri revisi lama dibuang sebelum dibaca", async () => {
    const order = newOrder();
    let rev = 1;
    const cached = deps(() => sheet({ schemaRevision: rev }), order);
    await rows(body(view), cached);
    await order.cache.idle();
    expect(order.cache.size).toBe(1);
    const dirs = readdirSync(order.cache.dir);
    rev = 2;
    sqlLog.length = 0;
    await rows(body({ ...view, rowStart: 60 }), cached);
    // Jawaban dari jalur tanpa cache; permutasi revisi baru dijadwalkan.
    expect(sqlLog.some((s) => s.includes("_pos BETWEEN"))).toBe(false);
    for (const d of dirs) expect(existsSync(join(order.cache.dir, d))).toBe(false);
    await order.cache.idle();
    expect(order.cache.size).toBe(1);
    order.cache.clear();
  });

  it("versi aktif berganti: permintaan versi lama → VERSION_CHANGED dan entrinya dibuang", async () => {
    const order = newOrder();
    let active = VER;
    const cached = deps(() => sheet({ activeVersionId: active }), order);
    await rows(body(view), cached);
    await order.cache.idle();
    expect(order.cache.size).toBe(1);
    active = VER2;
    const r = await runGridRows(OWNER, SHEET, body(view), cached);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VERSION_CHANGED");
    expect(order.cache.size).toBe(0);
    expect(readdirSync(order.cache.dir)).toEqual([]);
  });

  it("L2: permintaan versi basi tidak membuang entri versi aktif", async () => {
    const order = newOrder();
    const s = () => sheet({ versionId: VER2, activeVersionId: VER2 });
    const cached = deps(s, order);
    await rows(body({ ...view, versionId: VER2 }), cached);
    await order.cache.idle();
    const r = await runGridRows(OWNER, SHEET, body(view), cached);
    expect(r.ok).toBe(false);
    expect(order.cache.size).toBe(1);
    order.cache.clear();
  });

  it("versi lain dengan id sheet yang sama tidak pernah membaca entri versi lama", async () => {
    const order = newOrder();
    let v = VER;
    // Versi 2 hanya berisi segmen Januari: baris berbeda dari versi 1.
    const s = () =>
      v === VER
        ? sheet()
        : sheet({ versionId: VER2, activeVersionId: VER2, segments: [manifest[0]!] });
    const cached = deps(s, order);
    await rows(body(view), cached);
    await order.cache.idle();
    v = VER2;
    const b = body({ ...view, versionId: VER2, rowStart: 30 });
    const got = await rows(b, cached);
    expect(got).toEqual(await rows(b, deps(s)));
    expect(got.filteredTotal).toBe(SEGS[0]!.rows);
    expect(ALL).toBeGreaterThan(SEGS[0]!.rows);
    order.cache.clear();
  });
});
