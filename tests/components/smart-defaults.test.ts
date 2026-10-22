import { describe, expect, it } from "vitest";
import { autoTitle, followTitle } from "@/components/dashboards/auto-title";
import {
  categoryCandidates,
  isIdLike,
  isIdName,
  measureCandidates,
} from "@/components/dashboards/smart-defaults";
import {
  defaultConfig,
  measureForChoice,
  type Source,
} from "@/components/dashboards/widget-config-model";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";

/*
 * T-12zs: isian bawaan widget dari statistik skema (bukan kolom angka/teks pertama) dan judul otomatis.
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const ROWS = 10_000;
const stats = (distinct: number, nullPct = 0) => ({
  distinct,
  nullPct,
  filled: Math.round(ROWS * (1 - nullPct)),
});
const sources: Source[] = [
  {
    id: S1,
    name: "Penjualan",
    columns: [
      { pos: 1, name: "No.", type: "integer", ...stats(ROWS) },
      { pos: 2, name: "No Resi", type: "text", ...stats(ROWS) },
      { pos: 3, name: "Nama Penerima", type: "text", ...stats(8_000) },
      { pos: 4, name: "Keterangan", type: "text", ...stats(5, 0.9) },
      { pos: 5, name: "Cabang", type: "text", ...stats(12, 0.01) },
      { pos: 6, name: "Urutan", type: "integer", ...stats(9_990) },
      { pos: 7, name: "Tanggal", type: "date", ...stats(300) },
      { pos: 8, name: "Omzet", type: "integer", ...stats(9_800) },
      { pos: 9, name: "Berat", type: "decimal", ...stats(700) },
    ],
  },
];
const cols = sources[0]!.columns;
const empty: WidgetConfig = { type: "empty", spec: {} };
const col = (pos: number) => cols.find((c) => c.pos === pos)!;

describe("kolom ID/nomor urut", () => {
  it("nama No./ID/Kode/Nomor (tanpa salah tangkap Nominal/Paid)", () => {
    for (const n of [
      "No",
      "No.",
      "NO",
      "Nomor Polisi",
      "ID Pelanggan",
      "Customer ID",
      "Kode Pos",
      "kd_cabang",
    ]) {
      expect(isIdName(n), n).toBe(true);
    }
    for (const n of ["Nominal", "Paid", "Omzet", "Kodeposan", "Nota"]) {
      expect(isIdName(n), n).toBe(false);
    }
  });

  it("bilangan bulat hampir semuanya unik = ID; kecuali nama besaran, desimal, atau sheet kecil", () => {
    expect(isIdLike(col(6))).toBe(true); // Urutan: 99,9% unik
    expect(isIdLike(col(8))).toBe(false); // Omzet: nama besaran
    expect(isIdLike({ ...col(9), distinct: ROWS })).toBe(false); // desimal
    expect(isIdLike({ pos: 1, name: "Urutan", type: "integer", distinct: 10, filled: 10 })).toBe(
      false,
    );
    // Skema lama tanpa statistik: hanya nama yang dinilai.
    expect(isIdLike({ pos: 1, name: "Urutan", type: "integer" })).toBe(false);
  });
});

describe("isian bawaan widget baru", () => {
  it("ukuran: Total kolom besaran pertama yang bukan ID (bukan Total No.)", () => {
    expect(measureCandidates(cols).map((c) => c.pos)).toEqual([8, 9]);
    for (const type of ["kpi", "bar", "line", "pie", "pivot"] as const) {
      const c = defaultConfig(type, sources, empty)!;
      const m = c.type === "pivot" ? c.spec.values[0] : (c.spec as { measure: unknown }).measure;
      expect(m, type).toEqual({ agg: "sum", column: 8 });
      expect(parseWidgetConfig(c.type, c.spec).ok).toBe(true);
    }
  });

  it("kategori: 2–50 nilai unik yang jarang kosong, lalu yang lain", () => {
    expect(categoryCandidates(cols).map((c) => c.pos)).toEqual([5, 4, 2, 3]);
    const bar = defaultConfig("bar", sources, empty)!;
    expect(bar.type === "bar" && bar.spec.dimension).toEqual({ column: 5 });
    const pie = defaultConfig("pie", sources, empty)!;
    expect(pie.type === "pie" && pie.spec.dimension).toEqual({ column: 5 });
    const pivot = defaultConfig("pivot", sources, empty)!;
    expect(pivot.type === "pivot" && pivot.spec.rows).toEqual([{ column: 5 }]);
    expect(pivot.type === "pivot" && pivot.spec.column).toEqual({ column: 7, timeGrain: "month" });
  });

  it("garis: kolom tanggal per bulan; tanggal yang sebagian besar kosong kalah", () => {
    const line = defaultConfig("line", sources, empty)!;
    expect(line.type === "line" && line.spec.dimension).toEqual({ column: 7, timeGrain: "month" });
    const two: Source[] = [
      {
        ...sources[0]!,
        columns: [
          { pos: 1, name: "Tgl Retur", type: "date", ...stats(40, 0.97) },
          { pos: 2, name: "Tgl Kirim", type: "date", ...stats(300) },
          { pos: 3, name: "Omzet", type: "decimal", ...stats(900) },
        ],
      },
    ];
    // Dari batang berkategori: garis tetap memakai tanggal; kembali ke batang memakai kategori lagi.
    const fromBar = defaultConfig("line", sources, defaultConfig("bar", sources, empty)!)!;
    expect(fromBar.type === "line" && fromBar.spec.dimension).toEqual({
      column: 7,
      timeGrain: "month",
    });
    const l2 = defaultConfig("line", two, empty)!;
    expect(l2.type === "line" && l2.spec.dimension).toEqual({ column: 2, timeGrain: "month" });
  });

  it("ukuran: bagian tanggal (Tahun/Bulan) paling akhir, nama besaran didahulukan (review)", () => {
    const year: Source[] = [
      {
        ...sources[0]!,
        columns: [
          { pos: 1, name: "No.", type: "integer", ...stats(ROWS) },
          { pos: 2, name: "Tahun", type: "integer", ...stats(2) },
          { pos: 3, name: "Bulan", type: "integer", ...stats(12) },
          { pos: 4, name: "Cabang", type: "text", ...stats(12) },
          { pos: 5, name: "Koreksi", type: "decimal", ...stats(50) },
          { pos: 6, name: "Nominal", type: "integer", ...stats(9_800) },
        ],
      },
    ];
    // Nominal hampir semuanya unik tetapi nama besaran → bukan ID; Tahun/Bulan paling akhir.
    expect(measureCandidates(year[0]!.columns).map((c) => c.pos)).toEqual([6, 5, 2, 3]);
    expect(autoTitle(defaultConfig("bar", year, empty)!, year)).toBe("Total Nominal per Cabang");
  });

  it("ganti Nilai dari Jumlah baris ke Total: kolom bukan ID (review)", () => {
    expect(measureForChoice("sum", { agg: "count" }, cols, "bar")).toEqual({
      agg: "sum",
      column: 8,
    });
  });

  it("tanpa kolom besaran: Jumlah baris", () => {
    const onlyIds: Source[] = [{ ...sources[0]!, columns: cols.filter((c) => c.pos <= 6) }];
    const kpi = defaultConfig("kpi", onlyIds, empty)!;
    expect(kpi.type === "kpi" && kpi.spec.measure).toEqual({ agg: "count" });
  });

  it("skema tanpa statistik: perilaku lama (kolom angka/teks pertama yang bukan No./ID)", () => {
    const old: Source[] = [
      {
        id: S1,
        name: "Lama",
        columns: [
          { pos: 1, name: "Pelanggan", type: "text" },
          { pos: 2, name: "Wilayah", type: "text" },
          { pos: 3, name: "Jumlah", type: "integer" },
          { pos: 4, name: "Harga", type: "decimal" },
        ],
      },
    ];
    const bar = defaultConfig("bar", old, empty)!;
    expect(bar.type === "bar" && bar.spec).toMatchObject({
      dimension: { column: 1 },
      measure: { agg: "sum", column: 3 },
    });
  });
});

describe("judul otomatis", () => {
  const bar = defaultConfig("bar", sources, empty)!;
  const line = defaultConfig("line", sources, empty)!;

  it("judul turunan dari pengaturan", () => {
    expect(autoTitle(bar, sources)).toBe("Total Omzet per Cabang");
    expect(autoTitle(line, sources)).toBe("Total Omzet per Tanggal (per bulan)");
    expect(autoTitle(defaultConfig("kpi", sources, empty)!, sources)).toBe("Total Omzet");
    expect(autoTitle(defaultConfig("pivot", sources, empty)!, sources)).toBe(
      "Total Omzet per Cabang",
    );
    expect(autoTitle(defaultConfig("table", sources, empty)!, sources)).toBe("Data Penjualan");
    expect(autoTitle(empty, sources)).toBe("");
    // Widget terikat pivot tersimpan: nama pivotnya.
    expect(autoTitle({ ...bar, source: { name: "Omzet bulanan" } }, sources)).toBe("Omzet bulanan");
  });

  it("judul kosong / judul turunan mengikuti; judul ketikan pengguna tetap", () => {
    expect(followTitle("", empty, bar, sources)).toBe("Total Omzet per Cabang");
    expect(followTitle("Total Omzet per Cabang", bar, line, sources)).toBe(
      "Total Omzet per Tanggal (per bulan)",
    );
    expect(followTitle("Omzet cabang Q3", bar, line, sources)).toBeNull();
    expect(followTitle("Total Omzet per Cabang", bar, bar, sources)).toBeNull();
    expect(followTitle("", bar, empty, sources)).toBeNull();
    // Judul otomatis lama yang gagal diganti tetap dianggap otomatis.
    expect(followTitle("Total Omzet", bar, line, sources)).toBeNull();
    expect(followTitle("Total Omzet", bar, line, sources, "Total Omzet")).toBe(
      "Total Omzet per Tanggal (per bulan)",
    );
  });

  it("judul panjang dipotong ke batas judul widget", () => {
    const long: Source[] = [
      {
        ...sources[0]!,
        columns: cols.map((c) => (c.pos === 5 ? { ...c, name: "Cabang ".repeat(20) } : c)),
      },
    ];
    const t = autoTitle(defaultConfig("bar", long, empty)!, long);
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith("…")).toBe(true);
  });
});
