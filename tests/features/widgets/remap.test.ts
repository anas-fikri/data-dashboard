import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  MISSING_COLUMN,
  markerNames,
  matchSheet,
  remapConfig,
  type SheetInfo,
} from "@/features/widgets/remap";

/*
 * T-013 (temuan T013-DI-1): rollback/roll-forward memetakan kolom widget lewat judul asli + urutan
 * kemunculan (kunci versi refresh), bukan nama tampil — ganti nama hanya mengenai versi aktif. Nama
 * tampil tetap cadangan bila judul asli berganti (T-011), tetapi tidak pernah menunjuk kolom sumber lain.
 */
const col = (pos: number, name: string, original = name) =>
  ({
    pos,
    name,
    original,
    type: "decimal",
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;

const OLD = "cmv4kljx40009oczvdmpurrol";
const NEW = "cmv4kljx40009oczvdmpurrnw";
const sheet = (id: string, schema: ColumnSchema[]): SheetInfo => ({
  id,
  name: "Penjualan",
  index: 0,
  schema,
});
const fmt = { style: "number", decimals: 0 } as const;
const kpi = (column: number) =>
  ({ type: "kpi", spec: { sheetId: OLD, measure: { agg: "sum", column }, format: fmt } }) as const;
const measureOf = (old: SheetInfo, target: SheetInfo, column: number) => {
  const r = remapConfig(kpi(column), old, target);
  const spec = r.config.spec as { sheetId: string; measure: { column?: number } };
  return { sheetId: spec.sheetId, column: spec.measure.column, missing: r.missing };
};

describe("remapConfig: kolom lewat judul asli + urutan", () => {
  it("ganti nama di versi baru lalu rollback → posisi sama, tidak ada yang hilang", () => {
    // Versi baru (aktif): "Omzet" diganti nama tampilnya; versi lama masih bernama asli.
    const newer = sheet(OLD, [col(1, "Cabang"), col(2, "Pendapatan", "Omzet")]);
    const older = sheet(NEW, [col(1, "Cabang"), col(2, "Omzet")]);
    expect(measureOf(newer, older, 2)).toEqual({ sheetId: NEW, column: 2, missing: [] });
  });

  it("nama tampil ditukar → tetap terikat ke judul asli yang sama", () => {
    const newer = sheet(OLD, [col(1, "Diskon", "Omzet"), col(2, "Omzet", "Diskon")]);
    const older = sheet(NEW, [col(1, "Omzet"), col(2, "Diskon")]);
    expect(measureOf(newer, older, 1)).toMatchObject({ column: 1, missing: [] });
    expect(measureOf(newer, older, 2)).toMatchObject({ column: 2, missing: [] });
  });

  it("judul kembar dicocokkan per urutan kemunculan, bukan posisi", () => {
    const old = sheet(OLD, [col(1, "Total"), col(2, "Kota"), col(3, "Total")]);
    const next = sheet(NEW, [col(1, "Tanggal"), col(2, "Total"), col(3, "Kota"), col(4, "Total")]);
    expect(measureOf(old, next, 3)).toMatchObject({ column: 4, missing: [] });
    expect(measureOf(old, next, 1)).toMatchObject({ column: 2, missing: [] });
  });

  it("judul asli berganti → cadangan lewat nama tampil (T-011)", () => {
    const old = sheet(OLD, [col(1, "Omzet", "Omzet (Rp)")]);
    const next = sheet(NEW, [col(1, "Tanggal"), col(2, " omzet ")]);
    expect(measureOf(old, next, 1)).toMatchObject({ column: 2, missing: [] });
  });

  it("cadangan nama tidak pernah menunjuk kolom yang judul aslinya juga ada di sheet lama", () => {
    // "Kota" diberi nama tampil "Total"; "Total" asli ada di target → itu kolom sumber lain.
    const old = sheet(OLD, [col(1, "Total", "Kota"), col(2, "Jumlah", "Total")]);
    const next = sheet(NEW, [col(1, "Total")]);
    expect(measureOf(old, next, 1)).toEqual({
      sheetId: NEW,
      column: MISSING_COLUMN,
      missing: ["Total"],
    });
    expect(measureOf(old, next, 2)).toMatchObject({ column: 1, missing: [] });
  });

  it("tabel: kolom yang hilang tetap satu penanda dengan nama tampil lama", () => {
    const old = sheet(OLD, [col(1, "Cabang"), col(2, "Laba", "Omzet"), col(3, "Catatan")]);
    const next = sheet(NEW, [col(1, "Omzet"), col(2, "Cabang")]);
    const r = remapConfig(
      {
        type: "table",
        spec: { sheetId: OLD, columns: [1, 2, 3], format: fmt, formatColumns: [2] },
      },
      old,
      next,
    );
    expect(r.config.spec).toMatchObject({
      sheetId: NEW,
      columns: [2, 1, MISSING_COLUMN],
      formatColumns: [1],
    });
    expect(r.missing).toEqual(["Catatan"]);
  });

  it("R2-CC-1b: penanda MISSING_COLUMN tetap penanda, namanya dari catatan tersimpan (bukan 'kolom 16385')", () => {
    const old = sheet(OLD, [col(1, "Cabang"), col(2, "Omzet")]);
    const next = sheet(NEW, [col(1, "Omzet"), col(2, "Cabang")]);
    const bar = {
      type: "bar",
      spec: {
        sheetId: OLD,
        dimension: { column: 1 },
        measure: { agg: "sum", column: MISSING_COLUMN },
        sort: "value_desc",
        topN: 12,
        format: fmt,
      },
    } as const;
    // Catatan juga memuat "Cabang" (hilang terhadap versi lain) — kolom itu ada di sheet spec.
    const r = remapConfig(bar, old, next, ["Cabang", "Diskon"]);
    expect(r.config.spec).toMatchObject({
      sheetId: NEW,
      dimension: { column: 2 },
      measure: { column: MISSING_COLUMN },
    });
    expect(r.missing).toEqual(["Diskon"]);
    expect(markerNames(bar, old.schema, ["Cabang", "Diskon"])).toEqual(["Diskon"]);
    // Tanpa catatan: penanda tanpa nama (pesan umum di query), tidak pernah "kolom 16385".
    expect(remapConfig(bar, old, next).missing).toEqual([]);
    // Spec tanpa penanda → tidak ada nama penanda.
    expect(markerNames(kpi(2), old.schema, ["Diskon"])).toEqual([]);
  });
});

describe("matchSheet + alias pemetaan (T-014)", () => {
  const s = (name: string, aliasName: string | null = null) => ({ name, aliasName });

  it("alias ke dua arah, nama sama didahulukan, alias ganda → null", () => {
    // Rollback: sheet lama "Sales" (alias "Penjualan") → target "Penjualan".
    expect(matchSheet(s("Sales", "Penjualan"), [s(" penjualan "), s("Retur")], 2)?.name).toBe(
      " penjualan ",
    );
    // Roll-forward: sheet lama "Penjualan" → target "Sales" (alias "Penjualan").
    expect(matchSheet(s("Penjualan"), [s("Sales", "PENJUALAN"), s("Retur")], 2)?.name).toBe(
      "Sales",
    );
    // Nama yang sama menang atas alias.
    expect(matchSheet(s("Penjualan"), [s("Sales", "Penjualan"), s("Penjualan")], 2)?.name).toBe(
      "Penjualan",
    );
    expect(matchSheet(s("Penjualan"), [s("A", "Penjualan"), s("B", "Penjualan")], 2)).toBeNull();
    // Alias kosong tidak pernah cocok dengan apa pun; fallback satu sheet tetap.
    expect(matchSheet(s("X", " "), [s(" "), s("Y")], 2)).toBeNull();
    expect(matchSheet(s("X"), [s("Y")], 1)?.name).toBe("Y");
  });

  it("rantai ganti nama V1 → V2 → V3 (alias = akar silsilah): rollback dan roll-forward ke versi mana pun", () => {
    const v1 = [s("Penjualan"), s("Target")];
    const v2 = [s("Sales", "Penjualan"), s("Target")];
    const v3 = [s("Revenue", "Penjualan"), s("Target")];
    // Rollback V3 → V1 (alias = nama) dan V3 → V2 (alias sama).
    expect(matchSheet(v3[0]!, v1, 2)).toBe(v1[0]);
    expect(matchSheet(v3[0]!, v2, 2)).toBe(v2[0]);
    // Roll-forward V1 → V3 (nama = alias) dan V2 → V3 (alias sama).
    expect(matchSheet(v1[0]!, v3, 2)).toBe(v3[0]);
    expect(matchSheet(v2[0]!, v3, 2)).toBe(v3[0]);
    expect(matchSheet(v2[0]!, v1, 2)).toBe(v1[0]);
    // Sheet lain tetap lewat nama.
    expect(matchSheet(v3[1]!, v1, 2)).toBe(v1[1]);
    // Alias sama di dua sheet target → tidak bisa ditentukan dengan aman.
    expect(matchSheet(v3[0]!, [s("A", "Penjualan"), s("B", "penjualan ")], 2)).toBeNull();
  });

  it("R3-INT-3 / R4-1: nama akar dipakai ulang sheet lain → ambigu, tidak ditebak (null)", () => {
    const v3 = [s("Revenue", "Sales"), s("Target"), s("Sales")];
    // Income keturunan Revenue (alias Sales) dan "Sales Baru" keturunan Sales baru (juga alias Sales)
    // tidak bisa dibedakan dari nama + alias: keduanya null, bukan pindah diam-diam ke silsilah lain.
    expect(matchSheet(s("Income", "Sales"), v3, 3)).toBeNull();
    expect(matchSheet(s("Sales Baru", "Sales"), v3, 3)).toBeNull();
    const v4 = [s("Income", "Sales"), s("Target"), s("Sales")];
    expect(matchSheet(v3[0]!, v4, 3)).toBeNull();
  });
});
