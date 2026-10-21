import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { pivotGrid } from "@/features/exports/pivot";
import { buildPivotSql, pivotOutTypes, shapePivot, type PivotData } from "@/features/query/pivot";
import { RESULT_MAX_BYTES, rowBytes, toJson } from "@/features/query/service";
import { widgetPlan, type WidgetQueryBody } from "@/features/query/widget";
import { pivotTable } from "@/features/widgets/pivot-table";
import {
  PIVOT_CELLS_MAX,
  PIVOT_COLUMNS_SHOWN,
  parseWidgetConfig,
  pivotSubtotalLevels,
  type PivotSpec,
  type WidgetConfig,
} from "@/features/widgets/spec";
import { LEGACY_CASES, legacyHashes } from "./pivot-legacy-cases";

/*
 * T-070: pivot 1–4 field baris × kolom pemisah × ≤ 8 nilai, subtotal per level, anggaran sel. Hasil
 * dibandingkan dengan kueri GROUP BY acuan (DuckDB, ekspresi agregat ditulis tangan) untuk sel, subtotal
 * tiap level, total baris/kolom, dan total keseluruhan; spec lama (≤ 2 baris, ≤ 3 nilai): SQL + kunci
 * cache identik dengan HEAD 52486eb (golden).
 */
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const ROWS = 3000;
const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
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
const SCHEMA: ColumnSchema[] = [
  col(1, "Pulau", "text"),
  col(2, "Layanan", "text"),
  col(3, "Kelas", "text"),
  col(4, "Omzet", "decimal"),
  col(5, "Zona", "text"),
  col(6, "Tanggal", "date"),
  col(7, "Qty", "integer"),
  col(8, "Resi", "text"),
];
/** Ekspresi acuan per kolom (mentah, tanpa kode aplikasi) — kunci teks tidak peka huruf besar/kecil. */
const KEY: Record<number, string> = {
  1: "lower(c1)",
  2: "lower(c2)",
  3: "lower(c3)",
  5: "lower(c5)",
  8: "lower(c8)",
  6: "strftime(date_trunc('month', c6), '%Y-%m-%d')",
};

let root: string;
let path: string;
let db: DuckDBInstance;
let conn: DuckDBConnection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-pivot-levels-"));
  path = join(root, "typed.parquet");
  db = await DuckDBInstance.create(":memory:");
  conn = await db.connect();
  // Variasi huruf besar/kecil ("BALI" = "Bali"), NULL di Kelas, 4 bulan, 250 resi.
  await conn.run(
    `COPY (SELECT CASE WHEN i % 97 = 0 THEN 'BALI' ELSE ['Jawa', 'Sumatra', 'Bali'][(i % 3) + 1] END AS c1,
                  ['Express', 'Reguler'][(i // 3) % 2 + 1] AS c2,
                  CASE WHEN i % 37 = 0 THEN NULL ELSE ['A', 'B', 'C'][(i // 6) % 3 + 1] END AS c3,
                  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c4,
                  ['x', 'y', 'z'][(i // 18) % 3 + 1] AS c5,
                  DATE '2026-01-01' + CAST(i % 120 AS INTEGER) AS c6,
                  CAST(i % 7 AS INTEGER) AS c7,
                  'R' || lpad(CAST(i % 250 AS VARCHAR), 3, '0') AS c8
           FROM range(${ROWS}) t(i)) TO '${path}' (FORMAT parquet)`,
  );
});
afterAll(() => {
  conn?.closeSync();
  db?.closeSync();
  rmSync(root, { recursive: true, force: true });
});

const margin = {
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 4 },
          { agg: "sum", column: 7 },
        ],
      },
      { agg: "sum", column: 4 },
    ],
  },
} as const;
const EIGHT = [
  { agg: "sum", column: 4 },
  { agg: "count" },
  { agg: "avg", column: 4 },
  { agg: "count_distinct", column: 2 },
  { agg: "min", column: 4 },
  { agg: "max", column: 4 },
  { agg: "sum", column: 7 },
  margin,
] as PivotSpec["values"];
/** Ekspresi acuan nilai di atas (DOUBLE). */
const REF_VALUES = [
  "sum(c4)",
  "count(*)",
  "avg(c4)",
  "count(DISTINCT c2)",
  "min(c4)",
  "max(c4)",
  "sum(c7)",
  "(sum(c4) - sum(c7)) / sum(c4)",
];

const base = {
  sheetId: SHEET,
  format: { style: "auto", decimals: 0 },
  sort: "value_desc",
  totals: true,
  subtotals: true,
} as const;

function planOf(spec: unknown, body: Partial<WidgetQueryBody> = {}) {
  const c = parseWidgetConfig("pivot", spec);
  if (!c.ok) throw new Error(c.message);
  const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, SCHEMA, {
    page: 0,
    ...body,
  });
  if (!w.ok || w.kind !== "pivot") throw new Error(w.ok ? "bukan pivot" : w.message);
  return w;
}

async function run(spec: unknown, body: Partial<WidgetQueryBody> = {}) {
  const w = planOf(spec, body);
  const built = buildPivotSql(w.plan, w.pivot, path);
  const raw = (await conn.runAndReadAll(built.sql, built.params)).getRowsJS() as unknown[][];
  const types = pivotOutTypes(w.plan, w.pivot);
  const rows = raw.map((r) => r.map((x, i) => toJson(x, types[i]!)));
  const bytes = rows.reduce((n, r) => n + rowBytes(r), 0);
  return { data: shapePivot(rows, w.plan, w.pivot), bytes, sql: built.sql };
}

/** Peta kunci (JSON) → nilai acuan untuk GROUP BY kolom `by` (posisi) atas `values` acuan. */
async function ref(by: number[], values = REF_VALUES): Promise<Map<string, number[]>> {
  const keys = by.map((p) => KEY[p]!);
  const sql =
    `SELECT ${[...keys.map((k, i) => `${k} AS g${i}`), ...values.map((v) => `CAST(${v} AS DOUBLE)`)].join(", ")} ` +
    `FROM read_parquet('${path}')${keys.length ? ` GROUP BY ${keys.map((_, i) => `g${i}`).join(", ")}` : ""}`;
  const out = new Map<string, number[]>();
  for (const r of (await conn.runAndReadAll(sql)).getRowsJS() as unknown[][]) {
    out.set(JSON.stringify(r.slice(0, keys.length)), r.slice(keys.length).map(Number));
  }
  return out;
}
const norm = (v: unknown) => (typeof v === "string" ? v.toLowerCase().slice(0, 40) : v);
const keyJson = (labels: unknown[]) => JSON.stringify(labels.map(norm));

function expectClose(actual: unknown[] | null | undefined, expected: number[] | undefined) {
  expect(expected, "kelompok acuan ada").toBeDefined();
  expect(actual, "sel pivot ada").toBeTruthy();
  actual!.forEach((v, i) => expect(Number(v)).toBeCloseTo(expected![i]!, 6));
}

/** Semua angka pivot (sel, subtotal semua level, total) = GROUP BY acuan. */
async function expectMatchesReference(p: PivotData, rowCols: number[], split?: number) {
  const n = rowCols.length;
  const cols = split ? [split] : [];
  const leaf = await ref([...rowCols, ...cols]);
  const leafTot = await ref(rowCols);
  p.rows.forEach((r, ri) => {
    p.columns.forEach((c, ci) => {
      const want = leaf.get(keyJson([...r.labels, c]));
      if (want) expectClose(p.cells[ri]![ci], want);
      else expect(p.cells[ri]![ci]).toBeNull();
    });
    if (!split) expectClose(p.cells[ri]![0], leafTot.get(keyJson(r.labels)));
    if (p.rowTotals) expectClose(p.rowTotals[ri], leafTot.get(keyJson(r.labels)));
  });
  // Subtotal setiap level induk (level 1 di groups/subtotals untuk baris 2 kolom).
  const levels =
    p.nest?.levels ??
    (n === 2 ? [{ labels: p.groups, subtotals: p.subtotals, totals: p.subtotalTotals }] : []);
  const paths = p.nest?.paths ?? p.rows.map((r) => (n === 2 ? [r.group!] : []));
  for (let l = 0; l < levels.length; l++) {
    const lv = levels[l]!;
    if (!lv.subtotals) continue;
    const prefix = rowCols.slice(0, l + 1);
    const byCol = await ref([...prefix, ...cols]);
    const byRow = await ref(prefix);
    lv.labels.forEach((_, g) => {
      const ri = paths.findIndex((path) => path[l] === g);
      const lab = p.rows[ri]!.labels.slice(0, l + 1);
      if (split) {
        p.columns.forEach((c, ci) => {
          const want = byCol.get(keyJson([...lab, c]));
          if (want) expectClose(lv.subtotals![g]![ci], want);
        });
        if (lv.totals) expectClose(lv.totals[g], byRow.get(keyJson(lab)));
      } else {
        expectClose(lv.subtotals![g]![0], byRow.get(keyJson(lab)));
      }
    });
  }
  const grand = (await ref([])).get("[]");
  expectClose(p.grandTotal, grand);
  if (split && p.columnTotals) {
    const byCol = await ref(cols);
    p.columns.forEach((c, ci) => expectClose(p.columnTotals![ci], byCol.get(keyJson([c]))));
  }
}

describe("AC 1: 4 field baris × kolom pemisah × 8 nilai = GROUP BY acuan", () => {
  const four = {
    ...base,
    rows: [{ column: 1 }, { column: 2 }, { column: 3 }, { column: 5 }],
    column: { column: 6, timeGrain: "month" },
    values: EIGHT,
  };

  it("sel, subtotal level 1–3, total baris/kolom, dan total keseluruhan", async () => {
    const { data: p } = await run(four);
    expect(p.rowFields.map((f) => f.label)).toEqual(["Pulau", "Layanan", "Kelas", "Zona"]);
    expect(p.values).toHaveLength(8);
    expect(p.columns).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
    // 3 pulau × 2 layanan × 4 kelas (termasuk kosong) × 3 zona.
    expect(p.rowCount).toBe(72);
    expect(p.nest?.levels.map((l) => l.labels.length)).toEqual([3, 6, 24]);
    // Label = variasi paling sering ("Bali", bukan "BALI").
    expect(p.nest?.levels[0]!.labels).toContain("Bali");
    await expectMatchesReference(p, [1, 2, 3, 5], 6);
  });

  it("model tabel: kepala kelompok per level berindentasi, baris terdalam level 3", async () => {
    const { data } = await run(four);
    const m = pivotTable(data);
    const depths = m.rows.map((r) => `${r.kind}${r.depth}`);
    expect(depths.slice(0, 4)).toEqual(["group0", "group1", "group2", "leaf3"]);
    expect(m.rows.filter((r) => r.kind === "leaf")).toHaveLength(72);
    expect(m.rows.filter((r) => r.kind === "group")).toHaveLength(3 + 6 + 24);
    // Setiap kepala kelompok membawa subtotal (8 nilai × (4 bulan + Total)).
    for (const r of m.rows) expect(r.values).toHaveLength(8 * 5);
    expect(m.fields.map((f) => f.role)).toEqual(["row0", "row1", "row2", "row3", "column"]);
    expect(m.rows[2]!.pick).toEqual({ field: "row2", raw: expect.anything() });
    expect(m.note).toBeNull();
  });

  it("sakelar Subtotal per level: hanya level 2 → kelompok lain tanpa angka", async () => {
    const { data: p, sql } = await run({ ...four, subtotalLevels: [2] });
    expect(p.nest?.levels.map((l) => !!l.subtotals)).toEqual([false, true, false]);
    expect(p.subtotals).toBeNull();
    expect(sql.match(/'sub'/g)).toHaveLength(1);
    await expectMatchesReference(p, [1, 2, 3, 5], 6);
    const m = pivotTable(p);
    const groups = m.rows.filter((r) => r.kind === "group");
    expect(groups.filter((r) => r.values.length).every((r) => r.depth === 1)).toBe(true);
  });

  it("subtotal mati: tidak ada baris subtotal, kepala kelompok tetap ada", async () => {
    const { data: p, sql } = await run({ ...four, subtotals: false });
    expect(sql).not.toContain("'sub'");
    expect(p.nest?.levels.every((l) => l.subtotals === null)).toBe(true);
    expect(pivotTable(p).rows.filter((r) => r.kind === "group" && r.values.length)).toHaveLength(0);
  });

  it("3 baris tanpa kolom pemisah, total mati", async () => {
    const { data: p } = await run({
      ...base,
      totals: false,
      sort: "label_asc",
      rows: [{ column: 3 }, { column: 1 }, { column: 2 }],
      values: EIGHT.slice(0, 5),
    });
    expect(p.grandTotal).toBeNull();
    const leaf = await ref([3, 1, 2], REF_VALUES.slice(0, 5));
    p.rows.forEach((r, ri) => expectClose(p.cells[ri]![0], leaf.get(keyJson(r.labels))));
    // Urut label naik level demi level; kosong (NULL) di akhir.
    expect(p.nest!.levels[0]!.labels).toEqual(["A", "B", "C", null]);
  });

  // Uji properti: spec acak 1–4 level (urutan, kolom pemisah, subtotal, nilai) = GROUP BY acuan.
  const DIMS = [1, 2, 3, 5];
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const CASES = Array.from({ length: 16 }, (_, i) => {
    const n = (i % 4) + 1;
    const rows = [...DIMS].sort(() => rand() - 0.5).slice(0, n);
    const nv = 1 + Math.floor(rand() * 8);
    const pick = [...EIGHT.keys()].sort(() => rand() - 0.5).slice(0, nv);
    return {
      n,
      rows,
      pick,
      split: rand() < 0.6,
      sort: (["value_desc", "value_asc", "label_asc", "label_desc"] as const)[
        Math.floor(rand() * 4)
      ],
      subtotals: rand() < 0.7,
    };
  });
  it.each(CASES)("properti: %j", async (c) => {
    const spec = {
      ...base,
      sort: c.sort,
      subtotals: c.subtotals,
      rows: c.rows.map((column) => ({ column })),
      ...(c.split ? { column: { column: 6, timeGrain: "month" } } : {}),
      values: c.pick.map((i) => EIGHT[i]!),
    };
    const { data: p } = await run(spec);
    const refValues = c.pick.map((i) => REF_VALUES[i]!);
    const leaf = await ref([...c.rows, ...(c.split ? [6] : [])], refValues);
    const tot = await ref(c.rows, refValues);
    expect(p.rowCount).toBe(tot.size);
    p.rows.forEach((r, ri) => {
      if (!c.split) return expectClose(p.cells[ri]![0], tot.get(keyJson(r.labels)));
      p.columns.forEach((col, ci) => {
        const want = leaf.get(keyJson([...r.labels, col]));
        if (want) expectClose(p.cells[ri]![ci], want);
        else expect(p.cells[ri]![ci]).toBeNull();
      });
      expectClose(p.rowTotals![ri], tot.get(keyJson(r.labels)));
    });
    expectClose(p.grandTotal, (await ref([], refValues)).get("[]"));
    // Subtotal setiap level induk = GROUP BY awalan.
    const levels =
      p.nest?.levels ??
      (c.n === 2 ? [{ labels: p.groups, subtotals: p.subtotals, totals: p.subtotalTotals }] : []);
    const paths = p.nest?.paths ?? p.rows.map((r) => (c.n === 2 ? [r.group!] : []));
    expect(levels.length).toBe(c.n - 1);
    for (let l = 0; l < levels.length; l++) {
      expect(!!levels[l]!.subtotals).toBe(c.subtotals);
      if (!c.subtotals) continue;
      const pre = await ref(c.rows.slice(0, l + 1), refValues);
      levels[l]!.labels.forEach((_, g) => {
        const ri = paths.findIndex((path) => path[l] === g);
        const lab = p.rows[ri]!.labels.slice(0, l + 1);
        expectClose(
          c.split ? levels[l]!.totals![g] : levels[l]!.subtotals![g]![0],
          pre.get(keyJson(lab)),
        );
      });
    }
    // Urutan: baris terdalam tersusun per kelompok induk (kelompok tidak terpecah).
    const seen = new Set<string>();
    let prev = "";
    for (const r of p.rows) {
      const parent = keyJson(r.labels.slice(0, -1));
      if (parent !== prev) {
        expect(seen.has(parent)).toBe(false);
        seen.add(parent);
        prev = parent;
      }
    }
  });
});

describe("AC 2: anggaran sel 24.000", () => {
  // 250 resi per tanggal harian (120 hari → 40 kolom) × 8 nilai: 200 baris × 40 × 8 > 24.000.
  const wide = {
    ...base,
    sort: "label_asc",
    rows: [{ column: 8 }],
    column: { column: 6, timeGrain: "day" },
    values: EIGHT,
  };

  it("kolom tampil dipangkas otomatis, catatan, total tetap semua kolom", async () => {
    const { data: p, bytes } = await run(wide);
    expect(p.rows).toHaveLength(200);
    expect(p.columnCount).toBe(120);
    const shown = Math.floor(PIVOT_CELLS_MAX / (200 * 8));
    expect(p.columns).toHaveLength(shown);
    expect(p.rows.length * p.columns.length * 8).toBeLessThanOrEqual(PIVOT_CELLS_MAX);
    expect(bytes).toBeLessThanOrEqual(RESULT_MAX_BYTES);
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(RESULT_MAX_BYTES);
    // Total baris = seluruh 120 hari, bukan hanya kolom tampil.
    const tot = await ref([8]);
    p.rows.forEach((r, ri) => expectClose(p.rowTotals![ri], tot.get(keyJson(r.labels))));
    const m = pivotTable(p);
    expect(m.note).toBe(
      `Menampilkan 200 dari 250 baris dan ${shown} dari 120 kolom — kurangi nilai atau tambah Saring; total tetap mencakup semua baris dan kolom.`,
    );
  });

  it("baris sedikit: tidak dipangkas di bawah 40 (anggaran dihitung dari baris tampil)", async () => {
    const { data: p } = await run({ ...wide, rows: [{ column: 1 }] });
    expect(p.rows).toHaveLength(3);
    expect(p.columns).toHaveLength(PIVOT_COLUMNS_SHOWN);
    expect(pivotTable(p).note).toBe(
      "Menampilkan 40 dari 120 kolom. Persempit dengan filter; total tetap mencakup semua data.",
    );
  });

  it("baris subtotal ikut dihitung; minimal 1 kolom", async () => {
    // 4 level ber-subtotal: 200 baris terdalam + kepala kelompok bersubtotal.
    const { data: p, bytes } = await run({
      ...wide,
      rows: [{ column: 1 }, { column: 2 }, { column: 5 }, { column: 8 }],
    });
    const m = pivotTable(p);
    const body = m.rows.filter((r) => r.values.length).length;
    expect(body * p.columns.length * 8).toBeLessThanOrEqual(PIVOT_CELLS_MAX);
    expect(p.columns.length).toBe(Math.max(1, Math.floor(PIVOT_CELLS_MAX / (body * 8))));
    expect(bytes).toBeLessThanOrEqual(RESULT_MAX_BYTES);
  });

  it("satu nilai, 4 level bersubtotal, kelompok berisi satu baris: tetap ≤ 5 MB", async () => {
    const { data: p, bytes } = await run({
      ...wide,
      rows: [{ column: 8 }, { column: 1 }, { column: 2 }, { column: 5 }],
      values: [{ agg: "count" }],
    });
    expect(p.rows).toHaveLength(200);
    const body = pivotTable(p).rows.filter((r) => r.values.length).length;
    expect(body * p.columns.length).toBeLessThanOrEqual(16_000);
    expect(bytes).toBeLessThanOrEqual(RESULT_MAX_BYTES);
  });
});

describe("Tampilkan nilai sebagai pada 4 level", () => {
  it("total berjalan/selisih tanpa pemisah: sepanjang baris terdalam per kelompok induk", async () => {
    const { data: p } = await run({
      ...base,
      sort: "label_asc",
      rows: [{ column: 1 }, { column: 2 }, { column: 3 }, { column: 5 }],
      values: [
        { agg: "sum", column: 4, showAs: "running" },
        { agg: "sum", column: 4, showAs: "diff_prev" },
        { agg: "sum", column: 4 },
      ],
    });
    const raw = await ref([1, 2, 3, 5], ["sum(c4)"]);
    // Kelompok induk (3 level pertama) → baris terdalam urut label naik.
    const groups = new Map<string, [unknown, number][]>();
    for (const [k, v] of raw) {
      const keys = JSON.parse(k) as unknown[];
      const g = JSON.stringify(keys.slice(0, 3));
      groups.set(g, [...(groups.get(g) ?? []), [keys[3], v[0]!]]);
    }
    p.rows.forEach((r, ri) => {
      const list = groups
        .get(keyJson(r.labels.slice(0, 3)))!
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const at = list.findIndex(([z]) => z === norm(r.labels[3]));
      const running = list.slice(0, at + 1).reduce((s, [, v]) => s + v, 0);
      const cell = p.cells[ri]![0]!;
      expect(Number(cell[0])).toBeCloseTo(running, 6);
      if (at === 0) expect(cell[1]).toBeNull();
      else expect(Number(cell[1])).toBeCloseTo(list[at]![1] - list[at - 1]![1], 6);
    });
    // Subtotal/total: total berjalan dan selisih kosong.
    for (const lv of p.nest!.levels) for (const s of lv.subtotals!) expect(s[0]![0]).toBeNull();
  });

  it("% total baris dengan pemisah: subtotal tiap level dibagi total baris kelompoknya", async () => {
    const { data: p } = await run({
      ...base,
      rows: [{ column: 1 }, { column: 2 }, { column: 3 }],
      column: { column: 6, timeGrain: "month" },
      values: [
        { agg: "sum", column: 4, showAs: "pct_row" },
        { agg: "sum", column: 4, showAs: "pct_col" },
      ],
    });
    for (let l = 0; l < 2; l++) {
      const prefix = [1, 2, 3].slice(0, l + 1);
      const byCol = await ref([...prefix, 6], ["sum(c4)"]);
      const byRow = await ref(prefix, ["sum(c4)"]);
      const byMonth = await ref([6], ["sum(c4)"]);
      const lv = p.nest!.levels[l]!;
      lv.labels.forEach((_, g) => {
        const ri = p.nest!.paths.findIndex((path) => path[l] === g);
        const lab = p.rows[ri]!.labels.slice(0, l + 1);
        p.columns.forEach((c, ci) => {
          const v = byCol.get(keyJson([...lab, c]))?.[0];
          const cell = lv.subtotals![g]![ci];
          if (v === undefined) return;
          expect(Number(cell![0])).toBeCloseTo(v / byRow.get(keyJson(lab))![0]!, 9);
          expect(Number(cell![1])).toBeCloseTo(v / byMonth.get(keyJson([c]))![0]!, 9);
        });
        // Kolom Total baris subtotal = 100% dari total barisnya sendiri.
        expect(Number(lv.totals![g]![0])).toBeCloseTo(1, 9);
      });
    }
  });
});

describe("AC 3: ekspor CSV/XLSX — semua level baris menjadi kolom terpisah", () => {
  it("4 kolom label, label induk diulang, subtotal berlabel di levelnya", async () => {
    const { data } = await run({
      ...base,
      sort: "label_asc",
      rows: [{ column: 1 }, { column: 2 }, { column: 3 }, { column: 5 }],
      column: { column: 6, timeGrain: "month" },
      values: EIGHT.slice(0, 2),
    });
    const grid = pivotGrid(
      pivotTable(data),
      data.rowFields.map((f) => f.label),
    );
    expect(grid.columns.slice(0, 5).map((c) => c.label)).toEqual([
      "Pulau",
      "Layanan",
      "Kelas",
      "Zona",
      "Jan 2026 · Total Omzet",
    ]);
    expect(grid.columns).toHaveLength(4 + 2 * 5);
    const [g0, g1, g2, l3] = grid.rows.slice(0, 4);
    expect(g0!.slice(0, 4)).toEqual(["Bali", "Subtotal", null, null]);
    expect(g1!.slice(0, 4)).toEqual(["Bali", "Express", "Subtotal", null]);
    expect(g2!.slice(0, 4)).toEqual(["Bali", "Express", "A", "Subtotal"]);
    expect(l3!.slice(0, 4)).toEqual(["Bali", "Express", "A", "x"]);
    expect(grid.rows.at(-1)!.slice(0, 4)).toEqual(["Total", null, null, null]);
    // Setiap baris selebar kolomnya.
    for (const r of grid.rows) expect(r).toHaveLength(grid.columns.length);
  });
});

describe("validasi dan spec lama", () => {
  const ok = (spec: unknown) => parseWidgetConfig("pivot", spec).ok;
  const r = (n: number) => [1, 2, 3, 5, 8].slice(0, n).map((column) => ({ column }));
  it("baris 1–4 dan nilai 1–8 diterima; 5 baris / 9 nilai ditolak", () => {
    expect(ok({ ...base, rows: r(4), values: EIGHT })).toBe(true);
    expect(ok({ ...base, rows: r(5), values: EIGHT.slice(0, 1) })).toBe(false);
    expect(ok({ ...base, rows: r(1), values: [...EIGHT, { agg: "count" }] })).toBe(false);
  });
  it("subtotalLevels: 1–3, tanpa ganda; level di luar jumlah baris diabaikan", () => {
    expect(ok({ ...base, rows: r(4), values: EIGHT, subtotalLevels: [1, 3] })).toBe(true);
    expect(ok({ ...base, rows: r(4), values: EIGHT, subtotalLevels: [2, 2] })).toBe(false);
    expect(ok({ ...base, rows: r(4), values: EIGHT, subtotalLevels: [4] })).toBe(false);
    expect(pivotSubtotalLevels({ rows: r(4), subtotals: true })).toEqual([1, 2, 3]);
    expect(pivotSubtotalLevels({ rows: r(2), subtotals: true, subtotalLevels: [3] })).toEqual([]);
    expect(pivotSubtotalLevels({ rows: r(3), subtotals: false, subtotalLevels: [1] })).toEqual([]);
  });
  it("saringan pembaca baris 3–4 diterapkan", async () => {
    const spec = {
      ...base,
      rows: [{ column: 1 }, { column: 2 }, { column: 3 }, { column: 5 }],
      values: [{ agg: "count" }],
    };
    const { data: p } = await run(spec, {
      pivotFilters: [
        { field: "row2", column: "Kelas", op: "in", values: ["a", null] },
        { field: "row3", column: "Zona", op: "not_in", values: ["x"] },
      ],
    });
    expect(new Set(p.rows.map((x) => x.labels[2]))).toEqual(new Set(["A", null]));
    expect(p.rows.every((x) => x.labels[3] !== "x")).toBe(true);
    expect(p.filters).toHaveLength(2);
  });

  // Golden dari HEAD 52486eb (sebelum T-070) — tests/features/query/pivot-legacy-cases.ts.
  const GOLDEN: Record<string, [string, string]> = {
    "1 baris, 1 nilai": [
      "10631806f49366c47993e3e15cb140dad2288684a40032b2272988819c562e78",
      "d50bbdaf8d37d221737f8795e9bb4f86abd674bdcc2f272387e588a24cf2d62e",
    ],
    "1 baris + kolom, 3 nilai": [
      "db2d862431bc4d84db5d4124a2fdda0a3f2ea2e5eddaf2743e2c5f2a374c79ac",
      "e008d3936fe2663daa2d6b01f6b503f0926ca248181bdf72257971a7e7778373",
    ],
    "2 baris + kolom + subtotal, 3 nilai": [
      "24a26e16832abd7824b517ba78d204ed3443d3c264587f7514cad7c6cf8d1f30",
      "bcf3ce402d1946bfd31915f858db0482712709b4b512f89bc2e11265f4a2cc52",
    ],
    "2 baris tanpa subtotal/total, urut label": [
      "7cbf830c33170c742554277e2b9489468ecebd2e6b6f36fc9b186a3ed600b95b",
      "ec2da2093df2e8f7674eaddbf665773ab8b71dedcea55a32bfe3dbbdba394d9b",
    ],
    "2 baris + kolom, showAs semua jenis": [
      "68c7ce50f67f08b56fa36adbc38cf616a5eeb56c0ab6329c496857d013e1e0cc",
      "841b3c022010931ad9856aa746c3915ac18c3c74a70d7301578caa7daffed9fa",
    ],
    "2 baris tanpa kolom, selisih + % grand": [
      "b19fe76dd7a1e36b7447c719be79e1a3736e2fec52f1573537a28b08dec1ea5c",
      "87e2f1bb28410fbb6232e2f487a16a0d42dc3bd7fcff440f7dcb4126f3e25511",
    ],
    "1 baris tanpa kolom, % baris": [
      "36bd8317ccd24246d990caf3f2209501af5634df8fe606fe423dcfe335120a81",
      "8c6ad7aa0b5078a93d11ade09ef59f9d83ce88927fc2b02162df0ef405729567",
    ],
    "field terhitung + Saring + filter silang": [
      "517ede97be59e336a41bc3873339ebcd55b1d5ced8b04bf4298a73d36b967f03",
      "6e487c51dc1987e81c7b90bea9b46c050df7a8d4207d4dc4da6fc8be70f7d559",
    ],
    "saringan pembaca baris 2 + kolom": [
      "4bd6797191919d156abc7dc66037f181c151536a9be17cbd83d93a6130360cf1",
      "24e6801668188589ed5120657132740825ebd5f885e18125f9d450d2e0217605",
    ],
    "daftar nilai baris 2": [
      "2a6231fb85480322621ff00d32d5f6361c660e1edf61dd7880325c444aba1780",
      "8789dadbe954a0fe21ab8565018d13490cd46468ee6339ecb0809b788e6c68bb",
    ],
  };
  it.each(LEGACY_CASES)("spec lama %s: kunci cache + SQL sama persis", (name, spec, body) => {
    expect(legacyHashes(spec, body)).toEqual(GOLDEN[name]);
  });
});
