import { describe, expect, it } from "vitest";
import {
  CALC_DEPTH_MAX,
  calcText,
  isCalcConst,
  isCalcLeaf,
  type CalcExpr,
} from "@/features/widgets/calc";
import {
  calcTokens,
  parseCalcTokens,
  parseConstText,
  type CalcToken,
} from "@/features/widgets/calc-tokens";

/*
 * T-069 penyusun token: token → pohon calc.ts (presedensi, negatif, kurung), galat menunjuk token yang
 * salah, pohon → token bolak-balik, rantai + − panjang disusun seimbang hanya bila melewati batas
 * kedalaman (nilai sama), dan angka gaya Indonesia.
 */
const m = (column: number): CalcToken => ({ t: "measure", agg: "sum", column });
const op = (o: "add" | "sub" | "mul" | "div"): CalcToken => ({ t: "op", op: o });
const L: CalcToken = { t: "lparen" };
const R: CalcToken = { t: "rparen" };
const num = (value: number): CalcToken => ({ t: "num", value });
const NAMES: Record<number, string> = { 2: "Pendapatan", 3: "Biaya" };
const text = (e: CalcExpr) => calcText(e, (l) => `Total ${NAMES[l.column ?? 0] ?? `K${l.column}`}`);

/** Nilai pohon dengan daun = nilai kolom (÷0 → NaN, cukup untuk membandingkan bentuk). */
function evalExpr(e: CalcExpr, vals: Record<number, number>): number {
  if (isCalcLeaf(e)) return vals[e.column ?? 0]!;
  if (isCalcConst(e)) return e.const;
  const [a, b] = e.args.map((x) => evalExpr(x, vals)) as [number, number];
  switch (e.op) {
    case "neg":
      return -a;
    case "add":
      return a + b;
    case "sub":
      return a - b;
    case "mul":
      return a * b;
    case "div":
      return a / b;
  }
}
const depth = (e: CalcExpr): number =>
  isCalcLeaf(e) || isCalcConst(e) ? 1 : 1 + Math.max(...e.args.map(depth));

describe("parseCalcTokens", () => {
  it("Margin = (Pendapatan − Biaya) ÷ Pendapatan → pohon ADR-0009 dan teks pratinjau", () => {
    const p = parseCalcTokens([L, m(2), op("sub"), m(3), R, op("div"), m(2)]);
    expect(p).toEqual({
      ok: true,
      expr: {
        op: "div",
        args: [
          {
            op: "sub",
            args: [
              { agg: "sum", column: 2 },
              { agg: "sum", column: 3 },
            ],
          },
          { agg: "sum", column: 2 },
        ],
      },
    });
    if (!p.ok) return;
    expect(text(p.expr)).toBe("(Total Pendapatan − Total Biaya) ÷ Total Pendapatan");
  });

  it("presedensi × ÷ di atas + −, kiri ke kanan, minus awal = negatif", () => {
    const p = parseCalcTokens([op("sub"), m(2), op("add"), m(3), op("mul"), num(2)]);
    if (!p.ok) throw new Error(p.message);
    expect(evalExpr(p.expr, { 2: 10, 3: 4 })).toBe(-2);
    const q = parseCalcTokens([m(2), op("sub"), m(3), op("sub"), m(4)]);
    if (!q.ok) throw new Error(q.message);
    expect(evalExpr(q.expr, { 2: 10, 3: 4, 4: 1 })).toBe(5);
    const r = parseCalcTokens([m(2), op("mul"), L, op("sub"), m(3), R]);
    if (!r.ok) throw new Error(r.message);
    expect(evalExpr(r.expr, { 2: 10, 3: 4 })).toBe(-40);
  });

  it("jumlah baris tanpa kolom dan angka konstanta", () => {
    const p = parseCalcTokens([
      m(2),
      op("div"),
      { t: "measure", agg: "count" },
      op("mul"),
      num(100),
    ]);
    if (!p.ok) throw new Error(p.message);
    expect(p.expr).toEqual({
      op: "mul",
      args: [{ op: "div", args: [{ agg: "sum", column: 2 }, { agg: "count" }] }, { const: 100 }],
    });
  });

  it.each<[string, CalcToken[], number | null, RegExp]>([
    ["kosong", [], null, /kosong/],
    ["operator ganda", [m(2), op("add"), op("mul"), m(3)], 2, /Operator ganda/],
    ["diawali ×", [op("mul"), m(2)], 0, /Awali dengan/],
    ["operator di akhir", [m(2), op("div")], 1, /belum selesai/],
    ["kurung buka tak ditutup", [m(2), op("mul"), L, m(3), op("add"), m(4)], 2, /belum ditutup/],
    ["kurung tutup lebih", [m(2), R], 1, /tidak punya kurung buka/],
    ["dua ukuran berdampingan", [m(2), m(3)], 1, /operator di antara/],
    ["ukuran setelah kurung tutup", [L, m(2), R, m(3)], 3, /operator di antara/],
    ["kurung kosong", [m(2), op("add"), L, R], 3, /Kurung kosong/],
    ["operator sebelum kurung tutup", [L, m(2), op("add"), R], 3, /sebelum kurung tutup/],
  ])("galat %s menunjuk token yang salah", (_, tokens, at, msg) => {
    const p = parseCalcTokens(tokens);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.at).toBe(at);
    expect(p.message).toMatch(msg);
  });

  it("batas calc.ts tetap berlaku: > 8 ukuran berbeda ditolak untuk rumus utuh", () => {
    const tokens: CalcToken[] = [];
    for (let c = 1; c <= 9; c++) tokens.push(...(c > 1 ? [op("add")] : []), m(c));
    const p = parseCalcTokens(tokens);
    expect(p).toMatchObject({ ok: false, at: null });
    if (!p.ok) expect(p.message).toMatch(/terlalu banyak ukuran/);
  });

  it("rantai 8 suku ± melewati kedalaman 6 → disusun seimbang dengan nilai sama", () => {
    const signs = ["add", "sub", "sub", "add", "sub", "add", "sub"] as const;
    const tokens: CalcToken[] = [m(1)];
    signs.forEach((s, k) => tokens.push(op(s), m(k + 2)));
    const p = parseCalcTokens(tokens);
    if (!p.ok) throw new Error(p.message);
    expect(depth(p.expr)).toBeLessThanOrEqual(CALC_DEPTH_MAX);
    const vals = { 1: 3, 2: 5, 3: 7, 4: 11, 5: 13, 6: 17, 7: 19, 8: 23 };
    expect(evalExpr(p.expr, vals)).toBe(3 + 5 - 7 - 11 + 13 - 17 + 19 - 23);
    // Rantai pendek tidak diubah (teks pratinjau sama dengan yang disusun).
    const short = parseCalcTokens([m(2), op("sub"), m(3), op("add"), m(2)]);
    if (!short.ok) throw new Error(short.message);
    expect(text(short.expr)).toBe("Total Pendapatan − Total Biaya + Total Pendapatan");
  });

  it("rantai × ÷ ≥ 6 operasi tanpa kurung: pesan meminta kurung", () => {
    const tokens: CalcToken[] = [m(1)];
    for (let k = 2; k <= 7; k++) tokens.push(op(k % 2 ? "div" : "mul"), m(k));
    const p = parseCalcTokens(tokens);
    expect(p).toMatchObject({ ok: false, at: null });
    if (!p.ok) expect(p.message).toMatch(/kali\/bagi berurutan — kelompokkan dengan kurung/);
    // 5 operasi berurutan masih boleh.
    expect(parseCalcTokens(tokens.slice(0, 11)).ok).toBe(true);
  });

  it("pohon → token → pohon bolak-balik (kurung hanya bila perlu)", () => {
    const trees: CalcExpr[] = [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 2 },
          { op: "sub", args: [{ const: 1 }, { const: 2 }] },
        ],
      },
      { op: "neg", args: [{ op: "add", args: [{ agg: "count" }, { const: -5 }] }] },
      {
        op: "div",
        args: [
          { op: "mul", args: [{ agg: "avg", column: 2 }, { const: 0.5 }] },
          { agg: "max", column: 3 },
        ],
      },
    ];
    for (const t of trees) {
      const p = parseCalcTokens(calcTokens(t));
      expect(p).toEqual({ ok: true, expr: t });
    }
    expect(calcTokens(trees[0]!).map((t) => t.t)).toEqual([
      "measure",
      "op",
      "lparen",
      "num",
      "op",
      "num",
      "rparen",
    ]);
  });
});

describe("parseConstText", () => {
  it.each<[string, number | null]>([
    ["100", 100],
    ["0,5", 0.5],
    ["0.5", 0.5],
    ["1.000", 1000],
    ["1.000,25", 1000.25],
    // Review T-069: titik desimal untuk "0.xxx" (bukan ribuan); gaya Indonesia untuk ribuan.
    ["0.125", 0.125],
    ["0,125", 0.125],
    ["1.250", 1250],
    ["1,25", 1.25],
    ["1.250.000", 1250000],
    ["-0.25", -0.25],
    ["0.500", 0.5],
    ["-0.250", -0.25],
    ["1.25", 1.25],
    ["01.250", 1.25],
    ["1,2,3", null],
    ["12.34,5", null],
    ["-2", -2],
    ["−3", -3],
    ["", null],
    ["abc", null],
    ["1e3", null],
    ["2.000.000.000.000.000", null],
  ])("%s → %s", (input, out) => {
    expect(parseConstText(input)).toBe(out);
  });
});
