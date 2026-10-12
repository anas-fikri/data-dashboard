import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Penyapu ingest macet (review T-006 H2): hanya tahap raw yang belum selesai. Versi yang raw-nya
 * sukses (ingestStage "raw", job selesai) menunggu tahap berikutnya dan tidak boleh di-FAILED-kan.
 * Prisma, storage, dan antrean dimock.
 */
const findMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { datasetVersion: { findMany, findUnique } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const deletePrefix = vi.fn(async (_prefix: string) => 0);
const deleteSheets = vi.fn(async (_versionId: string) => {});
const fail = vi.fn(async (_versionId: string, _message: string) => {});
vi.mock("@/features/ingest/repo", () => ({
  prismaIngestRepo: { deleteSheets, fail, recordCleanup: vi.fn() },
  s3IngestStorage: { deletePrefix },
}));

const { FINAL_FAILURE_MESSAGE, recoverStuckIngests } = await import("@/features/ingest/recovery");

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
  it("hanya mencari INGESTING yang tahap raw-nya belum selesai dan sudah lewat batas waktu", async () => {
    findMany.mockResolvedValue([]);
    await recoverStuckIngests(queueWith({}));
    const where = findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "INGESTING", ingestStage: null });
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
