import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-038: gerbang integritas (manifest + kunci di storage, file typed lokal), status admin pemeriksaan
 * malam, audit malam (HEAD kunci terujuk + sapuan yatim), dan runner GC di bawah kunci Dataset.
 * Prisma dimock; DuckDB sungguhan untuk file typed.
 */
const prisma = {
  sheetSegment: { findMany: vi.fn(), deleteMany: vi.fn() },
  dataset: { findMany: vi.fn() },
  segment: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  segmentTyped: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  datasetVersion: { findMany: vi.fn() },
  storageCleanup: { findMany: vi.fn(), createMany: vi.fn() },
  sheetLineage: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  sheet: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};
vi.mock("@/lib/db", () => ({ prisma }));
const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn() }));
vi.mock("@/lib/storage/objects", () => ({}));

const check = await import("@/features/versions/integrity-check");
const { runStorageAudit } = await import("@/features/versions/integrity");
const { integrityAlert } = await import("@/features/versions/integrity-status");
const { runSegmentGc, SEGMENT_GC_GRACE_MS } = await import("@/features/versions/gc");
const { typedFileProblems } = await import("@/features/ingest/typed");
const { openDuck } = await import("@/lib/duckdb");

const DS = "cmv4klj5r0007oczvgiofocpg";
const GONE = "cmv4kljx40009oczvdmpugone0";
const SEG = "cmv4kljx40009oczvdmpursg01";
const NOW = new Date("2026-10-20T03:00:00Z");
const sheet = (over: Partial<Parameters<typeof check.manifestProblems>[0][number]> = {}) => ({
  id: "s1",
  name: "Data",
  typedKey: "t1",
  segments: [{ ordinal: 0, rawKey: "r1", typedKey: "t1", rowBase: 0n, maxSrcRow: 10 }],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("manifestProblems + verifyVersionIntegrity", () => {
  it("manifest lengkap → lolos; tanpa segmen, pointer beda, ordinal bolong, _row bertumpuk → ditolak", () => {
    expect(check.manifestProblems([sheet()])).toEqual([]);
    expect(check.manifestProblems([sheet({ typedKey: null, segments: [] })])).toEqual([]);
    expect(check.manifestProblems([sheet({ segments: [] })])).toEqual([
      'sheet "Data" tanpa segmen',
    ]);
    expect(check.manifestProblems([sheet({ typedKey: "lain" })])).toEqual([
      'sheet "Data": file typed tidak cocok dengan manifest',
    ]);
    const two = (b: bigint, max: number | null, ordinal = 1) => ({
      ordinal,
      rawKey: "r2",
      typedKey: "t2",
      rowBase: b,
      maxSrcRow: max,
    });
    const s = sheet().segments[0]!;
    expect(check.manifestProblems([sheet({ segments: [s, two(10n, 5)] })])).toEqual([]);
    expect(check.manifestProblems([sheet({ segments: [s, two(9n, 5)] })])).toEqual([
      'sheet "Data": nomor baris antarsegmen bertumpuk',
    ]);
    expect(check.manifestProblems([sheet({ segments: [s, two(10n, 5, 2)] })])).toEqual([
      'sheet "Data": urutan segmen tidak berurutan',
    ]);
    expect(check.manifestProblems([sheet({ segments: [s, two(10n, null)] })])).toEqual([
      'sheet "Data": segmen lama tanpa rentang baris',
    ]);
  });

  it("kunci hilang → masalah per kunci; versi tidak ada → masalah; galat storage dilempar (bukan 'hilang')", async () => {
    const deps = {
      manifest: vi.fn(async () => [sheet()]),
      exists: vi.fn(async (k: string) => k !== "t1"),
    };
    expect(await check.verifyVersionIntegrity("v", deps)).toEqual(["file data tidak ada: t1"]);
    expect(deps.exists).toHaveBeenCalledTimes(2);
    deps.manifest.mockResolvedValueOnce(null as never);
    expect(await check.verifyVersionIntegrity("v", deps)).toEqual(["versi tidak ditemukan"]);
    deps.exists.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(check.verifyVersionIntegrity("v", deps)).rejects.toThrow("ECONNRESET");
    expect(new check.IntegrityError(["a", "b", "c", "d"]).message).toBe(
      "Pemeriksaan integritas data gagal (a; b; c; dan 1 lainnya).",
    );
  });
});

describe("typedFileProblems (DuckDB)", () => {
  const root = mkdtempSync(join(tmpdir(), "dd-integrity-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("jumlah baris = baris data sumber dan _row unik → lolos; selisih / ganda → masalah", async () => {
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    const ok = join(root, "ok.parquet");
    const dup = join(root, "dup.parquet");
    await c.run(
      `COPY (SELECT CAST(i AS BIGINT) AS _row FROM range(5) t(i)) TO '${ok}' (FORMAT parquet)`,
    );
    await c.run(
      `COPY (SELECT CAST(i % 3 AS BIGINT) AS _row FROM range(5) t(i)) TO '${dup}' (FORMAT parquet)`,
    );
    c.closeSync();
    db.closeSync();
    const duck = await openDuck({ path: join(root, "w.duckdb"), tmpDir: root });
    try {
      expect(await typedFileProblems(duck, ok, 5, "sheet A")).toEqual([]);
      expect(await typedFileProblems(duck, ok, 6, "sheet A")).toEqual([
        "sheet A: 5 baris di file, 6 baris data di sumber",
      ]);
      expect(await typedFileProblems(duck, dup, 5, "sheet B")).toEqual([
        "sheet B: 2 nomor baris ganda",
      ]);
    } finally {
      duck.close();
    }
  });
});

describe("status admin pemeriksaan malam", () => {
  it("tanpa temuan → tanpa banner; ada file hilang → teks dengan jumlah + petunjuk log", () => {
    const base = {
      checkedAt: NOW.toISOString(),
      keys: 10,
      missing: 0,
      unchecked: 0,
      sample: [],
      orphans: 0,
    };
    expect(integrityAlert(null)).toBeNull();
    expect(integrityAlert(base)).toBeNull();
    const a = integrityAlert({ ...base, missing: 2, sample: ["k1", "k2"] });
    expect(a?.text).toMatch(/menemukan 2 file data yang masih dipakai tetapi tidak ada/);
    expect(a?.text).toMatch(/kunci data terujuk hilang/);
  });
});

describe("runStorageAudit", () => {
  it("HEAD kunci terujuk (hilang → alert log + status), objek yatim tua & prefix dataset hilang diantrekan", async () => {
    const seg = `parquet/${DS}/seg/${SEG}/`;
    prisma.sheetSegment.findMany.mockResolvedValueOnce([
      {
        segmentTyped: {
          typedKey: `${seg}typed-1.parquet`,
          segment: { rawKey: `${seg}raw.parquet` },
        },
      },
    ]);
    prisma.dataset.findMany.mockResolvedValueOnce([{ id: DS }]);
    prisma.segment.findMany.mockResolvedValueOnce([{ rawKey: `${seg}raw.parquet` }]);
    prisma.segmentTyped.findMany.mockResolvedValueOnce([{ typedKey: `${seg}typed-1.parquet` }]);
    prisma.storageCleanup.findMany.mockResolvedValue([]);
    const old = new Date(NOW.getTime() - SEGMENT_GC_GRACE_MS - 1);
    const young = new Date(NOW.getTime() - 60_000);
    const saved: unknown[] = [];
    const status = await runStorageAudit(
      {
        exists: async (k) => !k.endsWith("typed-1.parquet"),
        listObjects: async () => [
          { key: `${seg}raw.parquet`, modified: old },
          { key: `${seg}typed-1.parquet`, modified: old },
          // Sisa recast/pemetaan yang mati (tidak tercatat, sudah tua) → yatim.
          { key: `${seg}typed-2-0123456789ab.parquet`, modified: old },
          // Masih muda (mungkin sedang diunggah) → dibiarkan.
          { key: `${seg}typed-3-0123456789ab.parquet`, modified: young },
          { key: `${seg}catatan.txt`, modified: old },
        ],
        listChildPrefixes: async (top) => [`${top}${DS}/`, `${top}${GONE}/`],
        saveStatus: async (s) => {
          saved.push(s);
        },
      },
      NOW,
    );
    expect(status).toMatchObject({
      keys: 2,
      missing: 1,
      unchecked: 0,
      sample: [`${seg}typed-1.parquet`],
      orphans: 3,
    });
    expect(saved).toEqual([status]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ missing: 1 }),
      "kunci data terujuk hilang dari storage",
    );
    const queued = prisma.storageCleanup.createMany.mock.calls.flatMap((c) =>
      (c[0] as { data: { prefix: string }[] }).data.map((d) => d.prefix),
    );
    expect(queued.sort()).toEqual(
      [`${seg}typed-2-0123456789ab.parquet`, `parquet/${GONE}/`, `raw/${GONE}/`].sort(),
    );
  });
});

describe("runSegmentGc (Prisma)", () => {
  it("di bawah kunci Dataset: tandai, sapu yang lewat tenggang, antrekan objeknya; dataset terhapus dilewati", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: DS }]),
      datasetVersion: { findMany: vi.fn(async () => [{ id: "v", status: "READY" }]) },
      sheetSegment: {
        findMany: vi.fn(async () => [{ segmentTypedId: "tLive", sheet: { versionId: "v" } }]),
        deleteMany: vi.fn(),
      },
      segment: {
        findMany: vi.fn(async () => [
          {
            id: SEG,
            createdByVersionId: null,
            unreferencedAt: new Date(NOW.getTime() - SEGMENT_GC_GRACE_MS),
            rawKey: `parquet/${DS}/seg/${SEG}/raw.parquet`,
          },
          {
            id: "live",
            createdByVersionId: "v",
            unreferencedAt: null,
            rawKey: `parquet/${DS}/seg/live/raw.parquet`,
          },
        ]),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      segmentTyped: {
        findMany: vi.fn(async () => [
          { id: "tDead", segmentId: SEG, unreferencedAt: null, typedKey: "x" },
          { id: "tLive", segmentId: "live", unreferencedAt: null, typedKey: "y" },
          { id: "tOld", segmentId: "live", unreferencedAt: null, typedKey: "z" },
        ]),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      storageCleanup: { createMany: vi.fn() },
      sheetLineage: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    };
    prisma.dataset.findMany.mockResolvedValueOnce([{ id: DS }]);
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
    const out = await runSegmentGc(NOW);
    expect(out).toEqual({
      datasets: 1,
      marked: 1,
      unmarked: 0,
      sweptSegments: 1,
      sweptTyped: 0,
      lineages: 1,
    });
    // Revisi lama segmen hidup baru ditandai (disapu putaran sesudah tenggang).
    expect(tx.segmentTyped.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["tOld"] } },
      data: { unreferencedAt: NOW },
    });
    // Manifest (FAILED) yang masih menunjuk revisi segmen yang disapu dihapus lebih dulu (FK NoAction).
    expect(tx.sheetSegment.deleteMany).toHaveBeenCalledWith({
      where: { segmentTypedId: { in: ["tDead"] } },
    });
    expect(tx.segment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [SEG] } } });
    expect(tx.storageCleanup.createMany).toHaveBeenCalledWith({
      data: [{ prefix: `parquet/${DS}/seg/${SEG}/`, reason: "GC segmen", notBefore: NOW }],
    });

    // Dataset terhapus di antara daftar dan kunci → tidak ada perubahan.
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValueOnce([]);
    prisma.dataset.findMany.mockResolvedValueOnce([{ id: DS }]);
    expect((await runSegmentGc(NOW)).datasets).toBe(0);
    expect(tx.segment.deleteMany).not.toHaveBeenCalled();
  });
});

describe("review T-038: audit tahan galat sementara + sapuan prefix versi legacy", () => {
  it("HEAD gagal sementara → dihitung belum diperiksa, status tetap disimpan; yatim legacy ikut disapu", async () => {
    const VER = "cmv4kljx40009oczvdmpurrve";
    const SHEET = "cmv4kljx40009oczvdmpursht";
    const legacy = `parquet/${DS}/${VER}/${SHEET}/`;
    prisma.sheetSegment.findMany.mockResolvedValueOnce([
      {
        segmentTyped: {
          typedKey: `${legacy}typed-1.parquet`,
          segment: { rawKey: `${legacy}raw.parquet` },
        },
      },
    ]);
    prisma.dataset.findMany.mockResolvedValueOnce([{ id: DS }]);
    prisma.segment.findMany.mockResolvedValueOnce([{ rawKey: `${legacy}raw.parquet` }]);
    prisma.segmentTyped.findMany.mockResolvedValueOnce([{ typedKey: `${legacy}typed-1.parquet` }]);
    prisma.sheet.findMany.mockResolvedValueOnce([
      { rawKey: `${legacy}raw.parquet`, typedKey: `${legacy}typed-1.parquet` },
    ]);
    prisma.storageCleanup.findMany.mockResolvedValue([]);
    const old = new Date(NOW.getTime() - SEGMENT_GC_GRACE_MS - 1);
    const listed: string[] = [];
    const saved: unknown[] = [];
    const status = await runStorageAudit(
      {
        exists: async (k) => {
          if (k.endsWith("raw.parquet")) throw new Error("503 SlowDown");
          return true;
        },
        listObjects: async (prefix) => {
          listed.push(prefix);
          return [
            { key: `${legacy}raw.parquet`, modified: old },
            { key: `${legacy}typed-1.parquet`, modified: old },
            // Sisa recast yang mati pada segmen legacy (di prefix versi).
            { key: `${legacy}typed-2-0123456789ab.parquet`, modified: old },
          ];
        },
        listChildPrefixes: async () => [],
        saveStatus: async (s) => {
          saved.push(s);
        },
      },
      NOW,
    );
    expect(listed).toEqual([`parquet/${DS}/`]);
    expect(status).toMatchObject({ keys: 2, missing: 0, unchecked: 1, orphans: 1 });
    expect(saved).toEqual([status]);
    expect(logger.warn).toHaveBeenCalledWith({ unchecked: 1 }, expect.any(String));
    expect(prisma.storageCleanup.createMany).toHaveBeenCalledWith({
      data: [
        {
          prefix: `${legacy}typed-2-0123456789ab.parquet`,
          reason: "objek segmen yatim",
          notBefore: NOW,
        },
      ],
    });
  });
});
