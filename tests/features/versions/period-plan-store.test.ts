import { beforeEach, describe, expect, it, vi } from "vitest";

/* T-050: rencana periode dibekukan di DatasetVersion.plan, hanya selama versi non-terminal. */
const prisma = { datasetVersion: { updateMany: vi.fn() } };
vi.mock("@/lib/db", () => ({ prisma }));

const { freezePeriodPlan } = await import("@/features/versions/period-plan-store");
const { computePeriodPlan, parseFrozenPeriodPlan } = await import("@/features/ingest/period-plan");

const plan = computePeriodPlan({
  grain: "MONTH",
  source: "COLUMN",
  baseVersionId: "v1",
  active: [{ key: "2026-03", start: "2026-03-01", sheets: { L: { rows: 10, bytes: 100 } } }],
  incoming: [{ key: "2026-04", start: "2026-04-01", sheets: { L: { rows: 5, bytes: 50 } } }],
  incomingSheets: ["L"],
  settings: { keepPeriods: null, onLimit: "REJECT" },
  limits: {
    keepDefault: 24,
    keepMax: 60,
    sheetMaxRows: 10_000_000,
    datasetMaxBytes: 2 ** 34,
    sheetMaxSegments: 120,
    shrinkConfirmPct: 50,
    strayPct: 10,
    warnPct: 80,
  },
});

describe("freezePeriodPlan", () => {
  beforeEach(() => prisma.datasetVersion.updateMany.mockReset());

  it("menulis rencana JSON ke versi non-terminal; bisa dibaca kembali utuh", async () => {
    prisma.datasetVersion.updateMany.mockResolvedValue({ count: 1 });
    await expect(freezePeriodPlan("ver1", plan)).resolves.toBe(true);
    const arg = prisma.datasetVersion.updateMany.mock.calls[0]![0];
    expect(arg.where.id).toBe("ver1");
    expect(arg.where.status.in).toEqual(expect.arrayContaining(["INGESTING", "AWAITING_CONFIRM"]));
    expect(arg.where.status.in).not.toContain("READY");
    expect(arg.where.status.in).not.toContain("FAILED");
    expect(parseFrozenPeriodPlan(JSON.parse(JSON.stringify(arg.data.plan)))).toEqual(plan);
  });

  it("versi terminal atau tidak ada → false (rencana beku tidak ditimpa)", async () => {
    prisma.datasetVersion.updateMany.mockResolvedValue({ count: 0 });
    await expect(freezePeriodPlan("ver1", plan)).resolves.toBe(false);
  });

  it("rencana salah bentuk ditolak sebelum menyentuh DB", async () => {
    await expect(freezePeriodPlan("ver1", { ...plan, v: 2 } as never)).rejects.toThrow();
    expect(prisma.datasetVersion.updateMany).not.toHaveBeenCalled();
  });
});
