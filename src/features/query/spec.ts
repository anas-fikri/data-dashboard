/*
 * Spec query deklaratif (T-009, alur B4): validasi bentuk (zod, enum tertutup, batas jumlah) lalu
 * resolusi terhadap skema sheet aktif. Kolom dirujuk dengan nama tampil; hasilnya rencana dengan kolom
 * fisik c<pos> sehingga nama dari user tidak pernah masuk SQL. Murni (tanpa I/O).
 */
import { z } from "zod";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import {
  calcExprSchema,
  calcLabelSchema,
  isCalcConst,
  isCalcLeaf,
  type CalcExpr,
} from "@/features/widgets/calc";
import type { NumberFormat, ShowAs } from "@/features/widgets/spec";
import type { DashClause } from "./filters";

export const SPEC_MAX_BYTES = 64 * 1024;
export const LIMIT_MAX = 10_000;

const AGGS = ["count", "count_distinct", "sum", "avg", "min", "max"] as const;
const GRAINS = ["day", "week", "month", "quarter", "year"] as const;
export const FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "contains",
  "is_null",
  "not_null",
] as const;
export type Agg = (typeof AGGS)[number];
export type Grain = (typeof GRAINS)[number];
export type FilterOp = (typeof FILTER_OPS)[number];

const colName = z.string().min(1).max(200);

/** Format angka (sama dengan widgets/spec formatSchema; disalin agar modul ini tidak mengimpor nilai). */
const numberFormat = z
  .object({
    style: z.enum(["auto", "number", "percent", "rupiah"]),
    decimals: z.number().int().min(0).max(4),
  })
  .strict();
/**
 * Field terhitung (T-068, ADR-0009): pohon ekspresi atas agregat, kolom lewat nama; divalidasi
 * calc.ts (operator tertutup, batas node/kedalaman/agregat, konstanta berhingga). Tidak ada teks SQL.
 */
const calcMeasure = z
  .object({
    kind: z.literal("calc"),
    label: calcLabelSchema,
    expr: calcExprSchema(colName),
    format: numberFormat.optional(),
  })
  .strict();
const aggMeasure = z.object({ column: colName.optional(), agg: z.enum(AGGS) }).strict();
/** Ukuran: agregat biasa (bentuk lama, tanpa `kind`) atau field terhitung (`kind: "calc"`). */
const measureSchema = z
  .unknown()
  .transform((v, ctx): z.output<typeof aggMeasure> | z.output<typeof calcMeasure> => {
    const calc = typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "calc";
    const r = (calc ? calcMeasure : aggMeasure).safeParse(v);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue(i);
      return z.NEVER;
    }
    return r.data;
  });
// Angka bulat di-bind sebagai BIGINT oleh DuckDB: di luar ±2^53 ditolak 400, bukan 500 (review T-011 L2).
export const filterScalar = z.union([
  z.string().max(1_000),
  z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  z.boolean(),
]);

export const specSchema = z
  .object({
    sheetId: z.string().regex(/^[a-z0-9]{20,32}$/),
    dimensions: z
      .array(z.object({ column: colName, timeGrain: z.enum(GRAINS).optional() }).strict())
      .max(3)
      .default([]),
    measures: z.array(measureSchema).max(10).default([]),
    filters: z
      .array(
        z
          .object({
            column: colName,
            op: z.enum(FILTER_OPS),
            value: filterScalar.optional(),
            values: z.array(filterScalar).max(500).optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    /** Urutan hasil: kunci keluaran "d0".."d2" (dimensi) atau "m0".."m9" (ukuran). */
    sort: z
      .array(z.object({ by: z.string().regex(/^[dm]\d$/), dir: z.enum(["asc", "desc"]) }).strict())
      .max(4)
      .default([]),
    limit: z.number().int().min(1).max(LIMIT_MAX).default(1_000),
  })
  .strict();

export type QuerySpec = z.infer<typeof specSchema>;

export const bodySchema = z
  .object({ datasetId: z.string().regex(/^[a-z0-9]{20,32}$/), spec: specSchema })
  .strict();

/**
 * Mode editor (T-016, D6): spec bebas terhadap dataset dashboard. Dataset/versi aktif diambil dari
 * dashboard di server, tidak pernah dari body (field lain → INVALID).
 */
export const dashboardBodySchema = z
  .object({ dashboardId: z.string().regex(/^[a-z0-9]{20,32}$/), spec: specSchema })
  .strict();

/** Kolom keluaran (kunci stabil d<i>/m<i>, label untuk tampilan). */
export interface OutColumn {
  key: string;
  label: string;
  type: ColumnType | "count";
  /**
   * Kolom sistem Periode (T-058): satuan periode — sel tabel/label tampil "Mar 2026", bukan tanggal
   * awal periode. Kolom lain tanpa field ini.
   */
  grain?: Grain;
  /** Ukuran widget dengan "Tampilkan nilai sebagai" (T-067); nilai biasa tanpa field ini. */
  showAs?: ShowAs;
  /** Field terhitung dengan format sendiri (T-068); tanpa field ini = format widget. */
  format?: NumberFormat;
}

export interface PlanDimension {
  key: string;
  col: string;
  type: ColumnType;
  grain?: Grain;
}
export interface PlanAggMeasure {
  key: string;
  agg: Agg;
  /** Kolom fisik; tidak ada untuk count(*). */
  col?: string;
  /**
   * "Tampilkan nilai sebagai" (T-067): hanya dari spec widget tersimpan (widgetPlan), tidak pernah
   * dari spec query bebas klien. Tidak ada / "none" = agregat biasa (SQL lama, identik).
   */
  showAs?: ShowAs;
}
/** Daun rumus terselesaikan: agregat atas kolom fisik c<pos> + jenis angka hasilnya. */
export interface PlanCalcLeaf {
  agg: Agg;
  col?: string;
  num: CalcNum;
}
/** Konstanta rumus: nilai + nama parameter ($<param>), tidak pernah ditulis ke teks SQL. */
export interface PlanCalcConst {
  const: number;
  param: string;
}
export type PlanCalcExpr =
  | { op: "add" | "sub" | "mul" | "div"; args: [PlanCalcExpr, PlanCalcExpr] }
  | { op: "neg"; args: [PlanCalcExpr] }
  | PlanCalcLeaf
  | PlanCalcConst;
/**
 * Jenis angka: "integer" (BIGINT/HUGEINT), "decimal" (DECIMAL(38,6) tepat), "double" (DOUBLE). Hasil
 * rumus tepat (integer/decimal) hanya bila semua operasi +/−/negatif atas daun tepat dan konstanta
 * bulat; selain itu DOUBLE (rencana G-7 §3.2).
 */
export type CalcNum = "integer" | "decimal" | "double";
/** Field terhitung (T-068): dikompilasi sql.ts calcSql di atas measureExpr daun-daunnya. */
export interface PlanCalcMeasure {
  key: string;
  calc: { expr: PlanCalcExpr; num: CalcNum; additive: boolean };
  showAs?: ShowAs;
}
export type PlanMeasure = PlanAggMeasure | PlanCalcMeasure;
export const isPlanCalc = (m: PlanMeasure): m is PlanCalcMeasure => "calc" in m;
export interface PlanFilter {
  col: string;
  type: ColumnType;
  op: FilterOp;
  values: (string | number | boolean)[];
}
export interface Plan {
  /**
   * Tambahkan jumlah kategori + total ukuran seluruh kategori (sebelum LIMIT) — grafik widget memakai
   * ini untuk irisan "Lainnya" dan keterangan "N teratas dari M" (T-011).
   */
  totals?: boolean;
  dimensions: PlanDimension[];
  measures: PlanMeasure[];
  filters: PlanFilter[];
  /** Filter dashboard (T-012) yang berlaku untuk sheet widget ini; di-AND dengan `filters`. */
  dash?: DashClause[];
  sort: { key: string; dir: "asc" | "desc" }[];
  limit: number;
  columns: OutColumn[];
  /**
   * Sheet periode (T-058): sumber membawa `_period`, urutan baris bawaan tabel = (_period, _row) —
   * kronologis walau periode lama diunggah belakangan (`_row` naik menurut urutan unggah).
   */
  periodic?: boolean;
}

export type Resolved = { ok: true; plan: Plan } | { ok: false; message: string };

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];
const ORDERED: ColumnType[] = [...NUMERIC, "date", "timestamp"];
const TEMPORAL: ColumnType[] = ["date", "timestamp"];

const AGG_TYPES: Record<Agg, ColumnType[] | "any"> = {
  count: "any",
  count_distinct: "any",
  sum: NUMERIC,
  avg: NUMERIC,
  min: ORDERED,
  max: ORDERED,
};

// count dengan kolom = baris yang kolom itu berisi (COUNTA); count tanpa kolom berlabel "Jumlah baris" di bawah.
const AGG_LABEL: Record<Agg, string> = {
  count: "Jumlah terisi",
  count_distinct: "Jumlah unik",
  sum: "Total",
  avg: "Rata-rata",
  min: "Minimum",
  max: "Maksimum",
};

/** Tanggal/waktu ISO yang benar-benar ada (2024-02-30 atau 25:99 ditolak sebelum DuckDB, review F5). */
export function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m) return false;
  const [y, mo, d, h = "0", mi = "0", s = "0"] = m.slice(1).map((x) => x ?? undefined) as string[];
  const t = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    t.getUTCFullYear() === Number(y) &&
    t.getUTCMonth() === Number(mo) - 1 &&
    t.getUTCDate() === Number(d) &&
    Number(h) < 24 &&
    Number(mi) < 60 &&
    Number(s) < 60
  );
}

/** Nilai filter sesuai tipe kolom; tanggal berupa teks ISO (YYYY-MM-DD[THH:MM[:SS]]). */
function checkValue(type: ColumnType, v: string | number | boolean): boolean {
  switch (type) {
    case "integer":
    case "decimal":
    case "duration":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "date":
    case "timestamp":
      return typeof v === "string" && isCalendarDate(v);
    case "text":
      return typeof v === "string";
  }
}

/** Cocokkan spec dengan skema sheet aktif; pesan error dalam bahasa user (HTTP 400). */
export function resolveSpec(spec: QuerySpec, schema: ColumnSchema[]): Resolved {
  const byName = new Map(schema.filter((c) => !c.hidden).map((c) => [c.name, c]));
  const col = (name: string) => byName.get(name);
  const fail = (message: string): Resolved => ({ ok: false, message });

  if (spec.dimensions.length === 0 && spec.measures.length === 0) {
    return fail("Pilih minimal satu dimensi atau ukuran.");
  }

  const columns: OutColumn[] = [];
  const dimensions: PlanDimension[] = [];
  for (const [i, d] of spec.dimensions.entries()) {
    const c = col(d.column);
    if (!c) return fail(`Kolom "${d.column}" tidak ada atau disembunyikan.`);
    if (d.timeGrain && !TEMPORAL.includes(c.type)) {
      return fail(`Pengelompokan waktu hanya untuk kolom tanggal ("${d.column}").`);
    }
    dimensions.push({ key: `d${i}`, col: `c${c.pos}`, type: c.type, grain: d.timeGrain });
    const grain = c.system === "period" ? (d.timeGrain ?? c.periodGrain) : undefined;
    columns.push({ key: `d${i}`, label: c.name, type: c.type, ...(grain ? { grain } : {}) });
  }

  const measures: PlanMeasure[] = [];
  for (const [i, m] of spec.measures.entries()) {
    if ("kind" in m) {
      const r = resolveCalc(m.expr, `m${i}`, col);
      if (!r.ok) return fail(r.message);
      measures.push({ key: `m${i}`, calc: r.calc });
      columns.push({
        key: `m${i}`,
        label: m.label,
        type: r.calc.num === "integer" ? "integer" : "decimal",
        ...(m.format ? { format: m.format } : {}),
      });
      continue;
    }
    if (!m.column) {
      if (m.agg !== "count") return fail(`Agregasi "${m.agg}" membutuhkan kolom.`);
      measures.push({ key: `m${i}`, agg: "count" });
      columns.push({ key: `m${i}`, label: "Jumlah baris", type: "count" });
      continue;
    }
    const c = col(m.column);
    if (!c) return fail(`Kolom "${m.column}" tidak ada atau disembunyikan.`);
    const allowed = AGG_TYPES[m.agg];
    if (allowed !== "any" && !allowed.includes(c.type)) {
      return fail(`Agregasi "${AGG_LABEL[m.agg]}" tidak bisa dipakai untuk kolom "${c.name}".`);
    }
    measures.push({ key: `m${i}`, agg: m.agg, col: `c${c.pos}` });
    const type: OutColumn["type"] =
      m.agg === "count" || m.agg === "count_distinct"
        ? "count"
        : m.agg === "avg" && c.type === "integer"
          ? "decimal"
          : c.type;
    columns.push({ key: `m${i}`, label: `${AGG_LABEL[m.agg]} ${c.name}`, type });
  }

  const filters: PlanFilter[] = [];
  for (const f of spec.filters) {
    const c = col(f.column);
    if (!c) return fail(`Kolom filter "${f.column}" tidak ada atau disembunyikan.`);
    const values =
      f.op === "in" || f.op === "not_in" || f.op === "between"
        ? (f.values ?? [])
        : f.op === "is_null" || f.op === "not_null"
          ? []
          : f.value === undefined
            ? []
            : [f.value];
    const need =
      f.op === "is_null" || f.op === "not_null"
        ? 0
        : f.op === "between"
          ? 2
          : f.op === "in" || f.op === "not_in"
            ? -1
            : 1;
    if (need === -1 ? values.length === 0 : values.length !== need) {
      return fail(`Nilai filter untuk "${c.name}" tidak lengkap.`);
    }
    if (["gt", "gte", "lt", "lte", "between"].includes(f.op) && !ORDERED.includes(c.type)) {
      return fail(`Perbandingan hanya untuk kolom angka atau tanggal ("${c.name}").`);
    }
    if (f.op === "contains" && c.type !== "text") {
      return fail(`Filter "mengandung" hanya untuk kolom teks ("${c.name}").`);
    }
    if (!values.every((v) => checkValue(c.type, v))) {
      return fail(`Nilai filter tidak sesuai tipe kolom "${c.name}".`);
    }
    filters.push({ col: `c${c.pos}`, type: c.type, op: f.op, values });
  }

  const keys = new Set(columns.map((c) => c.key));
  for (const s of spec.sort) {
    if (!keys.has(s.by)) return fail(`Urutan merujuk kolom keluaran "${s.by}" yang tidak ada.`);
  }

  return {
    ok: true,
    plan: {
      dimensions,
      measures,
      filters,
      sort: spec.sort.map((s) => ({ key: s.by, dir: s.dir })),
      limit: spec.limit,
      columns,
      // Kolom sistem Periode hanya ada di skema sheet periode (period-column.ts).
      ...(schema.some((c) => c.system === "period") ? { periodic: true } : {}),
    },
  };
}

const CALC_LEAF_TYPES: ColumnType[] = NUMERIC;

/**
 * Pohon field terhitung → rencana: daun dicocokkan dengan skema seperti ukuran biasa (kolom ada dan
 * tidak tersembunyi, aturan AGG_TYPES) dan harus menghasilkan ANGKA (Terkecil/Terbesar tanggal
 * ditolak); konstanta diberi nama parameter `<key>k<n>`; jenis angka hasil dihitung (CalcNum).
 */
export function resolveCalc(
  expr: CalcExpr<string>,
  key: string,
  col: (name: string) => ColumnSchema | undefined,
): { ok: true; calc: PlanCalcMeasure["calc"] } | { ok: false; message: string } {
  let consts = 0;
  let problem: string | null = null;
  let exact = true;
  let additive = true;
  const nums = new Set<CalcNum>();
  const go = (e: CalcExpr<string>): PlanCalcExpr => {
    if (isCalcConst(e)) {
      if (!Number.isInteger(e.const)) exact = false;
      additive = false;
      return { const: e.const, param: `${key}k${++consts}` };
    }
    if (isCalcLeaf(e)) {
      if (e.agg !== "sum" && e.agg !== "count") additive = false;
      if (!e.column) {
        if (e.agg !== "count") problem ??= `Agregasi "${e.agg}" membutuhkan kolom.`;
        nums.add("integer");
        return { agg: "count", num: "integer" };
      }
      const c = col(e.column);
      if (!c) {
        problem ??= `Kolom "${e.column}" tidak ada atau disembunyikan.`;
        return { agg: e.agg, num: "double" };
      }
      const allowed = AGG_TYPES[e.agg];
      if (allowed !== "any" && !allowed.includes(c.type)) {
        problem ??= `Agregasi "${AGG_LABEL[e.agg]}" tidak bisa dipakai untuk kolom "${c.name}".`;
      } else if ((e.agg === "min" || e.agg === "max") && !CALC_LEAF_TYPES.includes(c.type)) {
        problem ??= `Field terhitung hanya bisa memakai ukuran angka ("${AGG_LABEL[e.agg]} ${c.name}").`;
      } else if (c.type === "duration" && e.agg !== "count" && e.agg !== "count_distinct") {
        // Hasil rumus tampil sebagai angka biasa, bukan j:mm:dd — detik mentah menyesatkan.
        problem ??= `Field terhitung belum bisa memakai kolom durasi ("${AGG_LABEL[e.agg]} ${c.name}"). Pakai ukuran biasa untuk durasi.`;
      }
      const num: CalcNum =
        e.agg === "count" || e.agg === "count_distinct"
          ? "integer"
          : e.agg === "avg" || (c.type === "decimal" && c.float)
            ? "double"
            : c.type === "decimal"
              ? "decimal"
              : "integer";
      nums.add(num);
      return { agg: e.agg, col: `c${c.pos}`, num };
    }
    if (e.op === "mul" || e.op === "div") {
      exact = false;
      additive = false;
    }
    if (e.op === "neg") return { op: "neg", args: [go(e.args[0])] };
    return { op: e.op, args: [go(e.args[0]), go(e.args[1])] };
  };
  const out = go(expr);
  if (problem) return { ok: false, message: problem };
  const num: CalcNum =
    !exact || nums.has("double") ? "double" : nums.has("decimal") ? "decimal" : "integer";
  return { ok: true, calc: { expr: out, num, additive } };
}
