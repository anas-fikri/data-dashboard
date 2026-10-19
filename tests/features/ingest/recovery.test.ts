import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Penyapu ingest macet (review T-006 H2). Sejak T-007 raw + typed satu job: INGESTING tanpa job
 * hidup = macet apa pun tahapnya (versi selesai sudah READY dan tidak tersaring status INGESTING).
 * Prisma, storage, dan antrean dimock.
 */
const findMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { datasetVersion: { findMany, findUnique } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const deletePrefix = vi.fn(async (_prefix: string) => 0);
const deleteSheets = vi.fn(async (_versionId: string): Promise<string[]> => []);
const fail = vi.fn(async (_versionId: string, _message: string) => {});
vi.mock("@/features/ingest/repo", () => ({
  prismaIngestRepo: { deleteSheets, fail, recordCleanup: vi.fn() },
  s3IngestStorage: { deletePrefix },
}));

const { FINAL_FAILURE_MESSAGE, finalizeFailed, recoverStuckIngests, removeStaleWorkDirs } =
  await import("@/features/ingest/recovery");

const queueWith = (states: Record<string, string>) =>
  ({
    getJob: vi.fn(async (id: string) =>
      states[id] ? { getState: async () => states[id] } : undefined,
    ),
  }) as unknown as Parameters<typeof recoverStuckIngests>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recoverStuckIngests", () => {
  it("mencari semua INGESTING yang sudah lewat batas waktu", async () => {
    findMany.mockResolvedValue([]);
    await recoverStuckIngests(queueWith({}));
    const where = findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "INGESTING" });
    expect(where).not.toHaveProperty("ingestStage");
    const cutoff = where.OR[0].ingestStartedAt.lt as Date;
    // deadline 60 menit + 30 menit
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(90 * 60 * 1000 - 1000);
  });

  it("job masih hidup → dilewati; tanpa job atau job gagal → FAILED + prefix dan sheet dibersihkan", async () => {
    findMany.mockResolvedValue([
      { id: "aktif", datasetId: "d1" },
      { id: "menunggu", datasetId: "d1" },
      { id: "hilang", datasetId: "d2" },
      { id: "gagal", datasetId: "d3" },
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      datasetId: where.id === "hilang" ? "d2" : "d3",
    }));
    const n = await recoverStuckIngests(
      queueWith({ aktif: "active", menunggu: "delayed", gagal: "failed" }),
    );
    expect(n).toBe(2);
    expect(deletePrefix.mock.calls.map((c) => c[0])).toEqual([
      "parquet/d2/hilang/",
      "parquet/d3/gagal/",
    ]);
    expect(deleteSheets.mock.calls.map((c) => c[0])).toEqual(["hilang", "gagal"]);
    expect(fail).toHaveBeenCalledWith("hilang", FINAL_FAILURE_MESSAGE);
    expect(fail).not.toHaveBeenCalledWith("aktif", expect.anything());
  });
});

describe("T-038: kegagalan final + direktori kerja yatim", () => {
  const DS = "cmv4klj5r0007oczvgiofocpg";
  const SEG = "cmv4kljx40009oczvdmpursg01";

  it("finalizeFailed: prefix versi + prefix seg/<id>/ segmen versi itu dibersihkan", async () => {
    findUnique.mockResolvedValue({ datasetId: DS });
    deleteSheets.mockResolvedValueOnce([SEG]);
    expect(await finalizeFailed("cmv4kljx40009oczvdmpurrve", DS)).toBe(true);
    expect(deletePrefix.mock.calls.map((c) => c[0])).toEqual([
      `parquet/${DS}/cmv4kljx40009oczvdmpurrve/`,
      `parquet/${DS}/seg/${SEG}/`,
    ]);
    expect(fail).toHaveBeenCalledWith("cmv4kljx40009oczvdmpurrve", FINAL_FAILURE_MESSAGE);
  });

  it("removeStaleWorkDirs: ingest-/recast-/mapping-* dihapus; export-* dan berkas lain tetap", () => {
    const root = mkdtempSync(join(tmpdir(), "dd-stale-"));
    try {
      for (const d of ["ingest-a", "recast-b", "mapping-c", "export-d", "lain"]) {
        mkdirSync(join(root, d));
        writeFileSync(join(root, d, "work.duckdb"), "x");
      }
      writeFileSync(join(root, "mapping-file.txt"), "x");
      expect(removeStaleWorkDirs(root)).toBe(4);
      expect(readdirSync(root).sort()).toEqual(["export-d", "lain"]);
      expect(existsSync(join(root, "mapping-c"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
