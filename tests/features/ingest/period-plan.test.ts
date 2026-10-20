import { describe, expect, it } from "vitest";
import {
  computePeriodPlan,
  parseFrozenPeriodPlan,
  periodLimits,
  type PeriodLimits,
  type PeriodPlan,
  type PeriodPlanInput,
  type PeriodSlice,
  type PlanPeriodInput,
} from "@/features/ingest/period-plan";
import {
  isIsoDate,
  periodKeyOf,
  periodLabel,
  periodStartOf,
  type PeriodGrain,
} from "@/features/ingest/period";

/*
 * T-050: computePeriodPlan (rencana G-6 §4.5, §5). Contoh tetap untuk AC1–3, lalu uji berbasis
 * properti (PRNG berbenih, ≥ 1.000 kasus) yang memeriksa semua invarian secara independen dari
 * implementasi: periode utuh, pelepasan = awalan terlama tanpa periode unggahan, penolakan tidak
 * melepas apa pun, hasil selalu dalam batas, minimal, deterministik, dan beku sebagai JSON.
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

/** n bulan berurutan mulai `from` (YYYY-MM), masing-masing `rows` baris di sheet "A". */
function months(from: string, n: number, rows = 1000): PlanPeriodInput[] {
  const [y, m] = from.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 + i, 1));
    const ym = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    return month(ym, { A: rows });
  });
}

function input(over: Partial<PeriodPlanInput>): PeriodPlanInput {
  return {
    grain: "MONTH",
    source: "COLUMN",
    baseVersionId: "v1",
    active: [],
    incoming: [],
    incomingSheets: ["A"],
    settings: { keepPeriods: null, onLimit: "REJECT" },
    limits: LIMITS,
    ...over,
  };
}

const actions = (p: PeriodPlan) => Object.fromEntries(p.entries.map((e) => [e.key, e.action]));

describe("computePeriodPlan — contoh (AC1)", () => {
  it("periode baru ditambahkan, aktif otomatis, baris sebelum → sesudah", () => {
    const p = computePeriodPlan(
      input({ active: months("2026-01", 3), incoming: [month("2026-04", { A: 12950 })] }),
    );
    expect(actions(p)).toEqual({
      "2026-01": "UNCHANGED",
      "2026-02": "UNCHANGED",
      "2026-03": "UNCHANGED",
      "2026-04": "ADDED",
    });
    const apr = p.entries.at(-1)!;
    expect(apr).toMatchObject({ label: "April 2026", before: null, after: { A: 12950 } });
    expect(p.totals).toMatchObject({ before: { A: 3000 }, after: { A: 15950 }, periodsAfter: 4 });
    expect(p.rejection).toBeNull();
    expect(p.confirm).toEqual([]);
    expect(p.autoActivate).toBe(true);
  });

  it("periode yang ada diganti utuh hanya di sheet yang ada di file; sheet lain tetap", () => {
    const p = computePeriodPlan(
      input({
        active: [month("2026-02", { A: 12400, B: 50 }), month("2026-03", { A: 100, B: 5 })],
        incoming: [month("2026-02", { A: 12950 })],
        incomingSheets: ["A"],
      }),
    );
    const feb = p.entries[0]!;
    expect(feb).toMatchObject({
      action: "REPLACED",
      before: { A: 12400, B: 50 },
      after: { A: 12950, B: 50 },
      beforeRows: 12450,
      afterRows: 13000,
      shrink: false,
    });
    expect(p.confirm).toEqual(["REPLACE"]);
    expect(p.autoActivate).toBe(false);
  });

  it("sheet di file tanpa baris untuk periode yang diganti = kosong (menyusut, wajib centang)", () => {
    const p = computePeriodPlan(
      input({
        active: [month("2026-02", { A: 1000, B: 800 })],
        incoming: [month("2026-02", { A: 990 })],
        incomingSheets: ["A", "B"],
      }),
    );
    expect(p.entries[0]).toMatchObject({ after: { A: 990 }, shrink: true });
    expect(p.confirm).toEqual(["REPLACE", "SHRINK"]);
  });

  it("penyusutan tepat di ambang tidak wajib centang; lewat ambang wajib", () => {
    const at = computePeriodPlan(
      input({ active: [month("2026-02", { A: 1000 })], incoming: [month("2026-02", { A: 500 })] }),
    );
    expect(at.entries[0]!.shrink).toBe(false);
    const over = computePeriodPlan(
      input({ active: [month("2026-02", { A: 1000 })], incoming: [month("2026-02", { A: 499 })] }),
    );
    expect(over.entries[0]!.shrink).toBe(true);
  });

  it("periode kemungkinan nyasar dikecualikan secara default; bisa dimasukkan", () => {
    const base = input({
      active: [month("2026-01", { A: 900 })],
      incoming: [month("2026-01", { A: 3 }), month("2026-02", { A: 1000 })],
    });
    const p = computePeriodPlan(base);
    expect(actions(p)).toEqual({ "2026-01": "EXCLUDED", "2026-02": "ADDED" });
    expect(p.entries[0]).toMatchObject({ stray: true, before: { A: 900 }, after: { A: 900 } });
    expect(p.confirm).toEqual(["STRAY"]);
    const inc = computePeriodPlan({ ...base, include: ["2026-01"] });
    expect(actions(inc)["2026-01"]).toBe("REPLACED");
    expect(inc.include).toEqual(["2026-01"]);
  });

  it("label, file identik, baris dibuang, dan tanpa perubahan selalu ditinjau", () => {
    const p = computePeriodPlan(
      input({
        source: "LABEL",
        active: [month("2026-03", { A: 10 }, "abc")],
        incoming: [month("2026-03", { A: 10 })],
        fileSha256: "abc",
        droppedRows: 2,
      }),
    );
    expect(p.entries[0]!.identical).toBe(true);
    expect(p.confirm).toEqual(["REPLACE", "LABEL", "IDENTICAL", "DROPPED_ROWS"]);
    const none = computePeriodPlan(input({ active: months("2026-01", 2) }));
    expect(none.confirm).toEqual(["NO_CHANGE"]);
    expect(none.autoActivate).toBe(false);
  });

  it("kuartal dan tahun: label dan urutan kronologis", () => {
    const q = computePeriodPlan(
      input({
        grain: "QUARTER",
        active: [{ key: "2025-Q4", start: "2025-10-01", sheets: { A: { rows: 5, bytes: 5 } } }],
        incoming: [{ key: "2026-Q1", start: "2026-01-01", sheets: { A: { rows: 5, bytes: 5 } } }],
      }),
    );
    expect(q.entries.map((e) => e.label)).toEqual(["Kuartal 4 2025", "Kuartal 1 2026"]);
    expect(periodLabel("YEAR", "2024-01-01")).toBe("Tahun 2024");
  });

  it("masukan salah bentuk adalah bug pemanggil (melempar)", () => {
    expect(() =>
      computePeriodPlan(input({ incoming: [{ ...month("2026-03", { A: 1 }), key: "2026-04" }] })),
    ).toThrow(/bukan periode/);
    expect(() =>
      computePeriodPlan(input({ incoming: [{ key: "2023-02", start: "2023-02-29", sheets: {} }] })),
    ).toThrow(/tidak valid/);
    expect(() =>
      computePeriodPlan(
        input({ active: [month("2026-03", { A: 1 }), month("2026-03", { A: 2 })] }),
      ),
    ).toThrow(/ganda/);
    expect(() => computePeriodPlan(input({ incoming: [month("2026-03", { Z: 1 })] }))).toThrow(
      /incomingSheets/,
    );
    expect(() => computePeriodPlan(input({ incoming: [month("2026-03", { A: -1 })] }))).toThrow(
      /≥ 0/,
    );
    expect(() =>
      computePeriodPlan(input({ settings: { keepPeriods: 0, onLimit: "REJECT" } })),
    ).toThrow(/keepPeriods/);
  });
});

describe("computePeriodPlan — batas (AC2, AC3)", () => {
  const full = months("2024-04", 24); // Apr 2024 … Mar 2026

  it("REJECT (default): PERIOD_LIMIT beserta periode terlama yang harus dihapus, tanpa pelepasan", () => {
    const p = computePeriodPlan(input({ active: full, incoming: [month("2026-04", { A: 10 })] }));
    expect(p.rejection).toMatchObject({
      code: "PERIOD_LIMIT",
      limit: "periods",
      used: 25,
      max: 24,
      periods: ["2026-04"],
      mustRemove: ["2024-04"],
    });
    expect(p.rejection!.message).toBe(
      'Menyimpan April 2026 akan melewati batas simpan 24 periode. Hapus periode April 2024 dulu, atau ubah pengaturan "Saat batas tercapai".',
    );
    expect(actions(p)["2026-04"]).toBe("REJECTED");
    expect(p.entries.some((e) => e.action === "EVICTED")).toBe(false);
    expect(p.totals.after).toEqual(p.totals.before);
    expect(p.autoActivate).toBe(false);
  });

  it("EVICT_OLDEST: periode terlama menurut kunci dilepas utuh di semua sheet, selalu ditinjau", () => {
    const active = full.map((p, i) => (i === 0 ? month(p.key, { A: 1000, B: 7 }) : p));
    const p = computePeriodPlan(
      input({
        active: [...active].reverse(), // urutan masukan tidak berpengaruh
        incoming: [month("2026-04", { A: 10 })],
        settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
      }),
    );
    expect(p.rejection).toBeNull();
    expect(p.entries[0]).toMatchObject({
      key: "2024-04",
      action: "EVICTED",
      before: { A: 1000, B: 7 },
      after: null,
    });
    expect(p.entries.filter((e) => e.action === "EVICTED")).toHaveLength(1);
    expect(p.totals.periodsAfter).toBe(24);
    expect(p.totals.after.B).toBeUndefined();
    expect(p.confirm).toEqual(["EVICT"]);
  });

  it("batas baris per sheet melepas sebanyak periode utuh yang perlu (sisa ruang dibiarkan)", () => {
    const p = computePeriodPlan(
      input({
        active: months("2026-01", 3, 4000),
        incoming: [month("2026-04", { A: 3000 })],
        settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
        limits: { ...LIMITS, sheetMaxRows: 10_000 },
      }),
    );
    expect(actions(p)).toEqual({
      "2026-01": "EVICTED",
      "2026-02": "EVICTED",
      "2026-03": "UNCHANGED",
      "2026-04": "ADDED",
    });
    expect(p.totals.after).toEqual({ A: 7000 });
  });

  it("periode unggahan ini tidak pernah dilepas: lebih tua dari tertua saat jendela penuh → OUT_OF_WINDOW", () => {
    for (const onLimit of ["REJECT", "EVICT_OLDEST"] as const) {
      const p = computePeriodPlan(
        input({
          active: full,
          incoming: [month("2024-01", { A: 10 })],
          settings: { keepPeriods: null, onLimit },
        }),
      );
      expect(p.rejection).toMatchObject({
        code: "PERIOD_OUT_OF_WINDOW",
        periods: ["2024-01"],
        mustRemove: [],
      });
      expect(p.rejection!.message).toBe(
        "Periode Januari 2024 di luar batas simpan 24 periode: menyimpannya berarti melepas data yang lebih baru.",
      );
      expect(p.entries.some((e) => e.action === "EVICTED")).toBe(false);
    }
  });

  it("koreksi periode lama saat jendela belum penuh tetap diterima", () => {
    const p = computePeriodPlan(
      input({ active: months("2025-01", 5), incoming: [month("2024-01", { A: 1 })] }),
    );
    expect(p.rejection).toBeNull();
    expect(actions(p)["2024-01"]).toBe("ADDED");
  });

  it("satu periode melebihi batas baris → PERIOD_TOO_LARGE, tidak ada yang dilepas", () => {
    const p = computePeriodPlan(
      input({
        active: months("2026-01", 4),
        incoming: [month("2026-05", { A: 14_200_000 })],
        settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
      }),
    );
    expect(p.rejection).toMatchObject({
      code: "PERIOD_TOO_LARGE",
      limit: "sheetRows",
      sheet: "A",
      used: 14_200_000,
      max: 10_000_000,
      periods: ["2026-05"],
    });
    expect(p.rejection!.message).toMatch(
      /^Periode Mei 2026 berisi 14\.200\.000 baris di satu sheet, melebihi batas 10\.000\.000 baris per sheet\./,
    );
    expect(p.entries.every((e) => e.action !== "EVICTED")).toBe(true);
  });

  it("satu periode melebihi batas byte dataset → PERIOD_TOO_LARGE", () => {
    const p = computePeriodPlan(
      input({
        incoming: [month("2026-05", { A: 100 })],
        limits: { ...LIMITS, datasetMaxBytes: 999 },
      }),
    );
    expect(p.rejection).toMatchObject({
      code: "PERIOD_TOO_LARGE",
      limit: "datasetBytes",
      used: 1000,
      max: 999,
    });
  });

  it("file berisi lebih banyak periode dari batas simpan → PERIOD_TOO_LARGE untuk unggahan itu", () => {
    const p = computePeriodPlan(
      input({
        incoming: months("2024-01", 5),
        settings: { keepPeriods: 3, onLimit: "EVICT_OLDEST" },
      }),
    );
    expect(p.rejection).toMatchObject({
      code: "PERIOD_TOO_LARGE",
      limit: "periods",
      used: 5,
      max: 3,
    });
    expect(p.rejection!.message).toMatch(/^Unggahan ini \(5 periode\) berisi 5 periode/);
  });

  it("pengaturan pemilik dipotong ke PERIOD_KEEP_MAX; null memakai default", () => {
    expect(
      computePeriodPlan(input({ settings: { keepPeriods: 500, onLimit: "REJECT" } })).keep,
    ).toBe(60);
    expect(computePeriodPlan(input({})).keep).toBe(24);
    expect(computePeriodPlan(input({ settings: { keepPeriods: 6, onLimit: "REJECT" } })).keep).toBe(
      6,
    );
  });

  it("meter pemakaian menandai ≥ ambang peringatan", () => {
    const p = computePeriodPlan(
      input({ active: months("2024-01", 19), incoming: [month("2025-08", { A: 1 })] }),
    );
    expect(p.usage.find((u) => u.limit === "periods")).toEqual({
      limit: "periods",
      sheet: null,
      used: 20,
      max: 24,
      warn: true,
    });
    expect(p.usage.find((u) => u.limit === "sheetRows")!.warn).toBe(false);
  });

  it("batas dari env (§5.2)", () => {
    expect(
      periodLimits({
        PERIOD_KEEP_DEFAULT: 24,
        PERIOD_KEEP_MAX: 60,
        PERIOD_SHEET_MAX_ROWS: 10_000_000,
        DATASET_MAX_DATA_BYTES: 16 * 1024 ** 3,
        PERIOD_SHEET_MAX_SEGMENTS: 120,
        PERIOD_SHRINK_CONFIRM_PCT: 50,
        PERIOD_STRAY_PCT: 10,
        PERIOD_WARN_PCT: 80,
      }),
    ).toEqual(LIMITS);
  });
});

describe("computePeriodPlan — tanggal naive (batas bulan, kabisat, zona waktu)", () => {
  it("akhir bulan, 29 Februari, dan pergantian tahun masuk periode yang benar", () => {
    const days = [
      "2024-02-29",
      "2024-03-01",
      "2023-12-31",
      "2024-01-01",
      "2000-02-29",
      "2026-09-30",
    ];
    const keys = days.map((d) => periodKeyOf("MONTH", periodStartOf("MONTH", d)));
    expect(keys).toEqual(["2024-02", "2024-03", "2023-12", "2024-01", "2000-02", "2026-09"]);
    expect(isIsoDate("1900-02-29")).toBe(false);
    expect(isIsoDate("2100-02-29")).toBe(false);
    expect(periodKeyOf("QUARTER", periodStartOf("QUARTER", "2023-12-31"))).toBe("2023-Q4");
    expect(periodKeyOf("YEAR", periodStartOf("YEAR", "2023-12-31"))).toBe("2023");
  });

  it("hasil identik di setiap zona waktu proses (tidak ada Date lokal)", () => {
    const make = () =>
      JSON.stringify(
        computePeriodPlan(
          input({
            active: months("2023-11", 4),
            incoming: [month("2024-02", { A: 1 }), month("2024-03", { A: 1000 })],
            include: ["2024-02"],
          }),
        ),
      );
    const prev = process.env.TZ;
    try {
      const out = [
        "UTC",
        "Asia/Jakarta",
        "America/Los_Angeles",
        "Pacific/Kiritimati",
        "Pacific/Pago_Pago",
      ].map((tz) => {
        process.env.TZ = tz;
        return make();
      });
      expect(new Set(out).size).toBe(1);
      expect(out[0]).toContain('"start":"2024-02-01"');
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe("rencana beku (JSON) di versi (AC4)", () => {
  it("bulat-balik JSON identik; bentuk lain ditolak (fail-closed)", () => {
    const p = computePeriodPlan(
      input({ active: months("2026-01", 2), incoming: [month("2026-02", { A: 7 })] }),
    );
    expect(parseFrozenPeriodPlan(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseFrozenPeriodPlan(null)).toBeNull();
    expect(parseFrozenPeriodPlan({ ...p, v: 2 })).toBeNull();
    expect(parseFrozenPeriodPlan({ ...p, entries: [{ key: "x" }] })).toBeNull();
  });
});

// --- Uji berbasis properti ------------------------------------------------------------------------

/** mulberry32: PRNG berbenih kecil, deterministik. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
  const chance = (p: number) => next() < p;
  return { int, pick, chance };
}

const SHEETS = ["s1", "s2", "s3"] as const;

/** Tanggal acak dengan bobot pada tepi: akhir/awal bulan, 29 Feb, abad (1900/2000/2100). */
function randomDay(r: ReturnType<typeof rng>): string {
  for (;;) {
    const y = r.chance(0.1) ? r.pick([1900, 2000, 2100, 2023, 2024]) : r.int(2019, 2027);
    const m = r.int(1, 12);
    const d = r.chance(0.3) ? r.pick([1, 28, 29, 30, 31]) : r.int(1, 31);
    const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isIsoDate(s)) return s;
  }
}

function randomPeriods(
  r: ReturnType<typeof rng>,
  grain: PeriodGrain,
  n: number,
  sheets: readonly string[],
  rowsMax: number,
): PlanPeriodInput[] {
  const out = new Map<string, PlanPeriodInput>();
  for (let i = 0; i < n * 3 && out.size < n; i++) {
    const start = periodStartOf(grain, randomDay(r));
    const key = periodKeyOf(grain, start);
    if (out.has(key)) continue;
    const slices: Record<string, PeriodSlice> = {};
    for (const s of sheets) {
      if (r.chance(0.7)) {
        const rows = r.chance(0.15) ? r.int(0, 30) : r.int(0, rowsMax);
        slices[s] = { rows, bytes: rows * r.int(1, 40) + r.int(0, 500) };
      }
    }
    out.set(key, {
      key,
      start,
      sheets: slices,
      sha256: r.chance(0.3) ? `sha${r.int(0, 3)}` : null,
    });
  }
  return [...out.values()];
}

function randomInput(seed: number): PeriodPlanInput {
  const r = rng(seed);
  const grain = r.pick(["MONTH", "QUARTER", "YEAR"] as const);
  const incomingSheets = SHEETS.filter(() => r.chance(0.6));
  if (!incomingSheets.length) incomingSheets.push(r.pick(SHEETS));
  const active = randomPeriods(r, grain, r.int(0, 16), SHEETS, 5000);
  let incoming = randomPeriods(r, grain, r.int(0, 6), incomingSheets, 6000);
  // Sering tumpang-tindih dengan periode aktif (penggantian).
  if (active.length && r.chance(0.6)) {
    const a = r.pick(active);
    const slices: Record<string, PeriodSlice> = {};
    for (const s of incomingSheets)
      if (r.chance(0.8)) slices[s] = { rows: r.int(0, 6000), bytes: r.int(0, 90_000) };
    incoming = [
      ...incoming.filter((p) => p.key !== a.key),
      { key: a.key, start: a.start, sheets: slices },
    ];
  }
  const keepMax = r.int(1, 20);
  const limits: PeriodLimits = {
    keepDefault: r.int(1, 25),
    keepMax,
    sheetMaxRows: r.chance(0.2) ? 10_000_000 : r.int(1, 40_000),
    datasetMaxBytes: r.chance(0.2) ? 16 * 1024 ** 3 : r.int(1, 600_000),
    sheetMaxSegments: r.int(1, 20),
    shrinkConfirmPct: r.int(0, 100),
    strayPct: r.pick([0, 10, 25, 100]),
    warnPct: r.int(1, 100),
  };
  return {
    grain,
    source: r.chance(0.8) ? "COLUMN" : "LABEL",
    baseVersionId: r.chance(0.8) ? `v${r.int(1, 9)}` : null,
    active,
    incoming,
    incomingSheets,
    settings: {
      keepPeriods: r.chance(0.4) ? null : r.int(1, 30),
      onLimit: r.chance(0.5) ? "REJECT" : "EVICT_OLDEST",
    },
    limits,
    include: incoming.filter(() => r.chance(0.3)).map((p) => p.key),
    fileSha256: r.chance(0.5) ? `sha${r.int(0, 3)}` : null,
    droppedRows: r.chance(0.2) ? r.int(1, 20) : 0,
  };
}

type Slices = Record<string, PeriodSlice>;
const rowsMap = (s: Slices) =>
  Object.fromEntries(
    Object.keys(s)
      .sort()
      .map((k) => [k, s[k]!.rows]),
  );

/** Pemeriksa batas independen dari implementasi. */
function fits(units: Slices[], keep: number, l: PeriodLimits): boolean {
  if (units.length > keep) return false;
  const rows = new Map<string, number>();
  const segs = new Map<string, number>();
  let bytes = 0;
  for (const u of units) {
    for (const [k, s] of Object.entries(u)) {
      rows.set(k, (rows.get(k) ?? 0) + s.rows);
      segs.set(k, (segs.get(k) ?? 0) + 1);
      bytes += s.bytes;
    }
  }
  return (
    bytes <= l.datasetMaxBytes &&
    [...rows.values()].every((v) => v <= l.sheetMaxRows) &&
    [...segs.values()].every((v) => v <= l.sheetMaxSegments)
  );
}

function checkInvariants(inp: PeriodPlanInput, plan: PeriodPlan): void {
  const active = new Map(inp.active.map((p) => [p.key, p]));
  const incoming = new Map(inp.incoming.map((p) => [p.key, p]));
  const fileSheets = new Set(inp.incomingSheets);
  const keep = Math.min(inp.settings.keepPeriods ?? inp.limits.keepDefault, inp.limits.keepMax);
  expect(plan.keep).toBe(keep);
  const merged = (k: string): Slices => {
    const out: Slices = {};
    for (const [s, v] of Object.entries(active.get(k)?.sheets ?? {}))
      if (!fileSheets.has(s)) out[s] = v;
    return { ...out, ...incoming.get(k)!.sheets };
  };

  // 1. Setiap periode aktif ∪ file tepat satu kali, urut kronologis.
  const keys = plan.entries.map((e) => e.key);
  expect(new Set(keys)).toEqual(new Set([...active.keys(), ...incoming.keys()]));
  expect(keys.length).toBe(new Set(keys).size);
  const starts = plan.entries.map((e) => e.start);
  expect(starts).toEqual([...starts].sort());

  // 2. Periode utuh: sesudah = persis data aktif, data file (+ sheet yang tidak ada di file), atau tidak ada.
  const result: Slices[] = [];
  for (const e of plan.entries) {
    const a = active.get(e.key);
    const inc = incoming.get(e.key);
    expect(e.before).toEqual(a ? rowsMap(a.sheets) : null);
    expect(e.fromUpload).toBe(!!inc);
    let after: Slices | null;
    switch (e.action) {
      case "ADDED":
        expect(a).toBeUndefined();
        after = merged(e.key);
        break;
      case "REPLACED":
        expect(a && inc).toBeTruthy();
        after = merged(e.key);
        break;
      case "EVICTED":
        expect(a).toBeDefined();
        // Hanya periode aktif; baris file-nya (bila ada) dikecualikan sebagai nyasar.
        if (inc) expect(e.stray && !(inp.include ?? []).includes(e.key)).toBe(true);
        after = null;
        break;
      case "UNCHANGED":
        expect(inc).toBeUndefined();
        after = a!.sheets;
        break;
      case "EXCLUDED":
      case "REJECTED":
        expect(inc).toBeDefined();
        after = a?.sheets ?? null;
        break;
    }
    expect(e.after).toEqual(after ? rowsMap(after) : null);
    if (after) result.push(after);
    if (e.action === "EXCLUDED") expect(e.stray && !(inp.include ?? []).includes(e.key)).toBe(true);
  }
  const sumRows = (units: Slices[]) => {
    const m: Record<string, number> = {};
    for (const u of units) for (const [k, v] of Object.entries(u)) m[k] = (m[k] ?? 0) + v.rows;
    return m;
  };
  expect(plan.totals.after).toEqual(sumRows(result));
  expect(plan.totals.before).toEqual(sumRows(inp.active.map((p) => p.sheets)));
  expect(plan.totals.periodsAfter).toBe(result.length);

  const evicted = plan.entries.filter((e) => e.action === "EVICTED");
  const kept = plan.entries.filter((e) => e.after !== null);
  const rej = plan.rejection;
  if (rej) {
    // 3. Penolakan tidak mengubah apa pun.
    expect(
      plan.entries.every((e) => ["UNCHANGED", "EXCLUDED", "REJECTED"].includes(e.action)),
    ).toBe(true);
    expect(plan.totals.after).toEqual(plan.totals.before);
    expect(plan.autoActivate).toBe(false);
    expect(plan.confirm).toEqual([]);
    const upload = plan.entries.filter((e) => e.action === "REJECTED").map((e) => e.key);
    const uploadUnits = upload.map(merged);
    if (rej.code === "PERIOD_TOO_LARGE") {
      expect(fits(uploadUnits, keep, inp.limits)).toBe(false);
      expect(rej.periods.every((k) => upload.includes(k))).toBe(true);
    } else {
      expect(fits(uploadUnits, keep, inp.limits)).toBe(true);
    }
    if (rej.code === "PERIOD_OUT_OF_WINDOW") {
      expect(rej.periods.length).toBeGreaterThan(0);
      expect(rej.periods.every((k) => upload.includes(k))).toBe(true);
      // Tidak bisa diselesaikan dengan melepas periode terlama.
      const ev = computePeriodPlan({
        ...inp,
        settings: { ...inp.settings, onLimit: "EVICT_OLDEST" },
      });
      expect(ev.rejection?.code).toBe("PERIOD_OUT_OF_WINDOW");
    }
    if (rej.code === "PERIOD_LIMIT") {
      expect(inp.settings.onLimit).toBe("REJECT");
      expect(rej.mustRemove.length).toBeGreaterThan(0);
      // Yang harus dihapus = periode aktif terlama (awalan), bukan dari unggahan ini.
      const order = plan.entries.filter((e) => e.before !== null || upload.includes(e.key));
      expect(order.slice(0, rej.mustRemove.length).map((e) => e.key)).toEqual(rej.mustRemove);
      expect(rej.mustRemove.every((k) => active.has(k) && !upload.includes(k))).toBe(true);
      // Setelah pemilik menghapusnya, unggahan muat; menghapus satu lebih sedikit tidak cukup.
      const after = computePeriodPlan({
        ...inp,
        active: inp.active.filter((p) => !rej.mustRemove.includes(p.key)),
      });
      expect(after.rejection).toBeNull();
      const fewer = rej.mustRemove.slice(0, -1);
      const notEnough = computePeriodPlan({
        ...inp,
        active: inp.active.filter((p) => !fewer.includes(p.key)),
      });
      expect(notEnough.rejection?.code).toBe("PERIOD_LIMIT");
    }
  } else {
    // 4. Hasil selalu dalam batas.
    expect(fits(result, keep, inp.limits)).toBe(true);
    // 5. Pelepasan hanya EVICT_OLDEST, bukan unggahan ini, awalan terlama, dan minimal.
    if (inp.settings.onLimit === "REJECT") expect(evicted).toEqual([]);
    for (const e of evicted) {
      expect(e.fromUpload && !(e.stray && !(inp.include ?? []).includes(e.key))).toBe(false);
      expect(kept.every((k) => k.start > e.start)).toBe(true);
    }
    if (evicted.length) {
      const back = active.get(evicted.at(-1)!.key)!.sheets;
      expect(fits([back, ...result], keep, inp.limits)).toBe(false);
    }
    // 6. Aktif otomatis hanya untuk penambahan murni mode kolom tanpa peringatan.
    if (plan.autoActivate) {
      expect(inp.source).toBe("COLUMN");
      expect(plan.entries.every((e) => e.action === "ADDED" || e.action === "UNCHANGED")).toBe(
        true,
      );
      expect(plan.entries.some((e) => e.stray)).toBe(false);
      expect(plan.entries.some((e) => e.action === "ADDED")).toBe(true);
    }
    if (evicted.length) expect(plan.confirm).toContain("EVICT");
  }

  // 7. Beku sebagai JSON tanpa kehilangan.
  expect(parseFrozenPeriodPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
}

describe("computePeriodPlan — invarian berbasis properti (AC4)", () => {
  const CASES = 1500;

  it(`${CASES} kasus acak: semua invarian terpenuhi`, () => {
    const seen = { rejected: new Set<string>(), evicted: 0, replaced: 0, excluded: 0, ok: 0 };
    for (let seed = 1; seed <= CASES; seed++) {
      const inp = randomInput(seed);
      const plan = computePeriodPlan(inp);
      try {
        checkInvariants(inp, plan);
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).stack}`);
      }
      if (plan.rejection) seen.rejected.add(plan.rejection.code);
      else seen.ok++;
      if (plan.entries.some((e) => e.action === "EVICTED")) seen.evicted++;
      if (plan.entries.some((e) => e.action === "REPLACED")) seen.replaced++;
      if (plan.entries.some((e) => e.action === "EXCLUDED")) seen.excluded++;
    }
    // Generator benar-benar menjangkau setiap cabang.
    expect([...seen.rejected].sort()).toEqual([
      "PERIOD_LIMIT",
      "PERIOD_OUT_OF_WINDOW",
      "PERIOD_TOO_LARGE",
    ]);
    expect(seen.evicted).toBeGreaterThan(20);
    expect(seen.replaced).toBeGreaterThan(20);
    expect(seen.excluded).toBeGreaterThan(20);
    expect(seen.ok).toBeGreaterThan(100);
  });

  it("deterministik: urutan masukan tidak mengubah rencana", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const inp = randomInput(seed);
      const r = rng(seed * 7919);
      const shuffle = <T>(xs: T[]) =>
        xs
          .map((x) => [r.int(0, 1e9), x] as const)
          .sort((a, b) => a[0] - b[0])
          .map((x) => x[1]);
      const shuffled: PeriodPlanInput = {
        ...inp,
        active: shuffle(inp.active).map((p) => ({
          ...p,
          sheets: Object.fromEntries(shuffle(Object.entries(p.sheets))),
        })),
        incoming: shuffle(inp.incoming),
        incomingSheets: shuffle(inp.incomingSheets),
        include: shuffle(inp.include ?? []),
      };
      expect(JSON.stringify(computePeriodPlan(shuffled))).toBe(
        JSON.stringify(computePeriodPlan(inp)),
      );
    }
  });
});
