import { describe, expect, it } from "vitest";
import {
  baseKey,
  castBase,
  hiddenExtras,
  nullChoices,
  pairOf,
  pickOptions,
  progress,
  sheetDraft,
  toPayload,
  undecided,
  withCast,
  type MappingDraft,
} from "@/components/mapping/mapping-model";
import type { MappingReady, MappingSheetView } from "@/components/mapping/mapping-types";

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
  candidates: [
    {
      id: "n2",
      name: "Retur 2026",
      newColumns: [col(1, "Jumlah")],
      autoMatched: [],
      missing: [1],
      extra: [1],
      lowCast: [],
    },
    {
      id: "n3",
      name: "Catatan",
      newColumns: [],
      autoMatched: [],
      missing: [],
      extra: [],
      lowCast: [],
    },
  ],
  // Tanpa pasangan otomatis: rencana kolom ada di kandidat.
  newColumns: [],
  autoMatched: [],
  missing: [1],
  extra: [],
  lowCast: [],
};

const view: MappingReady = {
  none: false,
  datasetId: "d1",
  datasetName: "Penjualan",
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
  sheets: [sales, returns],
};

describe("progress / undecided", () => {
  it("menghitung pasangan sheet dan kolom hilang sebagai keputusan wajib", () => {
    expect(progress(view, {})).toEqual({ done: 0, total: 2 });
    expect(undecided(view, {})).toEqual(["a1-2", "a2-sheet"]);
  });

  it("memilih sheet kandidat menambah keputusan kolom milik pasangan itu", () => {
    const draft: MappingDraft = { a2: { target: "n2", columns: {}, casts: {} } };
    expect(progress(view, draft)).toEqual({ done: 1, total: 3 });
    expect(undecided(view, draft)).toEqual(["a1-2", "a2-1"]);
  });

  it("NULL dan 'tidak dipakai lagi' juga keputusan", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: null }, casts: {} },
      a2: { target: null, columns: {}, casts: {} },
    };
    expect(progress(view, draft)).toEqual({ done: 2, total: 2 });
    expect(undecided(view, draft)).toEqual([]);
  });

  it("kandidat tanpa kolom hilang tidak menambah keputusan kolom", () => {
    const draft: MappingDraft = { a2: { target: "n3", columns: {}, casts: {} } };
    expect(pairOf(returns, sheetDraft(draft, "a2"))?.missing).toEqual([]);
    expect(progress(view, draft)).toEqual({ done: 1, total: 2 });
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

describe("nullChoices", () => {
  it("menyebut kolom yang dikosongkan dan sheet yang tidak dipakai lagi", () => {
    const draft: MappingDraft = {
      a1: { columns: { 2: null }, casts: {} },
      a2: { target: null, columns: {}, casts: {} },
    };
    expect(nullChoices(view, draft)).toEqual({
      columns: [{ sheet: "Penjualan", name: "Cabang" }],
      droppedSheets: ["Retur"],
    });
    expect(nullChoices(view, { a1: { columns: { 2: 2 }, casts: {} } })).toEqual({
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
    expect(toPayload(view, draft)).toEqual({
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
    expect(toPayload(view, draft).sheets).toEqual([
      { activeSheetId: "a1", target: "n1", columns: [{ activePos: 2, newPos: null }] },
      { activeSheetId: "a2", target: null, columns: [] },
    ]);
  });

  it("payload tetap kecil untuk sheet lebar (hanya keputusan)", () => {
    const missing = Array.from({ length: 2_000 }, (_, i) => i + 1);
    const wide: MappingSheetView = { ...sales, missing, lowCast: [] };
    const columns = Object.fromEntries(missing.map((p) => [p, null]));
    const body = JSON.stringify(
      toPayload({ ...view, sheets: [wide] }, { a1: { columns, casts: {} } }),
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
