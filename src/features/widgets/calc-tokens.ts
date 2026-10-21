/*
 * Penyusun field terhitung berbasis token (T-069, rencana G-7 §3.2): user menyusun rumus dari token
 * (ukuran, + − × ÷, kurung, angka) — tidak ada teks SQL atau rumus bebas. Token diurai menjadi pohon
 * ekspresi calc.ts yang SAMA dengan yang divalidasi server (parseCalcExpr + resolveCalc); server tetap
 * penentu. Galat menunjuk token yang salah (indeks) agar panel bisa menaruh pesan di dekatnya. Murni.
 */
import { z } from "zod";
import type { Agg } from "@/features/query/spec";
import {
  CALC_CONST_MAX,
  CALC_DEPTH_MAX,
  isCalcConst,
  isCalcLeaf,
  parseCalcExpr,
  type CalcExpr,
  type CalcLeaf,
} from "./calc";

export type CalcBinOp = "add" | "sub" | "mul" | "div";
export type CalcToken =
  | { t: "measure"; agg: Agg; column?: number }
  | { t: "num"; value: number }
  | { t: "op"; op: CalcBinOp }
  | { t: "lparen" }
  | { t: "rparen" };

export const OP_SYMBOL: Record<CalcBinOp, string> = { add: "+", sub: "−", mul: "×", div: "÷" };
export const OP_NAME: Record<CalcBinOp, string> = {
  add: "tambah",
  sub: "kurang",
  mul: "kali",
  div: "bagi",
};

/** Galat urai: `at` = indeks token yang salah, atau null = rumus secara keseluruhan. */
export type TokenParse =
  { ok: true; expr: CalcExpr } | { ok: false; message: string; at: number | null };

const PREC: Record<CalcBinOp, number> = { add: 1, sub: 1, mul: 2, div: 2 };

/**
 * Token → pohon (rekursi turun: + − < × ÷ < negatif < kurung). Minus di awal, setelah operator, atau
 * setelah kurung buka = negatif. Setelah urai: batas bentuk calc.ts (node, kedalaman, agregat unik).
 */
export function parseCalcTokens(tokens: CalcToken[]): TokenParse {
  if (!tokens.length) {
    return { ok: false, message: "Rumus masih kosong — tambahkan ukuran.", at: null };
  }
  let i = 0;
  class Fail extends Error {
    constructor(
      message: string,
      readonly at: number | null,
    ) {
      super(message);
    }
  }
  const operandMissing = (): never => {
    const prev = i - 1;
    if (i >= tokens.length) {
      throw new Fail(
        "Rumus belum selesai — tambahkan ukuran atau angka setelah operator ini.",
        prev >= 0 ? prev : null,
      );
    }
    const tok = tokens[i]!;
    if (tok.t === "rparen") {
      throw new Fail(
        prev >= 0 && tokens[prev]!.t === "lparen"
          ? "Kurung kosong — isi dengan ukuran atau angka."
          : "Ada operator tepat sebelum kurung tutup — tambahkan ukuran atau angka.",
        i,
      );
    }
    if (prev < 0 || tokens[prev]!.t === "lparen") {
      throw new Fail("Awali dengan ukuran, angka, kurung buka, atau tanda minus.", i);
    }
    throw new Fail("Operator ganda — sisipkan ukuran atau angka di antaranya.", i);
  };
  const primary = (): CalcExpr => {
    const tok = tokens[i];
    if (!tok) return operandMissing();
    if (tok.t === "measure") {
      i++;
      return tok.column === undefined ? { agg: tok.agg } : { agg: tok.agg, column: tok.column };
    }
    if (tok.t === "num") {
      i++;
      return { const: tok.value };
    }
    if (tok.t === "lparen") {
      const open = i++;
      const inner = sum();
      if (tokens[i]?.t !== "rparen") {
        if (i < tokens.length) throw new Fail("Tambahkan operator di antara dua bagian ini.", i);
        throw new Fail("Kurung buka ini belum ditutup.", open);
      }
      i++;
      return inner;
    }
    if (tok.t === "op" && tok.op === "sub") {
      i++;
      return { op: "neg", args: [primary()] };
    }
    return operandMissing();
  };
  const level = (prec: 1 | 2, next: () => CalcExpr) => (): CalcExpr => {
    let left = next();
    for (;;) {
      const tok = tokens[i];
      if (!tok || tok.t !== "op" || PREC[tok.op] !== prec) return left;
      i++;
      left = { op: tok.op, args: [left, next()] };
    }
  };
  const product = level(2, primary);
  const sum = level(1, product);

  let expr: CalcExpr;
  try {
    expr = sum();
    if (i < tokens.length) {
      const tok = tokens[i]!;
      throw new Fail(
        tok.t === "rparen"
          ? "Kurung tutup ini tidak punya kurung buka."
          : "Tambahkan operator di antara dua bagian ini.",
        i,
      );
    }
  } catch (e) {
    if (e instanceof Fail) return { ok: false, message: e.message, at: e.at };
    throw e;
  }
  expr = balanceSums(expr);
  const checked = parseCalcExpr(expr, z.number().int());
  if (!checked.ok) return { ok: false, message: checked.message, at: null };
  return { ok: true, expr: checked.expr };
}

const depth = (e: CalcExpr): number =>
  isCalcLeaf(e) || isCalcConst(e) ? 1 : 1 + Math.max(...e.args.map(depth));

/**
 * Rantai + − panjang (a + b + c + … ) diurai kiri-ke-kanan menjadi pohon sedalam jumlah suku, sehingga
 * 7 ukuran yang dijumlahkan sudah melewati batas kedalaman 6. Hanya bila batas terlewati, rantai itu
 * disusun ulang seimbang dengan nilai yang sama (a − b + c = a − (b − c) tidak dipakai: tanda suku
 * kanan dibalik). × ÷ tidak disusun ulang (÷0 di tempat lain mengubah hasil kosong).
 */
function balanceSums(e: CalcExpr): CalcExpr {
  if (depth(e) <= CALC_DEPTH_MAX) return e;
  const go = (n: CalcExpr): CalcExpr => {
    if (isCalcLeaf(n) || isCalcConst(n)) return n;
    if (n.op === "neg") return { op: "neg", args: [go(n.args[0])] };
    if (n.op === "mul" || n.op === "div") return { op: n.op, args: [go(n.args[0]), go(n.args[1])] };
    // Kumpulkan suku bertanda dari rantai kiri.
    const terms: { sign: 1 | -1; e: CalcExpr }[] = [];
    let cur: CalcExpr = n;
    while (!isCalcLeaf(cur) && !isCalcConst(cur) && (cur.op === "add" || cur.op === "sub")) {
      terms.unshift({ sign: cur.op === "add" ? 1 : -1, e: go(cur.args[1]) });
      cur = cur.args[0];
    }
    terms.unshift({ sign: 1, e: go(cur) });
    return build(terms);
  };
  /** Suku pertama bertanda +; potong tengah: kiri ± (kanan dengan tanda relatif suku pertamanya). */
  const build = (terms: { sign: 1 | -1; e: CalcExpr }[]): CalcExpr => {
    if (terms.length === 1) return terms[0]!.e;
    const mid = Math.ceil(terms.length / 2);
    const right = terms.slice(mid);
    const s = right[0]!.sign;
    const rel = right.map((t) => ({ sign: (t.sign * s) as 1 | -1, e: t.e }));
    return { op: s === 1 ? "add" : "sub", args: [build(terms.slice(0, mid)), build(rel)] };
  };
  return go(e);
}

/** Pohon → token (untuk mengubah field tersimpan); kurung hanya bila perlu, seperti calcText. */
export function calcTokens(e: CalcExpr): CalcToken[] {
  const go = (n: CalcExpr, parent: number, right: boolean): CalcToken[] => {
    if (isCalcLeaf(n)) {
      return [n.column === undefined ? { t: "measure", agg: n.agg } : { t: "measure", ...n }];
    }
    if (isCalcConst(n)) return [{ t: "num", value: n.const }];
    if (n.op === "neg") return [{ t: "op", op: "sub" }, ...go(n.args[0], 3, false)];
    const p = PREC[n.op];
    const body = [
      ...go(n.args[0], p, false),
      { t: "op", op: n.op } as const,
      ...go(n.args[1], p, true),
    ];
    return p < parent || (right && p === parent)
      ? [{ t: "lparen" }, ...body, { t: "rparen" }]
      : body;
  };
  return go(e, 0, false);
}

/** Teks satu token untuk chip dan pratinjau rumus yang belum valid. */
export function tokenText(tok: CalcToken, leaf: (l: CalcLeaf) => string): string {
  switch (tok.t) {
    case "measure":
      return leaf(tok);
    case "num":
      return tok.value.toLocaleString("id-ID", { maximumFractionDigits: 6 });
    case "op":
      return OP_SYMBOL[tok.op];
    case "lparen":
      return "(";
    case "rparen":
      return ")";
  }
}

/**
 * Angka konstanta dari teks gaya Indonesia ("1.000,5", "0,5", "-2") atau titik desimal ("0.5").
 * null bila bukan angka atau di luar batas konstanta.
 */
export function parseConstText(text: string): number | null {
  let s = text.trim().replace(/\s/g, "").replace("−", "-");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  // "1.000" (ribuan gaya Indonesia) vs "0.5": titik diikuti tepat 3 digit di setiap kelompok = ribuan.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= CALC_CONST_MAX ? n : null;
}
