import type { Agg } from "@/features/query/spec";
import { calcLeaves, isAdditiveCalc, mapCalcColumns, type CalcLeaf } from "@/features/widgets/calc";
import { parseCalcTokens, type CalcToken } from "@/features/widgets/calc-tokens";
import type { CalcValue, ChartType, NumberFormat, ShowAs } from "@/features/widgets/spec";
import {
  AGG_LABEL,
  AGG_ORDER,
  COUNT_FILLED_LABEL,
  measureText,
  type AggChoice,
  type SourceColumn,
} from "./widget-config-model";

/*
 * Model editor field terhitung (T-069): ukuran yang boleh jadi bagian rumus (aturan sama dengan
 * resolveCalc server: Total/Rata-rata/Terkecil/Terbesar hanya kolom angka bulat/desimal — bukan
 * durasi/tanggal; jumlah dari kolom apa pun), galat per token, dan pemeriksaan sebelum simpan.
 * Server tetap penentu (spec widget + resolveCalc saat query). Murni.
 */
export type CalcWidgetType = "pivot" | "kpi" | ChartType;

const VALUE_AGG_TYPES = ["integer", "decimal"];

/** Kolom yang boleh dipakai agregasi ini di rumus. */
export function calcColumnsForAgg(agg: Agg, columns: SourceColumn[]): SourceColumn[] {
  if (agg === "count" || agg === "count_distinct") return columns;
  return columns.filter((c) => VALUE_AGG_TYPES.includes(c.type));
}

/** Pilihan "Ukuran" di editor: Jumlah terisi di bawah Jumlah baris (seperti panel ukuran biasa). */
export function calcAggOptions(columns: SourceColumn[]): { value: AggChoice; label: string }[] {
  return AGG_ORDER.flatMap((a): { value: AggChoice; label: string }[] => {
    if (a === "count") {
      return columns.length
        ? [
            { value: "count", label: AGG_LABEL.count },
            { value: "count_filled", label: COUNT_FILLED_LABEL },
          ]
        : [{ value: "count", label: AGG_LABEL.count }];
    }
    return calcColumnsForAgg(a, columns).length ? [{ value: a, label: AGG_LABEL[a] }] : [];
  });
}

/** Ukuran bawaan penyusun: Total kolom angka pertama, selain itu Jumlah baris. */
export function defaultCalcLeaf(columns: SourceColumn[]): CalcLeaf {
  const num = calcColumnsForAgg("sum", columns)[0];
  return num ? { agg: "sum", column: num.pos } : { agg: "count" };
}

/** Ukuran setelah pilihan agregasi berganti; kolom lama dipertahankan bila masih boleh. */
export function calcLeafForChoice(
  choice: AggChoice,
  prev: CalcLeaf,
  columns: SourceColumn[],
): CalcLeaf {
  if (choice === "count") return { agg: "count" };
  const agg: Agg = choice === "count_filled" ? "count" : choice;
  const allowed = calcColumnsForAgg(agg, columns);
  const keep = allowed.some((c) => c.pos === prev.column);
  return { agg, column: keep ? prev.column! : allowed[0]!.pos };
}

/** Pesan untuk ukuran rumus yang tidak (lagi) bisa dipakai; undefined bila sah. */
export function calcLeafProblem(leaf: CalcLeaf, columns: SourceColumn[]): string | undefined {
  if (leaf.column === undefined) return undefined;
  const col = columns.find((c) => c.pos === leaf.column);
  if (!col)
    return "Kolom ukuran ini tidak tersedia lagi — hapus bagian ini lalu pilih ukuran lain.";
  if (calcColumnsForAgg(leaf.agg, columns).includes(col)) return undefined;
  return col.type === "duration"
    ? `Field terhitung belum bisa memakai kolom durasi (${AGG_LABEL[leaf.agg]} ${col.name}) — pakai Jumlah baris atau ukuran biasa.`
    : `${AGG_LABEL[leaf.agg]} hanya bisa dari kolom angka — “${col.name}” tidak cocok. Hapus bagian ini lalu pilih ukuran lain.`;
}

export const calcLeafText = (l: CalcLeaf, columns: SourceColumn[]) =>
  measureText(l, (pos) => columns.find((c) => c.pos === pos)?.name ?? "kolom tidak tersedia");

export type CalcCheck =
  | { ok: true; value: CalcValue }
  | { ok: false; message: string; at: number | null; field: "label" | "formula" };

/**
 * Seluruh pemeriksaan sebelum simpan, urut seperti dibaca: rumus (token salah lebih dulu, lalu
 * susunan, lalu aturan jenis widget), kemudian nama. Galat rumus didahulukan karena paling sering.
 */
export function checkCalc(input: {
  label: string;
  tokens: CalcToken[];
  format: NumberFormat | undefined;
  showAs: ShowAs | undefined;
  type: CalcWidgetType;
  columns: SourceColumn[];
}): CalcCheck {
  const { tokens, columns, type } = input;
  for (const [i, tok] of tokens.entries()) {
    if (tok.t !== "measure") continue;
    const problem = calcLeafProblem(tok, columns);
    if (problem) return { ok: false, message: problem, at: i, field: "formula" };
  }
  const parsed = parseCalcTokens(tokens);
  if (!parsed.ok) return { ok: false, message: parsed.message, at: parsed.at, field: "formula" };
  if (type === "pie" && !isAdditiveCalc(parsed.expr)) {
    return {
      ok: false,
      message:
        "Grafik pai hanya untuk rumus yang menjumlah atau mengurangkan Total atau Jumlah baris (tanpa ×, ÷, atau angka). Untuk rasio pakai grafik batang.",
      at: null,
      field: "formula",
    };
  }
  const label = input.label.trim();
  if (!label)
    return { ok: false, message: "Isi nama field, mis. Margin.", at: null, field: "label" };
  if (label.length > 60) {
    return { ok: false, message: "Nama field maksimal 60 karakter.", at: null, field: "label" };
  }
  const value: CalcValue = {
    kind: "calc",
    label,
    expr: parsed.expr,
    ...(input.format ? { format: input.format } : {}),
    ...(input.showAs && input.showAs !== "none" && type !== "kpi" ? { showAs: input.showAs } : {}),
  };
  return { ok: true, value };
}

/**
 * Spec query pratinjau (mode editor { dashboardId, spec }, D6): satu ukuran = rumus atas seluruh data
 * sheet, kolom lewat nama. null bila ada kolom rumus yang tidak dikenal panel.
 */
export function calcPreviewSpec(
  sheetId: string,
  value: Pick<CalcValue, "label" | "expr">,
  columns: SourceColumn[],
): { sheetId: string; measures: unknown[]; limit: number } | null {
  const names = new Map(columns.map((c) => [c.pos, c.name]));
  if (calcLeaves(value.expr).some((l) => l.column !== undefined && !names.has(l.column))) {
    return null;
  }
  const expr = mapCalcColumns(value.expr, (pos) => names.get(pos)!);
  return {
    sheetId,
    measures: [{ kind: "calc", label: value.label || "Pratinjau", expr }],
    limit: 1,
  };
}
