import { describe, expect, it } from "vitest";
import { headerSignature, pickMergeTarget } from "@/features/ingest/period-merge";
import { computePeriodPlan, periodPlanSchema } from "@/features/ingest/period-plan";
import { parsePeriodMeta } from "@/features/ingest/period-upload-plan";

/*
 * T-jsmj: pemilihan sheet data untuk sheet file tambahan (murni) + rencana periode dengan sheet tergabung
 * (selalu ditinjau; rencana/periodMeta lama tanpa field tetap terbaca).
 */
const cols = (...names: string[]) => names.map((original) => ({ original }));

describe("headerSignature", () => {
  it("nama dinormalkan (huruf besar/spasi), urutan dan judul kembar dihitung", () => {
    expect(headerSignature(cols("No Resi", "Tanggal"))).toBe(
      headerSignature(cols("no  resi", "TANGGAL")),
    );
    expect(headerSignature(cols("A", "B"))).not.toBe(headerSignature(cols("B", "A")));
    expect(headerSignature(cols("A", "A"))).not.toBe(headerSignature(cols("A")));
  });
});

describe("pickMergeTarget", () => {
  const sig = headerSignature(cols("kode", "tanggal", "nilai"));
  const other = headerSignature(cols("total"));

  it("ikut sheet data yang sudah berpasangan bila judulnya sama; beda judul → tidak", () => {
    const primary = new Map([["L1", sig]]);
    expect(pickMergeTarget([{ lineageId: "L1", sig, exact: false }], primary)).toEqual({
      lineageId: "L1",
    });
    expect(pickMergeTarget([{ lineageId: "L1", sig: other, exact: true }], primary)).toEqual({
      reason: "none",
    });
  });

  it("sheet data tanpa pasangan di file → hanya bila cocok persis dengan skema aktif", () => {
    const primary = new Map<string, string>();
    expect(pickMergeTarget([{ lineageId: "L1", sig, exact: true }], primary)).toEqual({
      lineageId: "L1",
    });
    expect(pickMergeTarget([{ lineageId: "L1", sig, exact: false }], primary)).toEqual({
      reason: "none",
    });
  });

  it("cocok dengan dua sheet data → tidak ditebak (diabaikan)", () => {
    const primary = new Map([["L1", sig]]);
    expect(
      pickMergeTarget(
        [
          { lineageId: "L1", sig, exact: true },
          { lineageId: "L2", sig, exact: true },
        ],
        primary,
      ),
    ).toEqual({ reason: "ambiguous" });
  });
});

describe("rencana dengan sheet tergabung", () => {
  const base = {
    grain: "MONTH" as const,
    source: "COLUMN" as const,
    baseVersionId: "v1",
    active: [],
    incoming: [{ key: "2026-04", start: "2026-04-01", sheets: { A: { rows: 10, bytes: 10 } } }],
    incomingSheets: ["A"],
    settings: { keepPeriods: null, onLimit: "REJECT" as const },
    limits: {
      keepDefault: 24,
      keepMax: 60,
      sheetMaxRows: 1_000_000,
      datasetMaxBytes: 1e12,
      sheetMaxSegments: 120,
      shrinkConfirmPct: 50,
      strayPct: 10,
      warnPct: 80,
    },
  };

  it("murni menambah + sheet tergabung → MERGED_SHEETS, tidak aktif otomatis; tanpa gabungan tetap otomatis", () => {
    const p = computePeriodPlan({
      ...base,
      mergedSheets: [{ sheet: "Data", from: ["Bagian 1", "Bagian 2"] }],
    });
    expect(p.confirm).toEqual(["MERGED_SHEETS"]);
    expect(p.autoActivate).toBe(false);
    expect(p.mergedSheets).toEqual([{ sheet: "Data", from: ["Bagian 1", "Bagian 2"] }]);
    expect(computePeriodPlan(base).autoActivate).toBe(true);
  });

  it("rencana beku dan periodMeta lama tanpa field → kosong (bukan galat)", () => {
    const p = computePeriodPlan(base);
    const { mergedSheets: _m, ...old } = p;
    expect(periodPlanSchema.parse(old).mergedSheets).toEqual([]);
    expect(parsePeriodMeta({ ignoredSheets: ["X"], changes: [] })).toMatchObject({
      ignoredSheets: ["X"],
      mergedSheets: [],
    });
  });
});
