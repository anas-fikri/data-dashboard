/*
 * Input pemetaan kolom (T-014) tanpa dependensi worker (storage, lock): dipakai app untuk memvalidasi
 * sebelum masuk antrean dan oleh worker sebagai pertahanan berlapis + rencana override. Payload hanya
 * berisi keputusan; pasangan sheet dan kolom yang cocok otomatis dihitung ulang dari Sheet versi yang
 * menunggu pemetaan (header tersimpan) + skema aktif TERKINI (planSheets/planColumns).
 *  - Per sheet aktif bermasalah: target = sheet versi baru (pasangan otomatis, atau sheet baru tanpa
 *    pasangan bila sheet aktif hilang) atau null = "tidak dipakai lagi" (hanya tanpa pasangan otomatis).
 *  - columns: tepat semua kolom aktif terlihat yang hilang pada pasangan itu → kolom baru yang belum
 *    cocok (satu-ke-satu) atau null = kosongkan (absent). Kolom tersembunyi yang hilang tetap dibuang.
 *  - casts: tipe/format untuk kolom baru (posisi di file baru) yang cocok/dipetakan; nilai yang tidak
 *    cocok menjadi kosong.
 *  - Sheet yang dipasangkan user: header dipilih ulang dengan pairedHeader (pratinjau tersimpan) —
 *    halaman, validasi app, dan worker memakai hasil yang sama.
 *  - acknowledge: kirim ulang setelah job menjawab "review" (rasio cast < 98 %, dihitung tepat di
 *    worker) = user menerima nilai yang tidak cocok menjadi kosong.
 */
import { z } from "zod";
import { MAX_COLUMN } from "@/features/widgets/spec";
import type { ColumnMeta } from "./header";
import type { ColumnSchema, ColumnType, DateFormat, NumberLocale } from "./infer";
import type { SheetPreview } from "./preview";
import { columnTypeSchema, dateFormatSchema, numberLocaleSchema } from "./recast-input";
import {
  pairedHeader,
  planColumns,
  planSheets,
  sameSnapshot,
  snapshotRef,
  type ActiveSheet,
  type ActiveSnapshot,
  type SnapshotRef,
} from "./refresh";
import { choiceOf, type AbsentColumn, type ColumnOverride } from "./typed";

/** Tipe/format pilihan user untuk kolom baru yang cocok/dipetakan (posisi di file baru). */
export interface MappingCast {
  pos: number;
  type: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
}

export interface SheetMappingInput {
  activeSheetId: string;
  /** Sheet versi baru; null = sheet aktif tidak dipakai lagi. */
  target: string | null;
  /** activePos = posisi di skema aktif; newPos = posisi di file baru, null = kosongkan (NULL). */
  columns: { activePos: number; newPos: number | null }[];
  casts?: MappingCast[];
}

export interface MappingInput {
  /** Acuan skema aktif yang dilihat UI; berbeda dari sekarang → STALE. */
  base: SnapshotRef;
  sheets: SheetMappingInput[];
  /**
   * User sudah melihat hasil "review" (kolom cocok/dipetakan dengan < 98 % nilai lolos cast) dan
   * menerima nilai yang tidak cocok menjadi kosong. Tanpa ini job berhenti di "review" bila ada.
   */
  acknowledge?: true;
}

/** Kolom yang < 98 % nilainya lolos cast dengan tipe yang diterapkan job (hasil "review"). */
export interface MappingReviewIssue {
  /** Nama sheet aktif. */
  sheet: string;
  /** Nama tampil kolom. */
  column: string;
  /** Judul kolom di file baru. */
  header: string;
  /** Porsi nilai yang cocok (0–1), dibulatkan ke bawah ke persen bulat. */
  pct: number;
  /** "Tanggal (dd/mm/yyyy)". */
  typeLabel: string;
}

/** Batas jumlah kolom "review" yang dilaporkan (terburuk dulu). */
export const REVIEW_MAX = 50;

/** Hasil akhir job map-version (job.returnvalue). */
export type MappingOutcome =
  | { outcome: "done" }
  | { outcome: "stale" }
  | { outcome: "gone"; message?: string }
  | { outcome: "invalid"; message: string }
  | { outcome: "failed"; message: string }
  | { outcome: "review"; issues: MappingReviewIssue[] };

/** Sheet versi yang menunggu pemetaan (Sheet.columns = header tersimpan). */
export interface VersionSheet {
  id: string;
  name: string;
  index: number;
  colCount: number;
  headerRow: number;
  columns: ColumnMeta[];
  /** Pratinjau baris awal (pilih ulang header sheet yang dipasangkan user, pairedHeader). */
  preview: SheetPreview | null;
}

export interface MappingContext {
  sheets: VersionSheet[];
  /** Versi aktif saat ini beserta skemanya; null → STALE. */
  active: ActiveSnapshot | null;
}

/** Rencana cast satu pasangan sheet. */
export interface PairCast {
  /** Satu per kolom file baru (pos 1..colCount). */
  overrides: ColumnOverride[];
  /** Kolom kosong: dikonfirmasi user + absent lama yang masih hilang, urut posisi aktif. */
  absent: AbsentColumn[];
  /** Jumlah kolom yang dipetakan / dikosongkan user (audit). */
  mapped: number;
  nulls: number;
  /** Posisi kolom file baru yang cocok/dipetakan (rasio cast diperiksa job sebelum commit). */
  checked: number[];
}

export interface PairPlan extends PairCast {
  active: ActiveSheet;
  target: VersionSheet;
  /** Keputusan user untuk pasangan ini. */
  decision: SheetMappingInput | undefined;
  /** Dipasangkan user (bukan pasangan otomatis): sheet versi baru mendapat alias nama sheet aktif. */
  userPaired: boolean;
  /** Header yang dipakai (pairedHeader untuk pasangan user, header tersimpan untuk pasangan otomatis). */
  headerRow: number;
  columns: ColumnMeta[];
}

export interface MappingPlan {
  /** Semua pasangan (otomatis + pilihan user), urut indeks sheet aktif. */
  pairs: PairPlan[];
  /** Sheet aktif yang tidak dipakai lagi. */
  dropped: ActiveSheet[];
  /** Sheet aktif → sheet versi baru (semua pasangan): widget ikut sheet yang ganti nama. */
  sheetMap: Record<string, string>;
}

export type MappingCheck =
  | { ok: true; input: MappingInput; plan: MappingPlan }
  | { ok: false; code: "INVALID" | "STALE"; message: string };

export const MAPPING_STALE_MESSAGE =
  "Skema aktif berubah sejak halaman ini dibuka. Muat ulang halaman lalu periksa pemetaan lagi.";

/** Batas jumlah sheet dalam payload (jauh di atas jumlah sheet workbook yang wajar). */
const MAX_SHEETS = 1_024;
const id = z.string().min(1).max(64);
const pos = z.number().int().min(1).max(MAX_COLUMN);

const mappingSchema = z
  .object({
    acknowledge: z.literal(true).optional(),
    base: z
      .object({
        activeVersionId: id.nullable(),
        sheets: z
          .array(z.object({ id, schemaRevision: z.number().int().min(0) }).strict())
          .max(MAX_SHEETS),
      })
      .strict(),
    sheets: z
      .array(
        z
          .object({
            activeSheetId: id,
            target: id.nullable(),
            columns: z
              .array(z.object({ activePos: pos, newPos: pos.nullable() }).strict())
              .max(MAX_COLUMN),
            casts: z
              .array(
                z
                  .object({
                    pos,
                    type: columnTypeSchema,
                    numberLocale: numberLocaleSchema.optional(),
                    dateFormat: dateFormatSchema.optional(),
                  })
                  .strict(),
              )
              .max(MAX_COLUMN)
              .optional(),
          })
          .strict(),
      )
      .max(MAX_SHEETS),
  })
  .strict();

const absentOf = (a: ColumnSchema): AbsentColumn => ({
  name: a.name,
  original: a.original,
  type: a.type,
  numberLocale: a.numberLocale,
  dateFormat: a.dateFormat,
  float: a.float,
  hidden: a.hidden,
});

/**
 * Rencana cast satu pasangan dari header `columns` + keputusan user, atau pesan kenapa keputusan tidak
 * sah: setiap kolom yang hilang diputuskan tepat sekali, kolom baru dipakai satu kali dan belum cocok
 * otomatis, cast hanya untuk kolom cocok/dipetakan, dan total kolom ≤ MAX_COLUMN. `where` = " di sheet
 * …" untuk pesan (kosong bila dataset satu sheet).
 */
export function planPair(
  columns: ColumnMeta[],
  colCount: number,
  active: ActiveSheet,
  decision: Pick<SheetMappingInput, "columns" | "casts"> | undefined,
  where = "",
): PairCast | { error: string } {
  const plan = planColumns(columns, active.schema);
  const missing = new Map(plan.missing.map((a) => [a.pos, a]));
  const decided = new Set<number>();
  const taken = new Set(plan.matched.keys());
  const mapped = new Map<number, ColumnSchema>();
  const nulls: ColumnSchema[] = [];
  for (const c of decision?.columns ?? []) {
    const a = missing.get(c.activePos);
    if (!a) return { error: `Kolom posisi ${c.activePos}${where} tidak perlu dipetakan.` };
    if (decided.has(a.pos)) return { error: `Kolom "${a.name}"${where} diputuskan dua kali.` };
    decided.add(a.pos);
    if (c.newPos === null) nulls.push(a);
    else if (c.newPos > colCount) {
      return { error: `Kolom file baru posisi ${c.newPos}${where} tidak ada.` };
    } else if (taken.has(c.newPos)) {
      return { error: `Kolom file baru posisi ${c.newPos}${where} sudah dipakai kolom lain.` };
    } else {
      taken.add(c.newPos);
      mapped.set(c.newPos, a);
    }
  }
  const open = plan.missing.find((a) => !decided.has(a.pos));
  if (open) return { error: `Kolom "${open.name}"${where} belum dipetakan atau dikosongkan.` };
  const casts = new Map<number, MappingCast>();
  for (const c of decision?.casts ?? []) {
    if (!plan.matched.has(c.pos) && !mapped.has(c.pos)) {
      return { error: `Tipe kolom file baru posisi ${c.pos}${where} tidak bisa diatur di sini.` };
    }
    if (casts.has(c.pos)) return { error: `Tipe kolom posisi ${c.pos}${where} diatur dua kali.` };
    casts.set(c.pos, c);
  }
  const absent = [...nulls, ...plan.absent].sort((x, y) => x.pos - y.pos);
  const checked = [...plan.matched.keys(), ...mapped.keys()].sort((x, y) => x - y);
  if (colCount + absent.length > MAX_COLUMN) {
    return {
      error: `Terlalu banyak kolom${where}: ${colCount} kolom file + ${absent.length} kolom kosong melebihi ${MAX_COLUMN.toLocaleString("id-ID")}.`,
    };
  }
  const overrides = plan.overrides.map((o): ColumnOverride => {
    const a = plan.matched.get(o.pos) ?? mapped.get(o.pos);
    const base = a ? choiceOf(a, o.pos) : o;
    const c = casts.get(o.pos);
    if (!c) return base;
    return {
      ...base,
      type: c.type,
      ...(c.numberLocale ? { numberLocale: c.numberLocale } : {}),
      ...(c.dateFormat ? { dateFormat: c.dateFormat } : {}),
    };
  });
  return {
    overrides,
    absent: absent.map(absentOf),
    mapped: mapped.size,
    nulls: nulls.length,
    checked,
  };
}

const invalid = (message: string): MappingCheck => ({ ok: false, code: "INVALID", message });

/**
 * Cek bentuk + rentang payload saja (murni, tanpa DB): dipakai app sebelum lock Dataset dan membaca
 * baris berat, dan oleh validateMapping.
 */
export function parseMappingInput(
  raw: unknown,
): { ok: true; input: MappingInput } | { ok: false; code: "INVALID"; message: string } {
  const parsed = mappingSchema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    code: "INVALID",
    message: `Pemetaan tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
  };
}

/**
 * Validasi lengkap pemetaan terhadap versi + skema aktif terkini (murni; app dan worker): bentuk dan
 * rentang, acuan (STALE), sheet aktif dikenal dan diputuskan sekali, pasangan otomatis tidak diganti,
 * sheet aktif tanpa pasangan wajib diputuskan (sheet baru tanpa pasangan, dipakai sekali, atau null),
 * lalu planPair per pasangan.
 */
export function validateMapping(raw: unknown, ctx: MappingContext): MappingCheck {
  const parsed = parseMappingInput(raw);
  if (!parsed.ok) return parsed;
  const { input } = parsed;
  if (!ctx.active || !sameSnapshot(input.base, snapshotRef(ctx.active))) {
    return { ok: false, code: "STALE", message: MAPPING_STALE_MESSAGE };
  }
  const active = [...ctx.active.sheets].sort((x, y) => x.index - y.index);
  const fresh = [...ctx.sheets].sort((x, y) => x.index - y.index);
  const auto = new Map<string, VersionSheet>();
  planSheets(fresh, active).pairs.forEach((a, i) => {
    if (a) auto.set(a.id, fresh[i]!);
  });
  const autoTargets = new Set([...auto.values()].map((s) => s.id));
  const freshById = new Map(fresh.map((s) => [s.id, s]));
  const activeIds = new Set(active.map((s) => s.id));
  const decisions = new Map<string, SheetMappingInput>();
  const chosen = new Set<string>();
  for (const d of input.sheets) {
    if (!activeIds.has(d.activeSheetId)) return invalid("Sheet aktif tidak dikenal.");
    if (decisions.has(d.activeSheetId)) return invalid("Satu sheet aktif diputuskan dua kali.");
    decisions.set(d.activeSheetId, d);
    const a = active.find((s) => s.id === d.activeSheetId)!;
    const paired = auto.get(a.id);
    if (paired) {
      if (d.target !== paired.id) {
        return invalid(`Sheet "${a.name}" sudah berpasangan dengan sheet "${paired.name}".`);
      }
      continue;
    }
    if (d.target === null) {
      if (d.columns.length || d.casts?.length) {
        return invalid(`Sheet "${a.name}" tidak dipakai lagi; kolomnya tidak bisa dipetakan.`);
      }
      continue;
    }
    if (!freshById.has(d.target) || autoTargets.has(d.target)) {
      return invalid(`Sheet pengganti untuk "${a.name}" tidak tersedia di file baru.`);
    }
    if (chosen.has(d.target)) return invalid("Satu sheet file baru dipilih untuk dua sheet aktif.");
    chosen.add(d.target);
  }

  const plan: MappingPlan = { pairs: [], dropped: [], sheetMap: {} };
  for (const a of active) {
    const decision = decisions.get(a.id);
    const target =
      auto.get(a.id) ?? (decision?.target ? freshById.get(decision.target) : undefined);
    if (!target) {
      if (!decision) {
        return invalid(
          `Sheet "${a.name}" tidak ada di file baru: pilih sheet penggantinya atau tandai tidak dipakai lagi.`,
        );
      }
      plan.dropped.push(a);
      continue;
    }
    const where = active.length > 1 ? ` di sheet "${a.name}"` : "";
    const userPaired = !auto.has(a.id);
    // Pasangan otomatis: header sudah dipilih saat ingest (raw.parquet, refreshHeader).
    const header = userPaired
      ? pairedHeader(target, a)
      : { headerRow: target.headerRow, columns: target.columns };
    const r = planPair(header.columns, target.colCount, a, decision, where);
    if ("error" in r) return invalid(r.error);
    plan.pairs.push({ ...r, active: a, target, decision, userPaired, ...header });
    plan.sheetMap[a.id] = target.id;
  }
  return { ok: true, input, plan };
}
