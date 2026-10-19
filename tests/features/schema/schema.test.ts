import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { failureMessage } from "@/features/ingest/ingest";
import { PREVIEW_CHARS, PREVIEW_COLS, previewOf } from "@/features/ingest/preview";
import type { QueryDeps, QueryRepo } from "@/features/query/service";
import {
  changedColumns,
  ingestStatus,
  recastStatus,
  requestRecast,
  SAMPLE_COLS,
  SAMPLE_ROWS,
  SAMPLE_TEXT_CHARS,
  sampleRows,
  sampleSql,
  type RecastJobView,
  type SchemaDeps,
  type SchemaRepo,
} from "@/features/schema/service";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-008: pratinjau baris mentah, sampel typed, permintaan dan status koreksi skema. Mesin DuckDB dan
 * cache parquet sungguhan; DB, antrean, dan Redis palsu.
 */
const USER = "user-pemilik";
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const WIDE = "cmv4kljx40009oczvdmpurrxw";
/** Typed segmen (T-036): _row = rowBase (2^31 − 1) + baris fisik, _src_row = baris fisik. */
const SEG = "cmv4kljx40009oczvdmpurrxs";

const col = (
  pos: number,
  name: string,
  type: ColumnSchema["type"],
  hidden = false,
): ColumnSchema => ({
  pos,
  name,
  original: name,
  type,
  hidden,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
});
const SCHEMA = [col(1, "Kota", "text"), col(2, "Tanggal", "date"), col(3, "Total", "decimal")];
const WIDE_SCHEMA = Array.from({ length: 70 }, (_, i) => col(i + 1, `K${i + 1}`, "integer"));

let root: string;
let engine: QueryEngine;
let parquet: ParquetCache;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-schema-test-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 4)::INTEGER AS _row,
                  repeat('k', 300) || i AS c1,
                  DATE '2025-12-31' + CAST(i AS INTEGER) AS c2,
                  CAST(i * 1.5 AS DECIMAL(38,6)) AS c3
           FROM range(500) t(i)) TO '${join(root, "typed.parquet")}' (FORMAT parquet)`,
  );
  await c.run(
    `COPY (SELECT (2147483647 + i + 4)::BIGINT AS _row, (i + 4)::INTEGER AS _src_row,
                  'kota' || i AS c1, DATE '2025-12-31' + CAST(i AS INTEGER) AS c2,
                  CAST(i AS DECIMAL(38,6)) AS c3
           FROM range(60) t(i)) TO '${join(root, "segment.parquet")}' (FORMAT parquet)`,
  );
  const wideCols = Array.from({ length: 70 }, (_, i) => `i + ${i} AS c${i + 1}`).join(", ");
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row, ${wideCols} FROM range(80) t(i))
     TO '${join(root, "wide.parquet")}' (FORMAT parquet)`,
  );
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "256MB",
    maxConcurrency: 2,
    perUser: 2,
    queueWaitMs: 1_000,
  });
  parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (key, dest) => {
      const { copyFileSync } = await import("node:fs");
      copyFileSync(join(root, key), dest);
    },
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function queryDeps(): QueryDeps {
  const repo: QueryRepo = {
    widget: async () => null,
    ownedDataset: async (userId, datasetId) =>
      userId === USER && datasetId === DS ? { activeVersionId: VER } : null,
    sheet: async (versionId, sheetId) => {
      if (versionId !== VER) return null;
      if (sheetId === SHEET)
        return { typedKey: "typed.parquet", schemaRevision: 1, schema: SCHEMA };
      if (sheetId === WIDE)
        return { typedKey: "wide.parquet", schemaRevision: 1, schema: WIDE_SCHEMA };
      if (sheetId === SEG)
        return { typedKey: "segment.parquet", schemaRevision: 1, schema: SCHEMA };
      return null;
    },
  };
  return { repo, parquet, engine, cache: null, timeoutMs: 10_000 };
}

describe("pratinjau baris mentah (dipakai memilih baris header)", () => {
  it("urut nomor baris, dibatasi kolom dan panjang sel; tanggal/angka/boolean jadi teks", () => {
    const vals = [
      "x".repeat(500),
      42,
      true,
      new Date(Date.UTC(2025, 11, 31)),
      null,
      ...Array.from({ length: 80 }, (_, i) => `k${i}`),
    ];
    const p = previewOf(
      [
        { row: 5, vals },
        { row: 1, vals: ["Judul laporan"] },
      ],
      vals.length,
    );
    expect(p.colCount).toBe(vals.length);
    expect(p.rows.map((r) => r.row)).toEqual([1, 5]);
    expect(p.rows[0]!.cells).toHaveLength(PREVIEW_COLS);
    expect(p.rows[0]!.cells.slice(0, 2)).toEqual(["Judul laporan", null]);
    expect(p.rows[1]!.cells.slice(0, 5)).toEqual([
      "x".repeat(PREVIEW_CHARS),
      "42",
      "TRUE",
      "2025-12-31",
      null,
    ]);
  });
});

describe("AC 2: sampel 50 baris typed", () => {
  it("SQL sampel hanya memakai posisi dari skema; teks dipotong", () => {
    expect(
      sampleSql([
        { pos: 1, type: "text" },
        { pos: 3, type: "decimal" },
      ]),
    ).toBe(
      `SELECT COLUMNS('^_(src_)?row$'), left(c1, ${SAMPLE_TEXT_CHARS}) AS c1, c3 FROM read_parquet($path) LIMIT ${SAMPLE_ROWS}`,
    );
  });

  it("T-036: typed segmen → nomor baris = _src_row (baris fisik), bukan rowBase + baris", async () => {
    const r = await sampleRows(USER, DS, SEG, queryDeps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x[0])).toEqual(Array.from({ length: 50 }, (_, i) => i + 4));
    expect(r.rows[0]).toEqual([4, "kota0", "2025-12-31", 0]);
  });

  it("50 baris pertama urut nomor baris, nilai siap tampil (tanggal ISO, teks ≤ 200)", async () => {
    const r = await sampleRows(USER, DS, SHEET, queryDeps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns.map((c) => c.name)).toEqual(["Kota", "Tanggal", "Total"]);
    expect(r.rows).toHaveLength(SAMPLE_ROWS);
    expect(r.rows.map((x) => x[0])).toEqual(Array.from({ length: 50 }, (_, i) => i + 4));
    expect(r.rows[0]).toEqual([4, "k".repeat(SAMPLE_TEXT_CHARS), "2025-12-31", 0]);
    expect(r.rows[1]![2]).toBe("2026-01-01");
    expect(r.totalColumns).toBe(3);
  });

  it("sheet lebar: hanya 60 kolom pertama dikirim, jumlah total tetap dilaporkan", async () => {
    const r = await sampleRows(USER, DS, WIDE, queryDeps());
    expect(r).toMatchObject({ ok: true, totalColumns: 70 });
    if (!r.ok) return;
    expect(r.columns).toHaveLength(SAMPLE_COLS);
    expect(r.rows[0]).toHaveLength(SAMPLE_COLS + 1);
  });

  it("bukan pemilik, sheet dataset lain, atau id rusak → NOT_FOUND; belum ada typed → NOT_READY", async () => {
    const d = queryDeps();
    expect(await sampleRows("orang-lain", DS, SHEET, d)).toMatchObject({ code: "NOT_FOUND" });
    expect(await sampleRows(USER, DS, "cmv4kljx40009oczvdmpurrxz", d)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await sampleRows(USER, "../x", SHEET, d)).toMatchObject({ code: "NOT_FOUND" });
    const notReady: QueryDeps = {
      ...d,
      repo: { ...d.repo, sheet: async () => ({ typedKey: null, schemaRevision: 0, schema: null }) },
    };
    expect(await sampleRows(USER, DS, SHEET, notReady)).toMatchObject({ code: "NOT_READY" });
  });
});

describe("AC 1: status ingest", () => {
  const p = {
    stage: "baca" as const,
    refresh: false,
    sheet: 1,
    sheetName: "Penjualan",
    rows: 50_000,
    fraction: 0.4,
    rowsEstimate: null,
  };
  const at = { row: 73_412, csv: false, deadline: false };

  it("pesan gagal menyebut sheet dan nomor baris fisik terakhir yang dibaca (review L4)", () => {
    expect(failureMessage("File memiliki 3.000 kolom.", p, at)).toBe(
      'Sheet "Penjualan", sekitar baris 73.412: File memiliki 3.000 kolom.',
    );
    expect(failureMessage("Memori habis.", { ...p, stage: "tipe" }, at)).toBe(
      'Sheet "Penjualan": Memori habis.',
    );
  });

  it("tanpa lokasi untuk CSV, batas waktu, sebelum sheet dibaca, dan pesan parser yang sudah berlokasi", () => {
    const own = 'XML rusak di sheet "Penjualan" baris 121.';
    expect(failureMessage(own, p, at)).toBe(own);
    expect(failureMessage("Bukan file Excel.", { ...p, sheetName: null }, at)).toBe(
      "Bukan file Excel.",
    );
    expect(
      failureMessage(
        "File CSV rusak di sekitar baris 9.",
        { ...p, sheetName: "CSV" },
        {
          ...at,
          csv: true,
        },
      ),
    ).toBe("File CSV rusak di sekitar baris 9.");
    expect(failureMessage("Melebihi 60 menit.", p, { ...at, deadline: true })).toBe(
      "Melebihi 60 menit.",
    );
  });

  it("id rusak → null tanpa menyentuh DB", async () => {
    const latestVersion = vi.fn();
    expect(await ingestStatus(USER, "x'; DROP", { latestVersion })).toBeNull();
    expect(latestVersion).not.toHaveBeenCalled();
  });
});

function schemaDeps(
  over: Partial<SchemaDeps> = {},
  sheet: Partial<Awaited<ReturnType<SchemaRepo["ownedActiveSheet"]>>> = {},
  repoOver: Partial<SchemaRepo> = {},
) {
  const enqueue = vi.fn(async (_sheetId: string, _userId: string, _input: unknown) => "17");
  const releaseRateLimit = vi.fn(async () => {});
  const applyMetadata = vi.fn(async (_id: string, base: number) => base + 1);
  const owns = (userId: string, sheetId: string) => userId === USER && sheetId === SHEET;
  const ownedActiveSheet = vi.fn(async (userId: string, sheetId: string) =>
    owns(userId, sheetId)
      ? {
          colCount: 3,
          schemaRevision: 2,
          headerRow: 1,
          schema: SCHEMA,
          versionStatus: "READY" as const,
          ...sheet,
        }
      : null,
  );
  const repo: SchemaRepo = {
    latestVersion: async () => "none",
    schemaView: async () => null,
    ownedActiveSheet,
    ownsActiveSheet: async (userId, sheetId) => owns(userId, sheetId),
    applyMetadata,
    ...repoOver,
  };
  const deps: SchemaDeps = {
    repo,
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    releaseRateLimit,
    inFlight: async () => ({ user: 0, sheet: false }),
    serialize: (_userId, fn) => fn(),
    enqueue,
    job: async () => null,
    ...over,
  };
  return { deps, enqueue, releaseRateLimit, applyMetadata, ownedActiveSheet };
}

describe("AC 3–5: permintaan koreksi skema", () => {
  it("ganti tipe/format → antrean dengan baseRevision, peminta, dan hanya kolom yang berubah", async () => {
    const { deps, enqueue, applyMetadata } = schemaDeps();
    const r = await requestRecast(
      USER,
      SHEET,
      {
        baseRevision: 2,
        columns: [
          { pos: 1, name: "Kota Tujuan", type: "text" }, // tipe sama → hanya nama
          { pos: 2, type: "date", dateFormat: "dd-mm-yyyy" },
          { pos: 3, name: "Total" }, // tidak berubah
        ],
      },
      deps,
    );
    expect(r).toEqual({ ok: true, jobId: "17" });
    expect(enqueue).toHaveBeenCalledWith(SHEET, USER, {
      baseRevision: 2,
      columns: [
        { pos: 1, name: "Kota Tujuan" },
        { pos: 2, dateFormat: "dd-mm-yyyy" },
      ],
    });
    expect(applyMetadata).not.toHaveBeenCalled();
  });

  it("AC 5: ganti nama/sembunyikan diterapkan langsung tanpa worker; nama asli tetap (review M2)", async () => {
    const { deps, enqueue, applyMetadata } = schemaDeps();
    const r = await requestRecast(
      USER,
      SHEET,
      {
        baseRevision: 2,
        columns: [
          { pos: 1, name: "Kota Tujuan" },
          { pos: 3, hidden: true },
        ],
      },
      deps,
    );
    expect(r).toEqual({ ok: true, applied: true, revision: 3 });
    expect(enqueue).not.toHaveBeenCalled();
    const [, base, schema] = applyMetadata.mock.calls[0]! as unknown as [
      string,
      number,
      ColumnSchema[],
    ];
    expect(base).toBe(2);
    expect(schema.find((c) => c.pos === 1)).toMatchObject({
      name: "Kota Tujuan",
      original: "Kota",
    });
    expect(schema.find((c) => c.pos === 3)).toMatchObject({ hidden: true, type: "decimal" });
    // Revisi sudah berubah di DB (mis. tab lain) → basi, tidak menimpa.
    const raced = schemaDeps({}, {}, { applyMetadata: async () => null }).deps;
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, name: "B" }] },
        raced,
      ),
    ).toMatchObject({ code: "STALE" });
  });

  it("T-014: kolom kosong (absent, pos > colCount) bisa diganti nama/disembunyikan/diganti tipe; di luar skema ditolak", async () => {
    const absent = { ...col(4, "Diskon", "decimal"), nullPct: 1, absent: true };
    const sheet = { schema: [...SCHEMA, absent] };
    const meta = schemaDeps({}, sheet);
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 4, name: "Potongan", hidden: true }] },
        meta.deps,
      ),
    ).toEqual({ ok: true, applied: true, revision: 3 });
    const [, , schema] = meta.applyMetadata.mock.calls[0]! as unknown as [
      string,
      number,
      ColumnSchema[],
    ];
    expect(schema[3]).toMatchObject({ pos: 4, name: "Potongan", hidden: true, absent: true });
    const retype = schemaDeps({}, sheet);
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 4, type: "integer" }] },
        retype.deps,
      ),
    ).toEqual({ ok: true, jobId: "17" });
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 5, name: "X" }] },
        schemaDeps({}, sheet).deps,
      ),
    ).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("baris header baru dikirim tanpa edit kolom (nama dan tipe dibentuk ulang dari baris itu)", async () => {
    const { deps, enqueue } = schemaDeps();
    const r = await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, headerRow: 3, columns: [{ pos: 1, name: "X" }] },
      deps,
    );
    expect(r).toMatchObject({ ok: true, jobId: "17" });
    expect(enqueue).toHaveBeenCalledWith(SHEET, USER, { baseRevision: 2, headerRow: 3 });
  });

  it("ditolak sebelum masuk antrean: bukan pemilik, belum siap, tidak valid, basi, tanpa perubahan, nama ganda", async () => {
    const { deps, enqueue, applyMetadata } = schemaDeps();
    const body = { baseRevision: 2, columns: [{ pos: 1, name: "Baru" }] };
    expect(await requestRecast("orang-lain", SHEET, body, deps)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await requestRecast(USER, "bukan id", body, deps)).toMatchObject({ code: "NOT_FOUND" });
    const ingesting = schemaDeps({}, { versionStatus: "INGESTING" }).deps;
    expect(await requestRecast(USER, SHEET, body, ingesting)).toMatchObject({ code: "NOT_READY" });
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, type: "uang" }] },
        deps,
      ),
    ).toMatchObject({ code: "INVALID" });
    expect(
      await requestRecast(USER, SHEET, { baseRevision: 2, columns: [{ pos: 9, name: "X" }] }, deps),
    ).toMatchObject({ code: "INVALID" });
    expect(
      await requestRecast(USER, SHEET, { columns: [{ pos: 1, name: "X" }] }, deps),
    ).toMatchObject({ code: "INVALID" });
    expect(await requestRecast(USER, SHEET, { ...body, baseRevision: 1 }, deps)).toMatchObject({
      code: "STALE",
    });
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, name: "Kota" }] },
        deps,
      ),
    ).toMatchObject({ code: "NO_CHANGE" });
    expect(await requestRecast(USER, SHEET, { baseRevision: 2, headerRow: 1 }, deps)).toMatchObject(
      {
        code: "NO_CHANGE",
      },
    );
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 3, name: "kota" }] },
        deps,
      ),
    ).toMatchObject({ code: "INVALID", message: expect.stringContaining("kota") });
    expect(enqueue).not.toHaveBeenCalled();
    expect(applyMetadata).not.toHaveBeenCalled();
  });

  it("satu job per sheet dan ≤ 2 job berjalan per user (review M2)", async () => {
    const type = { baseRevision: 2, columns: [{ pos: 2, type: "text" }] };
    const sheetBusy = schemaDeps({ inFlight: async () => ({ user: 1, sheet: true }) });
    expect(await requestRecast(USER, SHEET, type, sheetBusy.deps)).toMatchObject({ code: "BUSY" });
    // Ganti nama pun ditahan selama sheet sedang di-recast (hasil recast akan basi bila tidak).
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, name: "B" }] },
        sheetBusy.deps,
      ),
    ).toMatchObject({ code: "BUSY" });
    const userFull = schemaDeps({ inFlight: async () => ({ user: 2, sheet: false }) });
    expect(await requestRecast(USER, SHEET, type, userFull.deps)).toMatchObject({
      code: "QUEUE_FULL",
    });
    expect(sheetBusy.enqueue).not.toHaveBeenCalled();
    expect(userFull.enqueue).not.toHaveBeenCalled();
  });

  it("permintaan paralel tidak bisa melewati batas 2 job per user (review M2 putaran 2)", async () => {
    // Antrean palsu dengan jeda round-trip; 20 koreksi tipe ke 20 sheet dikirim serentak.
    const queued: string[] = [];
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const sheets = Array.from(
      { length: 20 },
      (_, i) => `cmv4kljx40009oczvdmpurr${String(i).padStart(3, "0")}`,
    );
    const base = (serialize: SchemaDeps["serialize"]) =>
      schemaDeps(
        {
          inFlight: async (_u, sheetId) => {
            await tick();
            return { user: queued.length, sheet: queued.includes(sheetId) };
          },
          enqueue: async (sheetId) => {
            await tick();
            queued.push(sheetId);
            return String(queued.length);
          },
          serialize,
        },
        {},
        {
          ownedActiveSheet: async () => ({
            colCount: 3,
            schemaRevision: 2,
            headerRow: 1,
            schema: SCHEMA,
            versionStatus: "READY",
          }),
        },
      ).deps;
    const body = { baseRevision: 2, columns: [{ pos: 2, type: "text" }] };

    // Tanpa lock: semua melihat "0 job" dan masuk antrean (race yang dilaporkan reviewer).
    const racy = await Promise.all(
      sheets.map((id) =>
        requestRecast(
          USER,
          id,
          body,
          base((_u, fn) => fn()),
        ),
      ),
    );
    expect(racy.filter((r) => r.ok)).toHaveLength(20);

    // Dengan lock per user (mutex): tepat 2 masuk, sisanya QUEUE_FULL.
    queued.length = 0;
    let chain: Promise<unknown> = Promise.resolve();
    const mutex: SchemaDeps["serialize"] = (_u, fn) => {
      const run = chain.then(fn);
      chain = run.catch(() => {});
      return run;
    };
    const safe = await Promise.all(sheets.map((id) => requestRecast(USER, id, body, base(mutex))));
    expect(safe.filter((r) => r.ok)).toHaveLength(2);
    expect(safe.filter((r) => !r.ok && r.code === "QUEUE_FULL")).toHaveLength(18);
    expect(queued).toHaveLength(2);

    // Lock tidak didapat dalam batas waktu → QUEUE_FULL tanpa masuk antrean.
    queued.length = 0;
    const timeout = await requestRecast(
      USER,
      SHEET,
      body,
      base(async () => null),
    );
    expect(timeout).toMatchObject({ ok: false, code: "QUEUE_FULL" });
    expect(queued).toHaveLength(0);
  });

  it("rate limit per jenis perubahan; slot dikembalikan bila antrean gagal (review L5)", async () => {
    const limited = schemaDeps({ rateLimit: async () => ({ allowed: false, retryAfterSec: 125 }) });
    const r = await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, columns: [{ pos: 2, type: "text" }] },
      limited.deps,
    );
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterSec: 125 });
    expect(r.ok ? "" : r.message).toMatch(/3 menit/);
    expect(limited.enqueue).not.toHaveBeenCalled();

    const kinds: string[] = [];
    const seen = schemaDeps({
      rateLimit: async (_u, kind) => {
        kinds.push(kind);
        return { allowed: true, retryAfterSec: 0 };
      },
    });
    await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, columns: [{ pos: 1, name: "B" }] },
      seen.deps,
    );
    await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, columns: [{ pos: 2, type: "text" }] },
      seen.deps,
    );
    expect(kinds).toEqual(["metadata", "recast"]);

    const down = schemaDeps({
      enqueue: async () => {
        throw new Error("antrean tidak merespons");
      },
    });
    await expect(
      requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 2, type: "text" }] },
        down.deps,
      ),
    ).rejects.toThrow(/antrean/);
    expect(down.releaseRateLimit).toHaveBeenCalledWith(USER, "recast");
  });

  it("changedColumns membuang kolom yang tidak berubah dan posisi yang tidak dikenal tetap diteruskan", () => {
    expect(
      changedColumns(SCHEMA, [
        { pos: 1, name: " Kota " },
        { pos: 3, hidden: true },
      ]),
    ).toEqual([{ pos: 3, hidden: true }]);
  });
});

describe("status koreksi skema (polling)", () => {
  const job = (v: Partial<RecastJobView>): RecastJobView => ({
    sheetId: SHEET,
    state: "completed",
    result: null,
    progress: null,
    ...v,
  });
  const status = (j: RecastJobView | null, jobId = "17") => {
    const d = schemaDeps({ job: async () => j });
    return recastStatus(USER, SHEET, jobId, d.deps).then((r) => ({ r, read: d.ownedActiveSheet }));
  };
  const st = async (j: RecastJobView | null, jobId?: string) => (await status(j, jobId)).r;

  it("antre/jalan/selesai/basi/tidak valid/gagal dipetakan untuk UI", async () => {
    expect(await st(job({ state: "waiting" }))).toEqual({ ok: true, status: { state: "queued" } });
    expect(await st(job({ state: "delayed" }))).toEqual({ ok: true, status: { state: "queued" } });
    expect(await st(job({ state: "active" }))).toEqual({ ok: true, status: { state: "running" } });
    // T-040: segmen yang sedang dikerjakan ikut dikirim selama berjalan.
    const progress = { phase: "write" as const, current: 7, total: 24 };
    expect(await st(job({ state: "active", progress }))).toEqual({
      ok: true,
      status: { state: "running", progress },
    });
    expect(await st(job({ result: { outcome: "done", revision: 3 } }))).toEqual({
      ok: true,
      status: { state: "done", revision: 3 },
    });
    expect(await st(job({ result: { outcome: "stale" } }))).toMatchObject({
      status: { state: "stale" },
    });
    expect(
      await st(job({ result: { outcome: "invalid", message: "Nama kolom ganda" } })),
    ).toMatchObject({ status: { state: "invalid", message: "Nama kolom ganda" } });
    expect(await st(job({ state: "failed" }))).toMatchObject({ status: { state: "failed" } });
  });

  it("job tidak ada, milik sheet lain, di luar daftar BullMQ, atau selesai tanpa hasil → 'unknown' yang sama (review L1, L7)", async () => {
    const unknown = { ok: true, status: { state: "unknown" } };
    expect(await st(null)).toEqual(unknown);
    expect(await st(job({ sheetId: "cmv4kljx40009oczvdmpurrxq", state: "active" }))).toEqual(
      unknown,
    );
    expect(await st(job({ state: "unknown" }))).toEqual(unknown);
    expect(await st(job({ state: "completed", result: null }))).toEqual(unknown);
  });

  it("polling hanya memeriksa kepemilikan (tanpa membaca skema); bukan pemilik atau id rusak → NOT_FOUND (review L3)", async () => {
    const { read } = await status(job({ state: "active" }));
    expect(read).not.toHaveBeenCalled();
    expect(await st(job({}), "abc")).toMatchObject({ code: "NOT_FOUND" });
    expect(await st(job({}), "rc_; FLUSHALL")).toMatchObject({ code: "NOT_FOUND" });
    expect(await st(job({ state: "active" }), `rc_${"a1".repeat(12)}`)).toEqual({
      ok: true,
      status: { state: "running" },
    });
    const other = await recastStatus("orang-lain", SHEET, "17", schemaDeps().deps);
    expect(other).toMatchObject({ code: "NOT_FOUND" });
  });
});
