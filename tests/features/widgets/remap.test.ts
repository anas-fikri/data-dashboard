import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { MISSING_COLUMN, remapConfig, type SheetInfo } from "@/features/widgets/remap";

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
});
