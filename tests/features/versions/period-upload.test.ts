import { beforeEach, describe, expect, it, vi } from "vitest";
import { computePeriodPlan } from "@/features/ingest/period-plan";
import { periodPlanDigest } from "@/features/ingest/period-upload-plan";

/*
 * Tinjauan + "Terapkan" unggahan periode sisi app (T-052 AC5): pemilik saja (NOT_FOUND), hanya versi
 * AWAITING_CONFIRM, file dicek ada sebelum lock, rencana berubah → PLAN_STALE, acuan cast basi → file
 * diproses ulang (UPLOADED + antre) atau minta unggah ulang, integritas gagal → versi FAILED. Prisma,
 * storage, antrean, dan commit (diuji di period-commit.test.ts) dimock.
 */
const prisma = {
  datasetVersion: { findFirst: vi.fn(), updateMany: vi.fn() },
  dataset: { findUnique: vi.fn() },
  segment: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: () => ({
    PERIOD_KEEP_DEFAULT: 24,
    PERIOD_KEEP_MAX: 60,
    PERIOD_SHEET_MAX_ROWS: 10_000_000,
    DATASET_MAX_DATA_BYTES: 16 * 1024 ** 3,
    PERIOD_SHEET_MAX_SEGMENTS: 120,
    PERIOD_SHRINK_CONFIRM_PCT: 50,
    PERIOD_STRAY_PCT: 10,
    PERIOD_WARN_PCT: 80,
  }),
}));
const enqueueIngest = vi.fn(async () => {});
vi.mock("@/lib/queue/versions", () => ({ enqueueIngest }));
const objectExists = vi.fn(async (_key: string) => true);
vi.mock("@/lib/storage/objects", () => ({ objectExists }));
const forgetLocalParquet = vi.fn();
vi.mock("@/features/query/local-parquet", () => ({ forgetLocalParquet }));
vi.mock("@/features/query/warm", () => ({ announceVersionActivated: vi.fn(async () => {}) }));
vi.mock("@/lib/redis", () => ({ redisReady: async () => ({}) }));
const commitPeriodInTx = vi.fn();
vi.mock("@/features/versions/period-commit", async (orig) => ({
  ...(await orig<typeof import("@/features/versions/period-commit")>()),
  commitPeriodInTx,
}));

const svc = await import("@/features/versions/period-upload");
const { IntegrityError } = await import("@/features/versions/integrity-check");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const V = "cmv4kljx40009oczvdmpurrv2";
const plan = computePeriodPlan({
  grain: "MONTH",
  source: "COLUMN",
  baseVersionId: "aktif",
  active: [{ key: "2026-03", start: "2026-03-01", sheets: { l1: { rows: 10, bytes: 10 } } }],
  incoming: [{ key: "2026-03", start: "2026-03-01", sheets: { l1: { rows: 9, bytes: 10 } } }],
  incomingSheets: ["l1"],
  settings: { keepPeriods: null, onLimit: "REJECT" },
  limits: {
    keepDefault: 24,
    keepMax: 60,
    sheetMaxRows: 10_000_000,
    datasetMaxBytes: 16 * 1024 ** 3,
    sheetMaxSegments: 120,
    shrinkConfirmPct: 50,
    strayPct: 10,
    warnPct: 80,
  },
});
const payload = (over: Record<string, unknown> = {}) => ({
  include: [],
  digest: periodPlanDigest(plan),
  ack: { shrink: false, droppedRows: 0 },
  ...over,
});
const confirm = (p: unknown = payload()) => svc.confirmPeriodUpload(OWNER, DS, V, p, "1.2.3.4");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.datasetVersion.findFirst.mockResolvedValue({
    id: V,
    status: "AWAITING_CONFIRM",
    mode: "PERIOD",
    originalName: "maret.csv",
    sourceDeletedAt: null,
  });
  prisma.dataset.findUnique.mockResolvedValue({ activeVersion: { sheets: [] } });
  prisma.segment.findMany.mockResolvedValue([
    {
      rawKey: "parquet/a/seg/b/raw.parquet",
      typed: [{ typedKey: "parquet/a/seg/b/typed-2.parquet" }],
    },
  ]);
  prisma.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
  objectExists.mockResolvedValue(true);
});

describe("reviewPeriodUpload", () => {
  it("rencana hitung ulang (dryRun) + sidik + kalimat; bukan pemilik → NOT_FOUND", async () => {
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "preview", plan });
    const r = await svc.reviewPeriodUpload(OWNER, DS, V, { include: ["2026-02"] });
    expect(r).toMatchObject({
      ok: true,
      data: { digest: periodPlanDigest(plan), summary: "Maret 2026 diganti (10 → 9 baris)" },
    });
    expect(commitPeriodInTx.mock.calls[0]![1]).toMatchObject({
      dryRun: true,
      include: ["2026-02"],
      from: "AWAITING_CONFIRM",
    });
    prisma.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect(await svc.reviewPeriodUpload("lain", DS, V, { include: [] })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await svc.reviewPeriodUpload(OWNER, DS, V, { include: ["; DROP"] })).toMatchObject({
      code: "INVALID",
    });
  });
});

describe("confirmPeriodUpload", () => {
  it("rencana sama → aktif; kunci yang ada diteruskan sebagai bukti; salinan lokal versi terbuang dilupakan", async () => {
    commitPeriodInTx.mockResolvedValueOnce({
      outcome: "activated",
      plan,
      deletedTypedKeys: ["x"],
      datasetId: DS,
    });
    expect(await confirm()).toEqual({
      ok: true,
      data: { fileName: "maret.csv", summary: "Maret 2026 diganti (10 → 9 baris)" },
    });
    const args = commitPeriodInTx.mock.calls[0]![1];
    expect(args).toMatchObject({
      versionId: V,
      from: "AWAITING_CONFIRM",
      mode: { kind: "confirm", digest: periodPlanDigest(plan) },
      audit: { actorId: OWNER, ip: "1.2.3.4" },
    });
    expect([...args.present].sort()).toEqual([
      "parquet/a/seg/b/raw.parquet",
      "parquet/a/seg/b/typed-2.parquet",
    ]);
    expect(forgetLocalParquet).toHaveBeenCalledWith(["x"]);
  });

  it("kunci hilang tidak masuk bukti (fail-closed di commit); HEAD gagal → DATASET_BUSY tanpa commit", async () => {
    objectExists.mockImplementation(async (k: string) => !k.endsWith("raw.parquet"));
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "plan_stale", plan });
    await confirm();
    expect([...commitPeriodInTx.mock.calls[0]![1].present]).toEqual([
      "parquet/a/seg/b/typed-2.parquet",
    ]);
    objectExists.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await confirm()).toMatchObject({ code: "DATASET_BUSY" });
    expect(commitPeriodInTx).toHaveBeenCalledTimes(1);
  });

  it("rencana berubah sejak ditinjau → PLAN_STALE", async () => {
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "plan_stale", plan });
    expect(await confirm()).toMatchObject({ ok: false, code: "PLAN_STALE" });
  });

  it("centang kurang → INVALID dengan pesannya", async () => {
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "blocked", plan, message: "Centang dulu." });
    expect(await confirm()).toEqual({ ok: false, code: "INVALID", message: "Centang dulu." });
  });

  it("acuan cast basi → file diproses ulang (UPLOADED + antre) dan PLAN_STALE; file asli terhapus → INVALID", async () => {
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "stale" });
    expect(await confirm()).toMatchObject({
      code: "PLAN_STALE",
      message: expect.stringMatching(/diproses ulang/),
    });
    expect(prisma.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: V, status: "AWAITING_CONFIRM", sourceDeletedAt: null },
      data: expect.objectContaining({ status: "UPLOADED" }),
    });
    expect(enqueueIngest).toHaveBeenCalledWith(V, DS);
    commitPeriodInTx.mockResolvedValueOnce({ outcome: "stale" });
    prisma.datasetVersion.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await confirm()).toMatchObject({
      code: "INVALID",
      message: expect.stringMatching(/unggah ulang/),
    });
  });

  it("gerbang integritas gagal → versi FAILED, data aktif tidak berubah", async () => {
    commitPeriodInTx.mockRejectedValueOnce(new IntegrityError(["file data tidak ada: k"]));
    expect(await confirm()).toMatchObject({ code: "INVALID" });
    expect(prisma.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: V, status: "AWAITING_CONFIRM" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("bukan pemilik → NOT_FOUND; bukan AWAITING_CONFIRM → INVALID; isian salah → INVALID; tanpa commit", async () => {
    prisma.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect(await confirm()).toMatchObject({ code: "NOT_FOUND" });
    prisma.datasetVersion.findFirst.mockResolvedValueOnce({
      id: V,
      status: "READY",
      mode: "PERIOD",
    });
    expect(await confirm()).toMatchObject({ code: "INVALID" });
    expect(await confirm(payload({ digest: "x" }))).toMatchObject({ code: "INVALID" });
    expect(await confirm(payload({ extra: 1 }))).toMatchObject({ code: "INVALID" });
    expect(await svc.confirmPeriodUpload(OWNER, "../x", V, payload(), "ip")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(commitPeriodInTx).not.toHaveBeenCalled();
  });
});
