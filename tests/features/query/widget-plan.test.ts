import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { widgetPlan } from "@/features/query/widget";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";

/*
 * Review T-016 SEC-1: widgetPlan memeriksa kolom (tersembunyi/hilang) SEBELUM aturan yang bergantung
 * pada tipe kolom, jadi tipe kolom tersembunyi tidak pernah memengaruhi jawaban.
 */
const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SHEET = "cmv4kljx40009oczvdmpurrsh";
const SCHEMA = [
  col(1, "Cabang", "text"),
  col(2, "Tanggal", "date"),
  col(3, "Tgl Rahasia", "date", true),
  col(4, "Nilai Rahasia", "decimal", true),
];

function chart(column: number, agg: string): Exclude<WidgetConfig, { type: "empty" }> {
  const c = parseWidgetConfig("bar", {
    sheetId: SHEET,
    dimension: { column: 1 },
    measure: { agg, column },
    sort: "value_desc",
    topN: 12,
    format: { style: "number", decimals: 0 },
  });
  if (!c.ok || c.config.type === "empty") throw new Error("spec uji tidak valid");
  return c.config;
}

describe("widgetPlan: kolom dulu, baru tipe", () => {
  it("min/maks pada kolom tanggal TERSEMBUNYI → COLUMN_UNAVAILABLE seperti kolom angka tersembunyi", () => {
    const date = widgetPlan(chart(3, "min"), SCHEMA, { page: 0 });
    const number = widgetPlan(chart(4, "min"), SCHEMA, { page: 0 });
    expect(date).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    expect(number).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    // Pesan rinci (untuk pemilik) hanya beda nama kolom, bukan bentuk/tipe.
    const shape = (r: ReturnType<typeof widgetPlan>) =>
      !r.ok && r.message.replace(/"[^"]*"/, '"…"');
    expect(shape(date)).toBe(shape(number));
  });

  it("kolom tanggal yang tampil: aturan tipe tetap berlaku (grafik hanya angka)", () => {
    expect(widgetPlan(chart(2, "max"), SCHEMA, { page: 0 })).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringContaining("nilai angka"),
    });
  });
});

describe("v1.21 pembanding KPI ukuran lain (T-djp6)", () => {
  const kpi = (reference: unknown) => {
    const c = parseWidgetConfig("kpi", {
      sheetId: SHEET,
      measure: { agg: "count" },
      format: { style: "auto", decimals: 0 },
      reference,
    });
    if (!c.ok) throw new Error(c.message);
    return c.config as Extract<WidgetConfig, { type: "kpi" }>;
  };
  it("ukuran pembanding = kolom hasil kedua", () => {
    const p = widgetPlan(kpi({ kind: "measure", measure: { agg: "count", column: 1 } }), SCHEMA, {
      page: 0,
    });
    expect(p.ok && p.spec.measures).toHaveLength(2);
  });
  it("kolom pembanding tersembunyi/hilang → pembanding dilewati, angka utama tetap", () => {
    const hidden = SCHEMA.find((c) => c.hidden)?.pos;
    for (const column of [hidden ?? 99, 99]) {
      const p = widgetPlan(kpi({ kind: "measure", measure: { agg: "count", column } }), SCHEMA, {
        page: 0,
      });
      expect(p.ok).toBe(true);
      expect(p.ok && p.spec.measures).toHaveLength(1);
    }
  });
});
