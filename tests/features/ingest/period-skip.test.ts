import { describe, expect, it } from "vitest";
import { computePeriodPlan, type PeriodPlanInput } from "@/features/ingest/period-plan";
import { reviewRows } from "@/features/ingest/period-review";
import { periodPlanSummary } from "@/features/ingest/period-upload-plan";

/*
 * v1.19 "Lewati periode ini" di tinjauan: periode file yang dilewati → data lama tetap (EXCLUDED, bukan
 * diganti), tidak butuh centang menyusut, ringkasan menyebutnya; periode lain tetap diterapkan.
 */
const slice = (rows: number) => ({ A: { rows, bytes: rows } });
const base: PeriodPlanInput = {
  grain: "MONTH",
  source: "COLUMN",
  baseVersionId: "v1",
  active: [
    { key: "2026-03", start: "2026-03-01", sheets: slice(33_992) },
    { key: "2026-04", start: "2026-04-01", sheets: slice(115_741) },
  ],
  incoming: [
    { key: "2026-03", start: "2026-03-01", sheets: slice(90_768) },
    { key: "2026-04", start: "2026-04-01", sheets: slice(34_024) },
  ],
  incomingSheets: ["A"],
  settings: { keepPeriods: null, onLimit: "REJECT" },
  limits: {
    keepDefault: 24,
    keepMax: 60,
    sheetMaxRows: 10_000_000,
    datasetMaxBytes: 1e12,
    sheetMaxSegments: 120,
    shrinkConfirmPct: 50,
    strayPct: 10,
    warnPct: 80,
  },
};
const entry = (p: ReturnType<typeof computePeriodPlan>, key: string) =>
  p.entries.find((e) => e.key === key)!;

describe("lewati periode", () => {
  it("tanpa pilihan: April menyusut (wajib centang); dilewati: April tetap 115.741, Maret tetap diganti", () => {
    const all = computePeriodPlan(base);
    expect(entry(all, "2026-04")).toMatchObject({ action: "REPLACED", shrink: true });
    expect(all.confirm).toContain("SHRINK");

    const p = computePeriodPlan({ ...base, skip: ["2026-04", "2099-01"] });
    expect(p.skip).toEqual(["2026-04"]); // periode yang tidak ada di file dibuang
    expect(entry(p, "2026-04")).toMatchObject({
      action: "EXCLUDED",
      afterRows: 115_741,
      shrink: false,
    });
    expect(entry(p, "2026-03")).toMatchObject({ action: "REPLACED", afterRows: 90_768 });
    expect(p.confirm).not.toContain("SHRINK");
    expect(p.totals.after).toEqual({ A: 90_768 + 115_741 });
    expect(periodPlanSummary(p)).toContain("April 2026 dilewati (data lama tetap)");
  });

  it("semua periode dilewati → tidak ada perubahan (tidak bisa diterapkan)", () => {
    const p = computePeriodPlan({ ...base, skip: ["2026-03", "2026-04"] });
    expect(p.confirm).toContain("NO_CHANGE");
  });

  it("tabel tinjauan: periode diganti bisa dilewati; yang dilewati bertanda 'Dilewati — data lama tetap'", () => {
    const sheets = [{ lineageId: "A", name: "Data" }];
    const before = reviewRows(computePeriodPlan(base), sheets).rows;
    expect(before.map((r) => [r.key, r.skippable, r.skipped])).toEqual([
      ["2026-03", true, false],
      ["2026-04", true, false],
    ]);
    const after = reviewRows(computePeriodPlan({ ...base, skip: ["2026-04"] }), sheets).rows;
    const apr = after.find((r) => r.key === "2026-04")!;
    expect(apr).toMatchObject({
      skippable: true,
      skipped: true,
      note: "Dilewati — data lama tetap",
    });
    expect(apr.after).toBe(115_741);
  });

  it("periode baru (belum ada di data) tidak ditawari 'Lewati'", () => {
    const p = computePeriodPlan({
      ...base,
      incoming: [{ key: "2026-05", start: "2026-05-01", sheets: slice(100) }],
    });
    expect(reviewRows(p, [{ lineageId: "A", name: "Data" }]).rows[0]!.skippable).toBe(false);
  });

  it("review: lewatan yang membuat rencana ditolak (batas baris) tetap bisa dibatalkan", () => {
    const p = computePeriodPlan({
      ...base,
      limits: { ...base.limits, sheetMaxRows: 200_000 },
      skip: ["2026-04"],
    });
    expect(p.rejection).not.toBeNull();
    const apr = reviewRows(p, [{ lineageId: "A", name: "Data" }]).rows.find(
      (r) => r.key === "2026-04",
    )!;
    expect(apr).toMatchObject({ skipped: true, skippable: true });
  });

  it("review: EVICT_OLDEST — periode terlama yang dilewati tidak dilepas diam-diam (ditolak)", () => {
    const p = computePeriodPlan({
      ...base,
      active: [
        { key: "2026-03", start: "2026-03-01", sheets: slice(150_000) },
        { key: "2026-04", start: "2026-04-01", sheets: slice(40_000) },
      ],
      incoming: [
        { key: "2026-03", start: "2026-03-01", sheets: slice(60_000) },
        { key: "2026-04", start: "2026-04-01", sheets: slice(100_000) },
      ],
      settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
      limits: { ...base.limits, sheetMaxRows: 200_000 },
      skip: ["2026-03"],
    });
    expect(p.entries.find((e) => e.key === "2026-03")!.action).not.toBe("EVICTED");
    expect(p.rejection?.code).toBe("PERIOD_OUT_OF_WINDOW");
  });

  it("review: skip untuk periode baru atau nyasar diabaikan (hanya periode yang punya data lama)", () => {
    const p = computePeriodPlan({
      ...base,
      incoming: [
        ...base.incoming,
        { key: "2026-05", start: "2026-05-01", sheets: slice(100_000) },
        { key: "2026-01", start: "2026-01-01", sheets: slice(3) },
      ],
      active: [...base.active, { key: "2026-01", start: "2026-01-01", sheets: slice(10) }],
      include: ["2026-01"],
      skip: ["2026-05", "2026-01"],
    });
    expect(p.skip).toEqual([]);
    expect(p.entries.find((e) => e.key === "2026-05")!.action).toBe("ADDED");
    expect(p.entries.find((e) => e.key === "2026-01")!.action).toBe("REPLACED");
  });
});
