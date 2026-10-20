import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { applyDashFilters } from "@/features/query/filters";
import {
  PERIOD_COLUMN,
  PERIOD_NAME,
  PERIOD_NAME_SYSTEM,
  withPeriodColumn,
  withoutPeriodColumn,
} from "@/features/query/period-column";
import { resolveSpec } from "@/features/query/spec";
import { widgetPlan } from "@/features/query/widget";
import { MISSING_COLUMN, remapConfig, type SheetInfo } from "@/features/widgets/remap";
import { parseWidgetConfig } from "@/features/widgets/spec";

/* T-058 AC1/AC3: kolom sistem Periode di skema lapisan query/dashboard. Murni. */
const col = (pos: number, name: string, type: ColumnSchema["type"] = "text") =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const RAW = [col(1, "Cabang"), col(2, "Omzet", "decimal")];
const MONTH = { grain: "MONTH" as const, source: "LABEL", latest: "2026-03-01" };
const SHEET = "cmv4kljx40009oczvdmpusper";
const OLD = "cmv4kljx40009oczvdmpusold";
const NEW = "cmv4kljx40009oczvdmpusnew";

describe("withPeriodColumn", () => {
  it("sheet periode (termasuk mode label tanpa kolom tanggal) → + Periode bertipe tanggal", () => {
    const s = withPeriodColumn(RAW, MONTH);
    expect(s).toHaveLength(3);
    expect(s.at(-1)).toMatchObject({
      pos: PERIOD_COLUMN,
      name: PERIOD_NAME,
      type: "date",
      system: "period",
      periodGrain: "month",
      periodLatest: "2026-03-01",
      hidden: false,
    });
    expect(withoutPeriodColumn(s)).toEqual(RAW);
  });

  it("nama bentrok dengan kolom pengguna (tidak peka besar/kecil) → 'Periode (sistem)'", () => {
    const s = withPeriodColumn([...RAW, col(3, " PERIODE ")], MONTH);
    expect(s.at(-1)!.name).toBe(PERIOD_NAME_SYSTEM);
  });

  it("sheet non-periode / skema null / sudah ada → tidak berubah", () => {
    expect(withPeriodColumn(RAW, { grain: null, source: null })).toBe(RAW);
    expect(withPeriodColumn(RAW, { grain: "MONTH", source: null })).toBe(RAW);
    expect(withPeriodColumn(null, MONTH)).toBeNull();
    const once = withPeriodColumn(RAW, MONTH);
    expect(withPeriodColumn(once, MONTH)).toBe(once);
  });

  it("kuartal/tahun → grain bawaan sesuai satuan", () => {
    expect(withPeriodColumn(RAW, { ...MONTH, grain: "QUARTER" }).at(-1)!.periodGrain).toBe(
      "quarter",
    );
    expect(withPeriodColumn(RAW, { ...MONTH, grain: "YEAR" }).at(-1)!.periodGrain).toBe("year");
  });
});

describe("rencana widget dengan Periode", () => {
  const schema = withPeriodColumn(RAW, MONTH);

  it("dimensi Periode per bulan + tabel: plan.periodic, kolom fisik c<PERIOD_COLUMN>", () => {
    const r = resolveSpec(
      {
        sheetId: SHEET,
        dimensions: [{ column: "Periode", timeGrain: "month" }],
        measures: [{ agg: "sum", column: "Omzet" }],
        filters: [],
        sort: [],
        limit: 10,
      },
      schema,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.plan.dimensions[0]).toMatchObject({ col: `c${PERIOD_COLUMN}`, grain: "month" });
    expect(r.plan.periodic).toBe(true);
    const plain = resolveSpec(
      {
        sheetId: SHEET,
        dimensions: [{ column: "Cabang" }],
        measures: [],
        filters: [],
        sort: [],
        limit: 10,
      },
      RAW,
    );
    expect(plain.ok && plain.plan.periodic).toBeFalsy();
  });

  it("spec widget menerima posisi PERIOD_COLUMN", () => {
    const cfg = parseWidgetConfig("table", {
      sheetId: SHEET,
      columns: [PERIOD_COLUMN, 1],
      format: { style: "auto", decimals: 0 },
    });
    expect(cfg.ok).toBe(true);
    if (!cfg.ok || cfg.config.type === "empty") return;
    const p = widgetPlan(cfg.config, schema, { page: 0 });
    expect(p.ok && p.kind === "table" && p.plan.periodic).toBe(true);
  });
});

describe("filter dashboard 'Periode terbaru'", () => {
  const schema = withPeriodColumn(RAW, MONTH);
  const now = new Date("2026-10-20T03:00:00Z");

  it("kolom Periode → in [awal periode terbaru]", () => {
    const r = applyDashFilters(
      [{ column: "Periode", op: "preset", preset: "latest_period" }],
      schema,
      now,
    );
    expect(r.clauses).toEqual([
      { col: `c${PERIOD_COLUMN}`, type: "date", float: false, op: "in", values: ["2026-03-01"] },
    ]);
  });

  it("kolom tanggal biasa / tanpa periode terbaru → dilewati (skippedFilters)", () => {
    const withDate = [...RAW, col(3, "Tanggal", "date")];
    const r = applyDashFilters(
      [{ column: "Tanggal", op: "preset", preset: "latest_period" }],
      withDate,
      now,
    );
    expect(r).toEqual({ clauses: [], skipped: ["Tanggal"] });
    const noLatest = withPeriodColumn(RAW, { grain: "MONTH", source: "COLUMN" });
    expect(
      applyDashFilters(
        [{ column: "Periode", op: "preset", preset: "latest_period" }],
        noLatest,
        now,
      ).skipped,
    ).toEqual(["Periode"]);
  });
});

describe("remap widget lintas versi (aktivasi / ganti data)", () => {
  const cfg = parseWidgetConfig("table", {
    sheetId: OLD,
    columns: [PERIOD_COLUMN, 1],
    format: { style: "auto", decimals: 0 },
  });
  if (!cfg.ok || cfg.config.type === "empty") throw new Error("cfg");
  const config = cfg.config;
  const sheet = (id: string, schema: ColumnSchema[]): SheetInfo => ({
    id,
    name: "Data",
    index: 0,
    schema,
  });

  it("versi periode → versi periode: Periode tetap", () => {
    const r = remapConfig(
      config,
      sheet(OLD, withPeriodColumn(RAW, MONTH)),
      sheet(NEW, withPeriodColumn(RAW, MONTH)),
    );
    expect(r.missing).toEqual([]);
    expect(r.config.spec).toMatchObject({ sheetId: NEW, columns: [PERIOD_COLUMN, 1] });
  });

  it("rollback ke versi non-periode: Periode hilang (penanda), bukan kolom pengguna bernama sama", () => {
    const r = remapConfig(
      config,
      sheet(OLD, withPeriodColumn(RAW, MONTH)),
      sheet(NEW, [...RAW, col(3, "Periode", "date")]),
    );
    expect(r.missing).toEqual(["Periode"]);
    expect(r.config.spec).toMatchObject({ columns: [1, MISSING_COLUMN] });
  });
});
