import { describe, expect, it } from "vitest";
import {
  baseKey,
  castBase,
  castRowId,
  castRows,
  castTargetId,
  hiddenExtras,
  issueTargets,
  locateIssue,
  mappedCast,
  nullChoices,
  pairKey,
  pairOf,
  pairOptions,
  pickOptions,
  progress,
  retypedColumns,
  reviewOf,
  samePayload,
  sheetDraft,
  summaryCounts,
  toPayload,
  undecided,
  withCast,
  withColumn,
  withReview,
  withTarget,
  type MappingDraft,
  type PairPlans,
} from "@/components/mapping/mapping-model";
import type {
  MappingPlanView,
  MappingReady,
  MappingReviewIssue,
  MappingSheetView,
} from "@/components/mapping/mapping-types";
import type { MappingLocal } from "@/components/mapping/use-mapping-job";

/* T-014: pemetaan kolom — keputusan wajib, satu-ke-satu, kolom tersembunyi, payload ringkas. */

const col = (pos: number, original: string) => ({
  pos,
  original,
  name: original,
  type: "text" as const,
  castFailCount: 0,
  samples: [],
});

/** Sheet "Penjualan": Cabang (2) hilang, Tanggal (3) cast rendah; file baru punya Kantor & Catatan. */
const sales: MappingSheetView = {
  active: {
    id: "a1",
    name: "Penjualan",
    schemaRevision: 3,
    columns: [
      { pos: 1, name: "Kode", original: "Kode", type: "text", hidden: false, absent: false },
      { pos: 2, name: "Cabang", original: "Cabang", type: "text", hidden: false, absent: false },
      {
        pos: 3,
        name: "Tanggal",
        original: "Tgl",
        type: "date",
        dateFormat: "dd/mm/yyyy",
        hidden: false,
        absent: false,
      },
    ],
  },
  target: { id: "n1", name: "Penjualan" },
  candidates: [],
  newColumns: [col(1, "Kode"), col(2, "Kantor"), col(3, "Tgl"), col(4, "Catatan")],
  autoMatched: [
    { activePos: 1, newPos: 1 },
    { activePos: 3, newPos: 3 },
  ],
  missing: [2],
  extra: [2, 4],
  lowCast: [{ pos: 3, activePos: 3, pct: 0.91, typeLabel: "Tanggal (dd/mm/yyyy)", approx: false }],
};

/** Sheet "Retur" tidak ada di file baru; sheet baru "Retur 2026" belum berpasangan. */
const returns: MappingSheetView = {
  active: {
    id: "a2",
    name: "Retur",
    schemaRevision: 1,
    columns: [
      { pos: 1, name: "Nilai", original: "Nilai", type: "decimal", hidden: false, absent: false },
    ],
  },
  target: null,
  // Hanya nama + jumlah kolom; rencana kolomnya dimuat saat dipilih (pairPlanAction).
  candidates: [
    { id: "n2", name: "Retur 2026", colCount: 1 },
    { id: "n3", name: "Catatan", colCount: 0 },
  ],
  newColumns: [],
  autoMatched: [],
  missing: [1],
  extra: [],
  lowCast: [],
};

const planN2: MappingPlanView = {
  newColumns: [col(1, "Jumlah")],
  autoMatched: [],
  missing: [1],
  extra: [1],
  lowCast: [],
};
const planN3: MappingPlanView = {
  newColumns: [],
  autoMatched: [],
  missing: [],
  extra: [],
  lowCast: [],
};
/** Rencana kedua kandidat sudah dimuat. */
const plans: PairPlans = { [pairKey("a2", "n2")]: planN2, [pairKey("a2", "n3")]: planN3 };

const view: MappingReady = {
  none: false,
  datasetId: "d1",
  datasetName: "Penjualan",
  period: false,
  reason: null,
  awaiting: {
    id: "v2",
    fileName: "baru.xlsx",
    createdAt: "2026-10-14T01:00:00Z",
    sourceDeleted: true,
  },
  active: { id: "v1", fileName: "lama.xlsx" },
  base: {
    activeVersionId: "v1",
    sheets: [
      { id: "a1", schemaRevision: 3 },
      { id: "a2", schemaRevision: 1 },
    ],
  },
  applying: false,
  jobId: null,
  last: null,
  sheets: [sales, returns],
};

describe("progress / undecided", () => {
  it("menghitung pasangan sheet dan kolom hilang sebagai keputusan wajib", () => {
    expect(progress(view, {}, plans)).toEqual({ done: 0, total: 2 });
    expect(undecided(view, {}, plans)).toEqual(["a1-2", "a2-sheet"]);
  });

  it("memilih sheet kandidat menambah keputusan kolom milik pasangan itu", () => {
    const draft: MappingDraft = { a2: { target: "n2", columns: {}, casts: {} } };
    expect(progress(view, draft, plans)).toEqual({ done: 1, total: 3 });
    expect(undecided(view, draft, plans)).toEqual(["a1-2", "a2-1"]);
  });

  it("kandidat yang rencananya belum termuat: pasangan belum selesai, belum ada keputusan kolom", () => {
    const draft: MappingDraft = { a2: { target: "n2", columns: {}, casts: {} } };
    expect(pairOf(returns, sheetDraft(draft, "a2"), {})).toBeNull();
    expect(progress(view, draft, {})).toEqual({ done: 0, total: 2 });
    expect(undecided(view, draft, {})).toEqual(["a1-2", "a2-sheet"]);
  });

  it("NULL dan 'tidak dipakai lagi' juga keputusan", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: null }, casts: {} },
      a2: { target: null, columns: {}, casts: {} },
    };
    expect(progress(view, draft, plans)).toEqual({ done: 2, total: 2 });
    expect(undecided(view, draft, {})).toEqual([]);
  });

  it("kandidat tanpa kolom hilang tidak menambah keputusan kolom", () => {
    const draft: MappingDraft = { a2: { target: "n3", columns: {}, casts: {} } };
    expect(pairOf(returns, sheetDraft(draft, "a2"), plans)?.missing).toEqual([]);
    expect(progress(view, draft, plans)).toEqual({ done: 1, total: 2 });
  });
});

describe("withTarget (draf per pasangan)", () => {
  it("ganti sheet menyimpan keputusan pasangan lama; kembali memulihkannya", () => {
    const onN2 = { target: "n2", columns: { 1: 1 }, casts: { 1: { type: "text" as const } } };
    const onN3 = withTarget(onN2, "n3");
    expect(onN3).toMatchObject({ target: "n3", columns: {}, casts: {} });
    const back = withTarget({ ...onN3, columns: { 1: null } }, "n2");
    expect(back).toMatchObject({ target: "n2", columns: { 1: 1 }, casts: { 1: { type: "text" } } });
    // Keputusan n3 ikut tersimpan.
    expect(withTarget(back, "n3").columns).toEqual({ 1: null });
  });

  it("'tidak dipakai lagi' tidak membawa keputusan kolom ke payload", () => {
    const d = withTarget({ target: "n2", columns: { 1: null }, casts: {} }, null);
    const payload = toPayload(view, { a1: { columns: { 2: 2 }, casts: {} }, a2: d }, plans);
    expect(payload.sheets[1]).toEqual({ activeSheetId: "a2", target: null, columns: [] });
  });
});

describe("pickOptions / hiddenExtras", () => {
  it("satu-ke-satu: kolom baru yang sudah dipakai kolom aktif lain ditandai", () => {
    const wide: MappingSheetView = { ...sales, missing: [1, 2], extra: [2, 4] };
    const d = { columns: { 1: 2 }, casts: {} };
    const opts = pickOptions(wide, wide, d, 2);
    expect(opts.map((o) => [o.column.original, o.takenBy])).toEqual([
      ["Kantor", "Kode"],
      ["Catatan", null],
    ]);
    // Pilihan baris itu sendiri tidak dianggap dipakai orang lain.
    expect(pickOptions(wide, wide, d, 1).every((o) => o.takenBy === null)).toBe(true);
  });

  it("kolom baru yang tidak dipetakan masuk sebagai kolom tersembunyi", () => {
    expect(hiddenExtras(sales, { columns: {}, casts: {} }).map((c) => c.original)).toEqual([
      "Kantor",
      "Catatan",
    ]);
    expect(hiddenExtras(sales, { columns: { 2: 2 }, casts: {} }).map((c) => c.original)).toEqual([
      "Catatan",
    ]);
    expect(hiddenExtras(sales, { columns: { 2: null }, casts: {} })).toHaveLength(2);
  });
});

describe("cast override", () => {
  const row = sales.lowCast[0]!;

  it("pilihan awal = tipe dan format kolom aktif", () => {
    expect(castBase(sales, sales, row)).toEqual({
      type: "date",
      dateFormat: "dd/mm/yyyy",
      numberLocale: undefined,
    });
  });

  it("kembali ke pilihan awal menghapus override", () => {
    const base = castBase(sales, sales, row);
    const d1 = withCast({ columns: {}, casts: {} }, base, 3, { type: "text" });
    expect(d1.casts).toEqual({ 3: { type: "text" } });
    expect(withCast(d1, base, 3, { ...base }).casts).toEqual({});
  });
});

describe("pairOptions", () => {
  // Dua sheet aktif tanpa pasangan berebut kandidat yang sama.
  const other: MappingSheetView = {
    ...returns,
    active: { ...returns.active, id: "a3", name: "Retur Lama" },
  };
  const two: MappingReady = { ...view, sheets: [sales, returns, other] };

  it("sheet baru yang dipilih sheet aktif lain ditandai; pilihan sendiri tidak", () => {
    const draft: MappingDraft = { a2: { target: "n2", columns: {}, casts: {} } };
    expect(pairOptions(two, draft, other).map((o) => [o.id, o.colCount, o.takenBy])).toEqual([
      ["n2", 1, "Retur"],
      ["n3", 0, null],
    ]);
    expect(pairOptions(two, draft, returns).every((o) => o.takenBy === null)).toBe(true);
  });

  it("'tidak dipakai lagi' dan belum dipilih tidak memakai kandidat", () => {
    const draft: MappingDraft = { a2: { target: null, columns: {}, casts: {} } };
    expect(pairOptions(two, draft, other).every((o) => o.takenBy === null)).toBe(true);
    expect(pairOptions(two, {}, other).every((o) => o.takenBy === null)).toBe(true);
  });
});

describe("mappedCast / withColumn", () => {
  // Jumlah (4, bilangan bulat) hilang; di file baru hanya ada "Catatan" (teks) dan "Kantor" (teks).
  const qty: MappingSheetView = {
    ...sales,
    active: {
      ...sales.active,
      columns: [
        ...sales.active.columns,
        {
          pos: 4,
          name: "Jumlah",
          original: "Qty",
          type: "integer",
          numberLocale: "id",
          hidden: false,
          absent: false,
        },
      ],
    },
    missing: [2, 4],
    lowCast: [],
  };
  const qtyView: MappingReady = { ...view, sheets: [qty] };

  it("kolom file bertipe lain → peringatan dengan pilihan awal = kolom aktif", () => {
    expect(mappedCast(qty, qty, { columns: { 4: 4 }, casts: {} }, 4)).toEqual({
      column: expect.objectContaining({ pos: 4, original: "Catatan", type: "text" }),
      base: { type: "integer", numberLocale: "id", dateFormat: undefined },
    });
  });

  it("tipe sama, tipe aktif Teks, dikosongkan, atau belum dipilih → tidak perlu", () => {
    const same: MappingSheetView = {
      ...qty,
      newColumns: qty.newColumns.map((c) => (c.pos === 4 ? { ...c, type: "integer" } : c)),
    };
    expect(mappedCast(same, same, { columns: { 4: 4 }, casts: {} }, 4)).toBeNull();
    expect(mappedCast(qty, qty, { columns: { 2: 4 }, casts: {} }, 2)).toBeNull();
    expect(mappedCast(qty, qty, { columns: { 4: null }, casts: {} }, 4)).toBeNull();
    expect(mappedCast(qty, qty, { columns: {}, casts: {} }, 4)).toBeNull();
  });

  it("tipe sama tetapi ditandai tahap tinjau → pilihan tipe dengan persen tepat", () => {
    const same: MappingSheetView = {
      ...qty,
      newColumns: qty.newColumns.map((c) => (c.pos === 4 ? { ...c, type: "integer" } : c)),
    };
    const flag = { 4: { pct: 0.61, typeLabel: "Bilangan bulat (id)" } };
    expect(mappedCast(same, same, { columns: { 4: 4 }, casts: {} }, 4, flag)).toMatchObject({
      column: { pos: 4 },
      review: { pct: 0.61 },
    });
  });

  it("payload membawa cast kolom yang dipetakan hanya bila berbeda dari pilihan aktif", () => {
    const keep: MappingDraft = { a1: { columns: { 2: null, 4: 4 }, casts: {} } };
    expect(toPayload(qtyView, keep, {}).sheets[0]).not.toHaveProperty("casts");
    const same: MappingDraft = {
      a1: { columns: { 2: null, 4: 4 }, casts: { 4: { type: "integer", numberLocale: "id" } } },
    };
    expect(toPayload(qtyView, same, {}).sheets[0]).not.toHaveProperty("casts");
    const text: MappingDraft = {
      a1: { columns: { 2: null, 4: 4 }, casts: { 4: { type: "text" } } },
    };
    expect(toPayload(qtyView, text, {}).sheets[0]).toMatchObject({
      casts: [{ pos: 4, type: "text" }],
    });
  });

  it("memetakan ulang membuang override kolom file sebelumnya", () => {
    const d = { columns: { 4: 4 }, casts: { 4: { type: "text" as const } } };
    const moved = withColumn(d, 4, 2);
    expect(moved).toEqual({ columns: { 4: 2 }, casts: {} });
    expect(withColumn(d, 4, 4).casts).toEqual(d.casts);
    expect(withColumn(d, 2, null)).toEqual({ columns: { 4: 4, 2: null }, casts: d.casts });
  });
});

describe("tahap tinjau (review)", () => {
  const issue = (column: string, pct: number, sheet = "Penjualan"): MappingReviewIssue => ({
    sheet,
    column,
    header: column,
    pct,
    typeLabel: "Tanggal (dd/mm/yyyy)",
  });

  it("isu dicari lewat nama sheet aktif + nama tampil; yang tidak ada di halaman → null", () => {
    expect(locateIssue(view, issue("Tanggal", 0.5))).toEqual({ sheetId: "a1", activePos: 3 });
    expect(locateIssue(view, issue("Tanggal", 0.5, "Lain"))).toBeNull();
    expect(locateIssue(view, issue("Tidak ada", 0.5))).toBeNull();
  });

  it("kolom cocok otomatis yang ditandai jadi baris tipe; persen job menggantikan perkiraan", () => {
    const flags = withReview({}, view, [issue("Kode", 0.4), issue("Tanggal", 0.61)]);
    expect(flags).toEqual({
      a1: {
        1: { pct: 0.4, typeLabel: "Tanggal (dd/mm/yyyy)" },
        3: { pct: 0.61, typeLabel: "Tanggal (dd/mm/yyyy)" },
      },
    });
    expect(castRows(sales, flags.a1).map((r) => [r.pos, r.activePos, r.pct, r.approx])).toEqual([
      [1, 1, 0.4, false],
      [3, 3, 0.61, false],
    ]);
    expect(castRows(sales, undefined)).toEqual(sales.lowCast);
    expect(summaryCounts(view, {}, plans, flags)).toMatchObject({ lowCast: 2, missing: 1 });
  });

  it("'Ubah tipe' memfokuskan pemicu tipe baris terkait", () => {
    const d = { columns: { 2: 4 }, casts: {} };
    expect(castTargetId(sales, sales, d, 3)).toBe(`${castRowId("a1", 3)}-type`);
    // Kolom aktif Teks (Cabang) tidak punya pilihan tipe di barisnya.
    expect(castTargetId(sales, sales, d, 2)).toBeNull();
    const num: MappingSheetView = {
      ...sales,
      active: {
        ...sales.active,
        columns: sales.active.columns.map((c) => (c.pos === 2 ? { ...c, type: "integer" } : c)),
      },
    };
    expect(castTargetId(num, num, d, 2)).toBe("map-a1-2-cast-type");
    expect(castTargetId(num, num, { columns: { 2: null }, casts: {} }, 2)).toBeNull();
    const draft: MappingDraft = { a1: d };
    expect(
      issueTargets(view, draft, plans, [issue("Tanggal", 0.5), issue("X", 0.1, "Lain")]),
    ).toEqual(["map-a1-cast-3-type", null]);
  });

  it("R2-UI-7: kolom hilang yang belum dipilih lagi → pemilih kolomnya, bukan saran halaman Skema", () => {
    const num: MappingSheetView = {
      ...sales,
      active: {
        ...sales.active,
        columns: sales.active.columns.map((c) => (c.pos === 2 ? { ...c, type: "integer" } : c)),
      },
    };
    // Hasil tinjau tersimpan + draf kosong (muat ulang): kolomnya masih bisa dipilih di halaman ini.
    expect(castTargetId(num, num, { columns: {}, casts: {} }, 2)).toBe("map-a1-2");
    // Teks (tidak pernah ditinjau) dan "kosongkan" tetap tanpa pemicu.
    expect(castTargetId(sales, sales, { columns: {}, casts: {} }, 2)).toBeNull();
    expect(castTargetId(num, num, { columns: { 2: null }, casts: {} }, 2)).toBeNull();
    const numView: MappingReady = { ...view, sheets: [num] };
    expect(issueTargets(numView, {}, {}, [issue("Cabang", 0)])).toEqual(["map-a1-2"]);
  });

  it("T-057 unggahan periode: tanpa pemicu 'Ubah tipe' (halaman Skema) dan tanpa hitungan baris tipe", () => {
    const num: MappingSheetView = {
      ...sales,
      active: {
        ...sales.active,
        columns: sales.active.columns.map((c) => (c.pos === 2 ? { ...c, type: "integer" } : c)),
      },
    };
    const pv: MappingReady = { ...view, period: true, sheets: [num] };
    expect(issueTargets(pv, {}, {}, [issue("Cabang", 0), issue("Tanggal", 0.5)])).toEqual([
      null,
      null,
    ]);
    const flags = withReview({}, pv, [issue("Tanggal", 0.85), issue("Cabang", 0)]);
    const mapped: MappingDraft = { a1: { columns: { 2: 2 }, casts: {} } };
    expect(summaryCounts(pv, mapped, {}, flags)).toMatchObject({
      lowCast: 0,
      retyped: 0,
      missing: 1,
    });
  });

  it("R2-UI-10: ringkasan menghitung kolom hilang yang dipetakan dan ditandai tinjau", () => {
    const num: MappingSheetView = {
      ...sales,
      active: {
        ...sales.active,
        columns: sales.active.columns.map((c) => (c.pos === 2 ? { ...c, type: "integer" } : c)),
      },
    };
    const numView: MappingReady = { ...view, sheets: [num] };
    // Tanggal (cocok otomatis) + Cabang (dipetakan ke Kantor) sama-sama ditandai: 2, sama dengan panel.
    const flags = withReview({}, numView, [issue("Tanggal", 0.85), issue("Cabang", 0)]);
    const mapped: MappingDraft = { a1: { columns: { 2: 2 }, casts: {} } };
    expect(summaryCounts(numView, mapped, {}, flags).lowCast).toBe(2);
    // Belum dipilih lagi atau dikosongkan: baris tipenya tidak tampil, jadi tidak dihitung.
    expect(summaryCounts(numView, {}, {}, flags).lowCast).toBe(1);
    const cleared: MappingDraft = { a1: { columns: { 2: null }, casts: {} } };
    expect(summaryCounts(numView, cleared, {}, flags).lowCast).toBe(1);
    // Tanpa tanda tinjau: kolom yang hanya beda tipe tidak menambah hitungan.
    expect(summaryCounts(numView, mapped, {}, {}).lowCast).toBe(1);
  });

  it("override pada kolom cocok yang ditandai ikut payload; persetujuan hanya untuk payload sama", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: 2 }, casts: { 1: { type: "integer", numberLocale: "id" } } },
      a2: { target: null, columns: {}, casts: {} },
    };
    const payload = toPayload(view, draft, plans);
    expect(payload.sheets[0]).toMatchObject({
      casts: [{ pos: 1, type: "integer", numberLocale: "id" }],
    });
    expect(samePayload(payload, toPayload(view, draft, plans))).toBe(true);
    const changed = { ...draft, a1: { ...draft.a1!, casts: {} } };
    expect(samePayload(payload, toPayload(view, changed, plans))).toBe(false);
  });
});

describe("reviewOf (R2-UI-2 / R2-UI-6)", () => {
  const issues: MappingReviewIssue[] = [
    { sheet: "Penjualan", column: "Tanggal", header: "Tgl", pct: 0.85, typeLabel: "Tanggal" },
  ];
  const draft: MappingDraft = {
    a1: { columns: { 2: 2 }, casts: {} },
    a2: { target: null, columns: {}, casts: {} },
  };
  const sent = toPayload(view, draft, plans);
  const own: MappingLocal = { phase: "review", issues, payload: sent };

  it("job tab ini dengan keputusan yang sama: live dan boleh disetujui (bar simpan tidak mengulang job)", () => {
    expect(reviewOf(view, draft, plans, own, null)).toEqual({ issues, live: true, ackable: true });
  });

  it("keputusan berubah sejak ditinjau: tetap live, tetapi harus diperiksa ulang", () => {
    const changed: MappingDraft = { ...draft, a1: { columns: { 2: null }, casts: {} } };
    expect(reviewOf(view, changed, plans, own, null)).toMatchObject({ live: true, ackable: false });
  });

  it("job tab lain/sebelum muat ulang (payload tidak diketahui): tidak live, tanpa persetujuan", () => {
    const other: MappingLocal = { phase: "review", issues, payload: null };
    expect(reviewOf(view, draft, plans, other, null)).toEqual({
      issues,
      live: false,
      ackable: false,
    });
  });

  it("hasil tinjau tersimpan dari server: tidak live; hasil lain atau tanpa hasil: tanpa panel", () => {
    const idle: MappingLocal = { phase: "idle" };
    expect(reviewOf(view, {}, plans, idle, { jobId: "j1", state: "review", issues })).toEqual({
      issues,
      live: false,
      ackable: false,
    });
    expect(reviewOf(view, {}, plans, idle, { jobId: "j1", state: "stale" })).toBeNull();
    expect(reviewOf(view, {}, plans, idle, null)).toBeNull();
  });
});

describe("nullChoices", () => {
  it("menyebut kolom yang dikosongkan dan sheet yang tidak dipakai lagi", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: null }, casts: {} },
      a2: { target: null, columns: {}, casts: {} },
    };
    expect(nullChoices(view, draft, plans)).toEqual({
      columns: [{ sheet: "Penjualan", name: "Cabang" }],
      droppedSheets: ["Retur"],
    });
    expect(nullChoices(view, { a1: { columns: { 2: 2 }, casts: {} } }, plans)).toEqual({
      columns: [],
      droppedSheets: [],
    });
  });
});

describe("toPayload", () => {
  it("hanya keputusan + override yang berbeda, dengan acuan skema aktif", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: 2 }, casts: { 3: { type: "text" } } },
      a2: { target: "n2", columns: { 1: null }, casts: {} },
    };
    expect(toPayload(view, draft, plans)).toEqual({
      base: view.base,
      sheets: [
        {
          activeSheetId: "a1",
          target: "n1",
          columns: [{ activePos: 2, newPos: 2 }],
          casts: [{ pos: 3, type: "text" }],
        },
        { activeSheetId: "a2", target: "n2", columns: [{ activePos: 1, newPos: null }] },
      ],
    });
  });

  it("sheet tidak dipakai lagi → target null tanpa kolom; override sama dengan aktif dibuang", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: null }, casts: { 3: { type: "date", dateFormat: "dd/mm/yyyy" } } },
      a2: { target: null, columns: { 1: null }, casts: {} },
    };
    expect(toPayload(view, draft, plans).sheets).toEqual([
      { activeSheetId: "a1", target: "n1", columns: [{ activePos: 2, newPos: null }] },
      { activeSheetId: "a2", target: null, columns: [] },
    ]);
  });

  it("payload tetap kecil untuk sheet lebar (hanya keputusan)", () => {
    const missing = Array.from({ length: 2_000 }, (_, i) => i + 1);
    const wide: MappingSheetView = { ...sales, missing, lowCast: [] };
    const columns = Object.fromEntries(missing.map((p) => [p, null]));
    const body = JSON.stringify(
      toPayload({ ...view, sheets: [wide] }, { a1: { columns, casts: {} } }, {}),
    );
    expect(body.length).toBeLessThan(100_000);
  });
});

describe("baseKey", () => {
  it("berubah bila revisi skema aktif berubah", () => {
    const next = { ...view, base: { ...view.base, sheets: [{ id: "a1", schemaRevision: 4 }] } };
    expect(baseKey(view)).not.toBe(baseKey(next));
  });
});

describe("review putaran 3 (T-014)", () => {
  it("R3-UI-2: isu di sheet yang belum dipasangkan → pemilih sheet-nya; sheet 'tidak dipakai' → null", () => {
    const issue: MappingReviewIssue = {
      sheet: "Retur",
      column: "Nilai",
      header: "Jumlah",
      pct: 0.5,
      typeLabel: "Angka desimal",
    };
    expect(issueTargets(view, {}, {}, [issue])).toEqual(["map-a2-sheet"]);
    const dropped: MappingDraft = { a2: { target: null, columns: {}, casts: {} } };
    expect(issueTargets(view, dropped, {}, [issue])).toEqual([null]);
  });

  it("R3-INT-2: kolom cocok otomatis yang tipe aktifnya diubah setelah unggah ditandai (kecuali sudah punya baris)", () => {
    const changed: MappingSheetView = {
      ...sales,
      newColumns: sales.newColumns.map((c) => (c.pos === 1 ? { ...c, type: "integer" } : c)),
      active: {
        ...sales.active,
        columns: sales.active.columns.map((c) =>
          c.pos === 1 ? { ...c, type: "decimal", numberLocale: "id" } : c,
        ),
      },
    };
    // Kode: aktif desimal, versi baru dibaca bilangan bulat → diperiksa ulang. Tanggal sudah punya baris.
    expect(retypedColumns(changed, changed)).toEqual(["Kode"]);
    expect(retypedColumns(changed, changed, { 1: { pct: 0.5, typeLabel: "x" } })).toEqual([]);
    expect(retypedColumns(sales, sales)).toEqual([]);
  });

  it("R4-2: pasangan pengguna (tipe hasil inferensi) tidak pernah ditandai 'diubah setelah unggah'", () => {
    const paired: MappingPlanView = {
      ...planN2,
      newColumns: [{ ...col(1, "Jumlah"), type: "integer" }],
      autoMatched: [{ activePos: 1, newPos: 1 }],
      missing: [],
    };
    expect(retypedColumns(returns, paired)).toEqual([]);
    const draft: MappingDraft = { a2: { target: "n2", columns: {}, casts: {} } };
    const loaded: PairPlans = { [pairKey("a2", "n2")]: paired };
    expect(summaryCounts({ ...view, sheets: [returns] }, draft, loaded, {}).retyped).toBe(0);
  });
});
