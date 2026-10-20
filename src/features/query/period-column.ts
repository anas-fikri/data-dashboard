/*
 * Kolom sistem "Periode" (T-058, rencana G-6 §4.10). Sheet periode punya `_period DATE` (awal periode,
 * dibekukan saat unggah) di setiap file typed segmennya; lapisan query/dashboard menampilkannya sebagai
 * kolom skema virtual di posisi PERIOD_COLUMN, sehingga widget, filter dashboard (D6: lewat nama),
 * cross-filter, dan slicer memakainya seperti kolom tanggal biasa. Sumber query memproyeksikan
 * `_period AS c<PERIOD_COLUMN>` (source.ts). Kolom ini tidak pernah ditulis ke Sheet.schema.
 * Nama bawaan "Periode"; bila sheet sudah punya kolom bernama itu (tidak peka besar/kecil dan spasi),
 * "Periode (sistem)". Murni (aman untuk klien).
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { normName } from "@/features/widgets/remap";
import { PERIOD_COLUMN } from "@/features/widgets/spec";

export { PERIOD_COLUMN };

export const PERIOD_NAME = "Periode";
export const PERIOD_NAME_SYSTEM = "Periode (sistem)";

type GrainDb = "MONTH" | "QUARTER" | "YEAR";
const GRAIN: Record<GrainDb, NonNullable<ColumnSchema["periodGrain"]>> = {
  MONTH: "month",
  QUARTER: "quarter",
  YEAR: "year",
};

/** Mode periode sheet dari kolom DB (Sheet.periodSource + DatasetVersion.periodGrain). */
export interface PeriodColumnSource {
  grain: GrainDb | null | undefined;
  source: string | null | undefined;
  /** Awal periode terbaru di manifest sheet (ISO naive); tanpa ini preset "Periode terbaru" dilewati. */
  latest?: string | null;
}

/** Sheet ini sheet periode (punya `_period` di setiap file typed). */
export const isPeriodSheet = (
  p: PeriodColumnSource | null | undefined,
): p is PeriodColumnSource & {
  grain: GrainDb;
} => !!p?.grain && !!p.source;

/** Kolom virtual Periode untuk skema ini (nama menghindari bentrok dengan kolom pengguna). */
export function periodColumnOf(
  schema: Pick<ColumnSchema, "name" | "pos">[],
  p: PeriodColumnSource & { grain: GrainDb },
): ColumnSchema {
  const clash = schema.some((c) => c.pos !== PERIOD_COLUMN && normName(c.name) === "periode");
  const name = clash ? PERIOD_NAME_SYSTEM : PERIOD_NAME;
  return {
    pos: PERIOD_COLUMN,
    name,
    original: name,
    type: "date",
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
    system: "period",
    periodGrain: GRAIN[p.grain],
    ...(p.latest ? { periodLatest: p.latest } : {}),
  };
}

/**
 * Skema sheet + kolom virtual Periode (sheet periode saja). Skema null tetap null; skema yang sudah
 * memuat kolom itu tidak digandakan.
 */
export function withPeriodColumn<S extends ColumnSchema[] | null>(
  schema: S,
  p: PeriodColumnSource | null | undefined,
): S {
  if (!schema || !isPeriodSheet(p) || schema.some((c) => c.pos === PERIOD_COLUMN)) return schema;
  return [...schema, periodColumnOf(schema, p)] as S;
}

/** Skema tanpa kolom virtual (proyeksi file, penulisan skema). */
export const withoutPeriodColumn = <C extends Pick<ColumnSchema, "pos">>(schema: C[]): C[] =>
  schema.filter((c) => c.pos !== PERIOD_COLUMN);

/** Pilihan Prisma untuk withPeriodColumn pada Sheet (sumber periode + satuan versi). */
export const PERIOD_SHEET_SELECT = {
  periodSource: true,
  version: { select: { periodGrain: true } },
} as const;

/**
 * Baris Sheet dengan PERIOD_SHEET_SELECT → sumber kolom periode (field yang tidak dipilih = sheet
 * non-periode).
 */
export const periodOf = (s: {
  periodSource?: string | null;
  version?: { periodGrain: GrainDb | null } | null;
}): PeriodColumnSource => ({ grain: s.version?.periodGrain, source: s.periodSource });
