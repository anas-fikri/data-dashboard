import { describe, expect, it } from "vitest";
import {
  computePeriodPlan,
  type PeriodLimits,
  type PeriodPlanInput,
  type PlanPeriodInput,
} from "@/features/ingest/period-plan";
import {
  formatNaiveDay,
  identicalPeriods,
  keptSheets,
  labelRange,
  requiredAcks,
  reviewRows,
} from "@/features/ingest/period-review";
import { labelReferenceColumn } from "@/features/ingest/period-setup-plan";
import type { ColumnSchema } from "@/features/ingest/infer";

/*
 * T-054 layar tinjauan unggahan periode (bagian murni): tabel Periode | Sekarang | Setelah | Keterangan,
 * centang wajib (menyusut > 50%, dilepas, buang baris), file identik, sheet yang dipertahankan, dan
 * peringatan rentang kolom tanggal acuan di luar label.
 */

const LIMITS: PeriodLimits = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * 1024 ** 3,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};

const month = (ym: string, rows: Record<string, number>, sha?: string): PlanPeriodInput => ({
  key: ym,
  start: `${ym}-01`,
  sheets: Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { rows: r, bytes: r * 10 }])),
  sha256: sha ?? null,
});

const plan = (over: Partial<PeriodPlanInput>) =>
  computePeriodPlan({
    grain: "MONTH",
    source: "COLUMN",
    baseVersionId: "v1",
    active: [],
    incoming: [],
    incomingSheets: ["A"],
    settings: { keepPeriods: null, onLimit: "REJECT" },
    limits: LIMITS,
    ...over,
  });

const SHEETS = [{ lineageId: "A", name: "Pengiriman" }];

describe("reviewRows", () => {
  it("hanya periode file + yang dilepas; sekarang → setelah; sisanya dihitung", () => {
    const p = plan({
      active: [month("2026-01", { A: 10 }), month("2026-02", { A: 12400 })],
      incoming: [month("2026-02", { A: 12950 }), month("2026-03", { A: 5000 })],
    });
    const { rows, unchanged } = reviewRows(p, SHEETS);
    expect(unchanged).toBe(1);
    expect(rows.map((r) => [r.label, r.before, r.after, r.note])).toEqual([
      ["Februari 2026", 12400, 12950, "Diganti"],
      ["Maret 2026", null, 5000, "Baru"],
    ]);
    // Satu sheet: tanpa rincian per sheet.
    expect(rows[0]!.sheets).toEqual([]);
  });

  it("dilepas karena batas 24 periode tampil di tabel dan wajib dicentang", () => {
    const active = Array.from({ length: 24 }, (_, i) => {
      const t = new Date(Date.UTC(2024, i, 1));
      return month(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`, {
        A: 100,
      });
    });
    const p = plan({
      active,
      incoming: [month("2026-01", { A: 100 })],
      settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
    });
    const { rows, unchanged } = reviewRows(p, SHEETS);
    expect(rows.map((r) => [r.label, r.before, r.after, r.note])).toEqual([
      ["Januari 2024", 100, null, "Dilepas karena batas 24 periode"],
      ["Januari 2026", null, 100, "Baru"],
    ]);
    expect(unchanged).toBe(23);
    expect(requiredAcks(p)).toEqual([
      { kind: "evict", text: "Saya paham Januari 2024 dilepas dari data aktif" },
    ]);
  });

  it("multi sheet: rincian per sheet, sheet yang tidak ada di file dipertahankan", () => {
    const sheets = [
      { lineageId: "A", name: "Pengiriman" },
      { lineageId: "B", name: "Retur" },
    ];
    const p = plan({
      active: [month("2026-02", { A: 100, B: 7 })],
      incoming: [month("2026-02", { A: 120 })],
      incomingSheets: ["A"],
    });
    const [row] = reviewRows(p, sheets).rows;
    expect(row!.sheets).toEqual([
      { name: "Pengiriman", before: 100, after: 120 },
      { name: "Retur", before: 7, after: 7 },
    ]);
    expect(keptSheets(p, sheets)).toEqual(["Retur"]);
    expect(keptSheets(p, SHEETS)).toEqual([]);
  });

  it("periode nyasar: bawaan dikecualikan dengan baris file; dimasukkan → diganti", () => {
    const base = {
      active: [month("2026-01", { A: 50 })],
      incoming: [month("2026-01", { A: 3 }), month("2026-02", { A: 100 })],
    };
    const excluded = plan(base);
    const rows = reviewRows(excluded, SHEETS, { "2026-01": 3, "2026-02": 100 }).rows;
    expect(rows[0]).toMatchObject({
      label: "Januari 2026",
      action: "EXCLUDED",
      note: "Dikecualikan — data lama tetap",
      stray: true,
      fileRows: 3,
      before: 50,
      after: 50,
    });
    expect(rows[0]!.flags.some((f) => f.startsWith("Kemungkinan nyasar"))).toBe(true);
    const included = plan({ ...base, include: ["2026-01"] });
    expect(reviewRows(included, SHEETS).rows[0]).toMatchObject({
      action: "REPLACED",
      note: "Diganti",
      after: 3,
    });
    // 50 → 3 = menyusut > 50%: wajib dicentang dengan nama periode.
    expect(requiredAcks(included)).toEqual([
      {
        kind: "shrink",
        text: "Saya paham Januari 2026 diganti dengan data yang lebih sedikit",
      },
    ]);
  });
});

describe("requiredAcks / identicalPeriods", () => {
  it("menyusut tepat 50% tidak wajib; > 50% wajib; buang baris; ditolak = tanpa centang", () => {
    const half = plan({
      active: [month("2026-02", { A: 2 })],
      incoming: [month("2026-02", { A: 1 })],
    });
    expect(requiredAcks(half)).toEqual([]);
    const shrink = plan({
      active: [month("2026-02", { A: 4 }), month("2026-03", { A: 10 })],
      incoming: [month("2026-02", { A: 1 }), month("2026-03", { A: 2 })],
      droppedRows: 1200,
    });
    expect(requiredAcks(shrink)).toEqual([
      {
        kind: "shrink",
        text: "Saya paham Februari 2026 dan Maret 2026 diganti dengan data yang lebih sedikit",
      },
      { kind: "dropped", text: "Buang 1.200 baris tanpa tanggal valid" },
    ]);
    const rejected = plan({
      active: [month("2026-02", { A: 4 })],
      incoming: [month("2026-03", { A: 4 })],
      settings: { keepPeriods: 1, onLimit: "REJECT" },
    });
    expect(rejected.rejection).not.toBeNull();
    expect(requiredAcks(rejected)).toEqual([]);
    expect(reviewRows(rejected, SHEETS).rows[0]!.note).toBe("Ditolak");
  });

  it("sha256 sama dengan file asal periode → 'File ini identik dengan periode Maret 2026'", () => {
    const p = plan({
      active: [month("2026-03", { A: 5 }, "abc")],
      incoming: [month("2026-03", { A: 5 })],
      fileSha256: "abc",
    });
    expect(identicalPeriods(p)).toEqual(["Maret 2026"]);
    expect(reviewRows(p, SHEETS).rows[0]!.flags).toContain(
      "File ini identik dengan periode Maret 2026",
    );
    const other = plan({
      active: [month("2026-03", { A: 5 }, "abc")],
      incoming: [month("2026-03", { A: 5 })],
      fileSha256: "def",
    });
    expect(identicalPeriods(other)).toEqual([]);
  });
});

describe("labelRange / labelReferenceColumn", () => {
  it("rentang di luar label → outside; di dalam → tidak; jam diabaikan", () => {
    const out = labelRange("MONTH", {
      sheet: "Data",
      column: "Tanggal Kirim",
      start: "2026-05-01",
      min: "2026-04-02 00:00:00",
      max: "2026-04-30 23:59:00",
    });
    expect(out).toEqual({
      sheet: "Data",
      column: "Tanggal Kirim",
      start: "2026-05-01",
      period: "Mei 2026",
      min: "2026-04-02",
      max: "2026-04-30",
      outside: true,
    });
    expect(
      labelRange("MONTH", {
        sheet: "Data",
        column: "Tgl",
        start: "2026-05-01",
        min: "2026-05-01 00:00:00",
        max: "2026-05-31 23:59:59",
      }).outside,
    ).toBe(false);
    // Hanya satu ujung di luar label tetap peringatan; kuartal memakai awal kuartal.
    expect(
      labelRange("QUARTER", {
        sheet: "Data",
        column: "Tgl",
        start: "2026-04-01",
        min: "2026-04-10",
        max: "2026-07-01",
      }),
    ).toMatchObject({ outside: true, period: "Kuartal 2 2026" });
  });

  it("kolom acuan = date/timestamp pertama yang ada di file", () => {
    const schema = [
      { pos: 3, name: "Tgl Bayar", type: "date" },
      { pos: 1, name: "Kode", type: "text" },
      { pos: 2, name: "Tgl Kirim", type: "timestamp", absent: true },
      { pos: 4, name: "Tgl Retur", type: "date" },
    ] as unknown as ColumnSchema[];
    expect(labelReferenceColumn(schema)?.name).toBe("Tgl Bayar");
    expect(labelReferenceColumn(null)).toBeNull();
    expect(labelReferenceColumn([schema[1]!])).toBeNull();
  });

  it("formatNaiveDay tidak bergeser zona", () => {
    expect(formatNaiveDay("2026-04-02")).toBe("2 Apr 2026");
  });
});
