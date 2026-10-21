/*
 * Field terhitung (T-068, ADR-0009, rencana G-7 §3.2/§4.1): aritmetika antar ukuran TERAGREGASI,
 * disimpan sebagai pohon ekspresi JSON tervalidasi — tidak pernah teks SQL. Node: {op: add|sub|mul|div,
 * args: [a, b]}, {op: neg, args: [a]}, daun ukuran {agg, column?} (aturan tipe sama dengan ukuran
 * biasa, dicek saat resolve), konstanta {const: n} (berhingga, |n| ≤ 1e15; di-bind sebagai parameter).
 * Batas bentuk (≤ 32 node, kedalaman ≤ 6, ≤ 8 agregat unik) dicek dengan penjelajah iteratif yang
 * berhenti di batas, SEBELUM rekursi apa pun — pohon raksasa/dalam dari klien tidak bisa memicu stack
 * overflow. Murni (tanpa I/O); dipakai server dan klien.
 */
import { z } from "zod";
import type { Agg } from "@/features/query/spec";

export const CALC_OPS = ["add", "sub", "mul", "div", "neg"] as const;
export type CalcOp = (typeof CALC_OPS)[number];
export const CALC_NODES_MAX = 32;
export const CALC_DEPTH_MAX = 6;
export const CALC_AGGS_MAX = 8;
export const CALC_CONST_MAX = 1e15;
export const CALC_LABEL_MAX = 60;
const CALC_AGGS = ["sum", "avg", "count", "count_distinct", "min", "max"] as const satisfies Agg[];

/** Pohon ekspresi; `C` = rujukan kolom (posisi di spec widget, nama di spec query). */
export type CalcExpr<C = number> =
  | { op: "add" | "sub" | "mul" | "div"; args: [CalcExpr<C>, CalcExpr<C>] }
  | { op: "neg"; args: [CalcExpr<C>] }
  | CalcLeaf<C>
  | { const: number };
export type CalcLeaf<C = number> = { agg: Agg; column?: C };

export const isCalcLeaf = <C>(e: CalcExpr<C>): e is CalcLeaf<C> => "agg" in e;
export const isCalcConst = <C>(e: CalcExpr<C>): e is { const: number } => "const" in e;

/** Semua daun ukuran, urut kiri ke kanan (dengan duplikat). */
export function calcLeaves<C>(e: CalcExpr<C>): CalcLeaf<C>[] {
  if (isCalcLeaf(e)) return [e];
  if (isCalcConst(e)) return [];
  return e.args.flatMap((a) => calcLeaves(a));
}

/** Pohon yang sama dengan rujukan kolom daun dipetakan (remap versi, posisi → nama). */
export function mapCalcColumns<A, B>(e: CalcExpr<A>, f: (c: A) => B): CalcExpr<B> {
  if (isCalcLeaf(e)) {
    return e.column === undefined ? { agg: e.agg } : { agg: e.agg, column: f(e.column) };
  }
  if (isCalcConst(e)) return { const: e.const };
  if (e.op === "neg") return { op: "neg", args: [mapCalcColumns(e.args[0], f)] };
  return { op: e.op, args: [mapCalcColumns(e.args[0], f), mapCalcColumns(e.args[1], f)] };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Batas bentuk tanpa rekursi: node ≤ 32, kedalaman ≤ 6 (daun tunggal = 1). Berhenti segera saat batas
 * terlewati, jadi biaya ≤ 33 node walau masukan berisi ribuan tingkat. Isi node dicek sesudahnya.
 */
function shapeProblem(v: unknown): string | null {
  const stack: { v: unknown; depth: number }[] = [{ v, depth: 1 }];
  let nodes = 0;
  while (stack.length) {
    const { v: n, depth } = stack.pop()!;
    if (++nodes > CALC_NODES_MAX)
      return `Rumus terlalu panjang (maksimal ${CALC_NODES_MAX} bagian).`;
    if (depth > CALC_DEPTH_MAX) {
      return `Rumus terlalu bertingkat (maksimal ${CALC_DEPTH_MAX} tingkat kurung).`;
    }
    if (isObject(n) && Array.isArray(n.args)) {
      // Larik args lebih dari 2 ditolak saat parse; di sini cukup dibatasi agar tidak menelusuri ribuan.
      for (const a of n.args.slice(0, 3)) stack.push({ v: a, depth: depth + 1 });
    }
  }
  return null;
}

type Parsed<C> = { ok: true; expr: CalcExpr<C> } | { ok: false; message: string };
const bad = (message: string) => ({ ok: false, message }) as const;
const keysOk = (o: Record<string, unknown>, allowed: string[]) =>
  Object.keys(o).every((k) => allowed.includes(k));

/** Parse satu node (rekursi aman: kedalaman sudah dibatasi shapeProblem). */
function parseNode<C>(v: unknown, column: z.ZodType<C>): Parsed<C> {
  if (!isObject(v)) return bad("Bagian rumus tidak dikenal.");
  if ("op" in v) {
    if (!keysOk(v, ["op", "args"])) return bad("Bagian rumus tidak dikenal.");
    const op = z.enum(CALC_OPS).safeParse(v.op);
    if (!op.success) return bad("Operator rumus hanya +, −, ×, ÷, dan negatif.");
    const n = op.data === "neg" ? 1 : 2;
    if (!Array.isArray(v.args) || v.args.length !== n) {
      return bad(
        op.data === "neg" ? "Negatif butuh satu bagian." : "Operator butuh dua bagian rumus.",
      );
    }
    const args: CalcExpr<C>[] = [];
    for (const a of v.args) {
      const p = parseNode(a, column);
      if (!p.ok) return p;
      args.push(p.expr);
    }
    return op.data === "neg"
      ? { ok: true, expr: { op: "neg", args: [args[0]!] } }
      : { ok: true, expr: { op: op.data, args: [args[0]!, args[1]!] } };
  }
  if ("const" in v) {
    if (!keysOk(v, ["const"])) return bad("Bagian rumus tidak dikenal.");
    const c = v.const;
    if (typeof c !== "number" || !Number.isFinite(c) || Math.abs(c) > CALC_CONST_MAX) {
      return bad(
        "Angka di rumus harus angka biasa dengan nilai mutlak maksimal 1.000.000.000.000.000.",
      );
    }
    return { ok: true, expr: { const: c } };
  }
  if ("agg" in v) {
    if (!keysOk(v, ["agg", "column"])) return bad("Bagian rumus tidak dikenal.");
    const agg = z.enum(CALC_AGGS).safeParse(v.agg);
    if (!agg.success) return bad("Agregasi di rumus tidak dikenal.");
    if (v.column === undefined) {
      if (agg.data !== "count") return bad("Agregasi di rumus ini membutuhkan kolom.");
      return { ok: true, expr: { agg: "count" } };
    }
    const col = column.safeParse(v.column);
    if (!col.success) return bad("Kolom di rumus tidak valid.");
    return { ok: true, expr: { agg: agg.data, column: col.data } };
  }
  return bad("Bagian rumus tidak dikenal.");
}

/** Kunci agregat unik (agregasi + kolom). */
const aggKey = <C>(l: CalcLeaf<C>) => `${l.agg}\n${JSON.stringify(l.column ?? null)}`;

/** Validasi penuh satu pohon (bentuk → isi → jumlah agregat unik). */
export function parseCalcExpr<C>(v: unknown, column: z.ZodType<C>): Parsed<C> {
  const shape = shapeProblem(v);
  if (shape) return bad(shape);
  const p = parseNode(v, column);
  if (!p.ok) return p;
  const leaves = calcLeaves(p.expr);
  if (!leaves.length) return bad("Rumus harus memuat minimal satu ukuran (mis. Total Pendapatan).");
  if (new Set(leaves.map(aggKey)).size > CALC_AGGS_MAX) {
    return bad(`Rumus memakai terlalu banyak ukuran berbeda (maksimal ${CALC_AGGS_MAX}).`);
  }
  return p;
}

/** Skema zod pohon ekspresi dengan rujukan kolom `column` (pesan Indonesia, tanpa rekursi zod). */
export function calcExprSchema<C>(column: z.ZodType<C>) {
  return z.unknown().transform((v, ctx): CalcExpr<C> => {
    const p = parseCalcExpr(v, column);
    if (!p.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: p.message });
      return z.NEVER;
    }
    return p.expr;
  });
}

export const calcLabelSchema = z
  .string()
  .trim()
  .min(1, "Nama field terhitung wajib diisi.")
  .max(CALC_LABEL_MAX, `Nama field terhitung maksimal ${CALC_LABEL_MAX} karakter.`);

/**
 * Hanya penjumlahan/pengurangan ukuran Total/Jumlah tanpa konstanta: nilai keseluruhan = jumlah nilai
 * kategori, jadi boleh untuk pai (irisan "Lainnya" = sisa) dan total grafik "N teratas dari M".
 */
export function isAdditiveCalc<C>(e: CalcExpr<C>): boolean {
  if (isCalcLeaf(e)) return e.agg === "sum" || e.agg === "count";
  if (isCalcConst(e)) return false;
  if (e.op === "mul" || e.op === "div") return false;
  return e.args.every((a) => isAdditiveCalc(a));
}

const OP_TEXT: Record<CalcOp, string> = { add: "+", sub: "−", mul: "×", div: "÷", neg: "−" };
const PREC: Record<CalcOp, number> = { add: 1, sub: 1, mul: 2, div: 2, neg: 3 };

/**
 * Teks rumus untuk dibaca manusia ("(Total Pendapatan − Total Biaya) ÷ Total Pendapatan"); kurung
 * hanya bila perlu. `leaf` memberi nama ukuran; angka format id-ID.
 */
export function calcText<C>(e: CalcExpr<C>, leaf: (l: CalcLeaf<C>) => string): string {
  const go = (n: CalcExpr<C>, parent: number, right: boolean): string => {
    if (isCalcLeaf(n)) return leaf(n);
    if (isCalcConst(n)) return n.const.toLocaleString("id-ID", { maximumFractionDigits: 6 });
    const p = PREC[n.op];
    const text =
      n.op === "neg"
        ? `−${go(n.args[0], p, false)}`
        : `${go(n.args[0], p, false)} ${OP_TEXT[n.op]} ${go(n.args[1], p, true)}`;
    // Kanan operator sama tingkat (a − (b − c)) tetap dikurung.
    return p < parent || (right && p === parent) ? `(${text})` : text;
  };
  return go(e, 0, false);
}
