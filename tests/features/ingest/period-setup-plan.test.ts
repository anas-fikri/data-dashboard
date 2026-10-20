import { describe, expect, it } from "vitest";
import type { PeriodLimits } from "@/features/ingest/period-plan";
import {
  buildSetupPreview,
  capacityProjection,
  periodColumnOf,
  periodSettingsSchema,
  periodSetupSchema,
  resetBlockers,
  setupHistoryNote,
  type SheetDistribution,
} from "@/features/ingest/period-setup-plan";
import type { ColumnSchema } from "@/features/ingest/infer";

/* "Atur periode" (T-051) — bagian murni: validasi isian, Tinjau (rencana + alasan nonaktif), proyeksi. */

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
const SHEET = "cmv4klj5r0007oczvgiofocpg";

const months = (n: number, rows = 1000) =>
  Array.from({ length: n }, (_, i) => {
    const y = 2024 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return { start: `${y}-${String(m).padStart(2, "0")}-01`, rows };
  });

const dist = (over: Partial<SheetDistribution> = {}): SheetDistribution => ({
  sheetId: SHEET,
  lineageId: "l1",
  name: "Pengiriman",
  source: "COLUMN",
  column: { pos: 2, name: "Tanggal Kirim" },
  totalRows: 3000,
  periods: months(3),
  missing: 0,
  missingSamples: [],
  bytes: 3_000_000,
  ...over,
});

const preview = (sheets: SheetDistribution[], keepPeriods: number | null = null, dropMissing = 0) =>
  buildSetupPreview({
    grain: "MONTH",
    baseVersionId: "base",
    sheets,
    settings: { keepPeriods, onLimit: "REJECT" },
    limits: LIMITS,
    dropMissing,
  });

describe("skema isian", () => {
  const input = {
    grain: "MONTH",
    sheets: [{ sheetId: SHEET, source: "COLUMN", column: 2 }],
    label: null,
    keepPeriods: null,
    onLimit: "REJECT",
    dropMissing: 0,
  };

  it("'Simpan N periode' > PERIOD_KEEP_MAX ditolak dengan pesan (AC 4); null = bawaan", () => {
    const s = periodSetupSchema(60);
    expect(s.safeParse(input).success).toBe(true);
    const over = s.safeParse({ ...input, keepPeriods: 61 });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toBe("Simpan paling banyak 60 periode.");
    expect(s.safeParse({ ...input, keepPeriods: 0 }).success).toBe(false);
    expect(s.safeParse({ ...input, keepPeriods: 2.5 }).success).toBe(false);
    expect(
      periodSettingsSchema(60).safeParse({ keepPeriods: 60, onLimit: "EVICT_OLDEST" }).success,
    ).toBe(true);
    expect(periodSettingsSchema(60).safeParse({ keepPeriods: 61, onLimit: "REJECT" }).success).toBe(
      false,
    );
    expect(periodSettingsSchema(60).safeParse({ keepPeriods: 1, onLimit: "DROP" }).success).toBe(
      false,
    );
  });

  it("kolom wajib untuk sumber kolom; label wajib awal periode satuan untuk sumber label; field asing ditolak", () => {
    const s = periodSetupSchema(60);
    expect(
      s.safeParse({ ...input, sheets: [{ sheetId: SHEET, source: "COLUMN", column: null }] })
        .success,
    ).toBe(false);
    const label = { ...input, sheets: [{ sheetId: SHEET, source: "LABEL", column: null }] };
    expect(s.safeParse(label).success).toBe(false);
    expect(s.safeParse({ ...label, label: "2026-03-15" }).success).toBe(false);
    expect(s.safeParse({ ...label, label: "2026-03-01" }).success).toBe(true);
    expect(s.safeParse({ ...label, grain: "QUARTER", label: "2026-03-01" }).success).toBe(false);
    expect(s.safeParse({ ...label, grain: "QUARTER", label: "2026-01-01" }).success).toBe(true);
    expect(s.safeParse({ ...input, sql: "DROP TABLE x" }).success).toBe(false);
    expect(s.safeParse({ ...input, sheets: [...input.sheets, ...input.sheets] }).success).toBe(
      false,
    );
  });
});

describe("periodColumnOf", () => {
  const schema = [
    { pos: 1, type: "text" },
    { pos: 2, type: "date" },
    { pos: 3, type: "timestamp" },
    { pos: 4, type: "date", absent: true },
  ] as ColumnSchema[];
  it("hanya kolom date/timestamp yang ada di file", () => {
    expect([1, 2, 3, 4, 9].map((p) => periodColumnOf(schema, p)?.pos ?? null)).toEqual([
      null,
      2,
      3,
      null,
      null,
    ]);
  });
});

describe("buildSetupPreview", () => {
  it("semua periode ikut, termasuk yang sangat kecil (tidak ada baris yang hilang diam-diam)", () => {
    const p = preview([dist({ periods: [...months(3), { start: "2024-04-01", rows: 1 }] })]);
    expect(p.plan.rejection).toBeNull();
    expect(p.plan.entries.map((e) => e.action)).toEqual(["ADDED", "ADDED", "ADDED", "ADDED"]);
    expect(p.plan.totals.after).toEqual({ l1: 3001 });
    expect(p.blockers).toEqual([]);
    expect(p.needsDrop).toBe(false);
  });

  it("baris tanpa tanggal valid → wajib 'Buang N baris'; jumlahnya beku di rencana (AC 2)", () => {
    const d = dist({ missing: 7, missingSamples: [3, 9] });
    expect(preview([d])).toMatchObject({ missingTotal: 7, needsDrop: true, blockers: [] });
    expect(preview([d], null, 7).plan.droppedRows).toBe(7);
  });

  it("lebih banyak periode dari 'Simpan N periode' → nonaktif dengan pesan yang bisa ditindak", () => {
    const p = preview([dist({ periods: months(30), totalRows: 30_000 })]);
    expect(p.plan.rejection?.code).toBe("PERIOD_TOO_LARGE");
    expect(p.blockers).toEqual([
      'Data sekarang terbagi menjadi 30 periode, melebihi pengaturan "Simpan 24 periode". Naikkan jumlahnya (maksimal 60) atau pilih satuan yang lebih besar.',
    ]);
    // Dinaikkan ke 36 → muat.
    expect(preview([dist({ periods: months(30), totalRows: 30_000 })], 36).blockers).toEqual([]);
    // Di atas batas admin.
    expect(preview([dist({ periods: months(61), totalRows: 61_000 })], 60).blockers[0]).toMatch(
      /melebihi batas admin 60 periode/,
    );
  });

  it("sheet tanpa baris data (hanya judul) → nonaktif dengan pesan, bukan sheet kosong diam-diam", () => {
    const p = preview([dist({ periods: [], totalRows: 0 })]);
    expect(p.blockers).toHaveLength(1);
    expect(p.blockers[0]).toMatch(/^Sheet “Pengiriman” tidak berisi baris data/);
  });

  it("sheet ber-data tanpa satu pun tanggal valid → nonaktif", () => {
    const p = preview([dist({ periods: [], missing: 3000 })]);
    expect(p.blockers).toEqual([
      "Sheet “Pengiriman” tidak punya baris dengan tanggal valid di kolom periode.",
    ]);
  });

  it("dua sheet: periode digabung per kunci, baris per sheet tetap terpisah", () => {
    const p = preview([
      dist(),
      dist({ sheetId: "s2", lineageId: "l2", name: "Retur", periods: months(2, 10) }),
    ]);
    expect(p.plan.entries.map((e) => [e.key, e.after])).toEqual([
      ["2024-01", { l1: 1000, l2: 10 }],
      ["2024-02", { l1: 1000, l2: 10 }],
      ["2024-03", { l1: 1000 }],
    ]);
  });
});

describe("capacityProjection", () => {
  it("batas yang paling dulu tercapai dan sisa periode", () => {
    expect(capacityProjection([dist()], 24, LIMITS)).toEqual({
      avgRows: 1000,
      sheetName: null,
      capacity: 24,
      binding: "periods",
      remaining: 21,
    });
    // 1 jt baris per bulan → batas 10 jt baris per sheet: ±10 bulan.
    expect(
      capacityProjection(
        [dist({ periods: months(3, 1_000_000), totalRows: 3_000_000 })],
        24,
        LIMITS,
      ),
    ).toMatchObject({ capacity: 10, binding: "sheetRows", remaining: 7 });
    expect(capacityProjection([dist({ periods: [] })], 24, LIMITS)).toBeNull();
  });
});

describe("setupHistoryNote", () => {
  it("ringkasan riwayat; tanpa baris dibuang tidak menyebut pembuangan", () => {
    expect(setupHistoryNote(preview([dist()]).plan)).toBe(
      "Mode periode diaktifkan (per bulan) · 3 periode",
    );
    expect(setupHistoryNote(null)).toBeNull();
  });
});

describe("atur ulang dataset yang sudah per periode (T-qqyx)", () => {
  const current = (source: "COLUMN" | "LABEL" = "COLUMN") => ({
    grain: "MONTH" as const,
    sheets: { [SHEET]: { source, column: source === "COLUMN" ? 2 : null } },
  });
  const reset = (sheets: SheetDistribution[], grain: "MONTH" | "QUARTER" | "YEAR", c = current()) =>
    buildSetupPreview({
      grain,
      baseVersionId: "base",
      sheets,
      settings: { keepPeriods: null, onLimit: "REJECT" },
      limits: LIMITS,
      dropMissing: 0,
      current: c,
    });

  it("'Ikuti periode sekarang' (KEEP) diterima skema tanpa label", () => {
    const s = periodSetupSchema(60).safeParse({
      grain: "QUARTER",
      sheets: [{ sheetId: SHEET, source: "KEEP", column: null }],
      label: null,
      keepPeriods: null,
      onLimit: "REJECT",
      dropMissing: 0,
    });
    expect(s.success).toBe(true);
  });

  it("kelompok bagian per periode dihitung ke batas segmen per sheet dan ke sidik tinjauan", () => {
    const grouped = dist({ periods: [{ start: "2024-01-01", rows: 3000, parts: 3 }] });
    const p = reset([grouped], "QUARTER");
    expect(p.plan.usage.find((u) => u.limit === "sheetSegments")).toMatchObject({ used: 3 });
    expect(p.plan.resetFrom).toBe("MONTH");
    expect(p.blockers).toEqual([]);
    const tight = buildSetupPreview({
      grain: "QUARTER",
      baseVersionId: "base",
      sheets: [grouped],
      settings: { keepPeriods: null, onLimit: "REJECT" },
      limits: { ...LIMITS, sheetMaxSegments: 2 },
      dropMissing: 0,
      current: current(),
    });
    expect(tight.blockers[0]).toMatch(
      /terbagi menjadi 3 bagian data, melebihi batas 2 bagian per sheet/,
    );
  });

  it("sama persis dengan sekarang → nonaktif; KEEP ke satuan lebih kecil → nonaktif; kolom lain → boleh", () => {
    expect(resetBlockers("MONTH", current(), [dist()])[0]).toMatch(/sama dengan yang sekarang/);
    expect(
      resetBlockers("MONTH", current(), [dist({ column: { pos: 3, name: "Bayar" } })]),
    ).toEqual([]);
    const keep = dist({ source: "KEEP", column: null });
    expect(resetBlockers("MONTH", current("LABEL"), [keep])[0]).toMatch(/sama dengan/);
    expect(resetBlockers("QUARTER", current("LABEL"), [keep])).toEqual([]);
    const q = { ...current("LABEL"), grain: "QUARTER" as const };
    expect(resetBlockers("MONTH", q, [keep])[0]).toMatch(
      /per kuartal tidak bisa dipecah menjadi per bulan/,
    );
  });

  it("riwayat versi: satuan berubah / hanya sumber berubah", () => {
    expect(setupHistoryNote(reset([dist()], "QUARTER").plan)).toBe(
      "Periode diatur ulang (per bulan → per kuartal) · 1 periode",
    );
    expect(
      setupHistoryNote(reset([dist({ column: { pos: 3, name: "Bayar" } })], "MONTH").plan),
    ).toBe("Sumber periode diatur ulang (per bulan) · 3 periode");
  });
});
