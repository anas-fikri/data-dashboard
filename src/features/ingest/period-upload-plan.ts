/*
 * Unggahan periode (T-052, rencana G-6 §4.5–4.6, §4.9) — bagian murni, dipakai worker (ingest periode)
 * dan app (tinjauan/"Terapkan"):
 *  - periodColumnPlan: kolom file baru → posisi kanonik skema aktif (peta kolom segmen, T-gcn8) +
 *    masalah yang membuat versi menunggu pemetaan (kolom terlihat hilang, kolom periode hilang, kolom
 *    kosong yang kembali ada). Cast selalu memakai skema aktif tanpa inferensi (D4).
 *  - validateColMap: peta kolom yang ditulis ke Segment.colMap harus sah (canonicalProfile/copyTyped
 *    membuang posisi di luar jumlah kolom kanonik — peta yang salah = data hilang diam-diam).
 *  - castIssues: vonis cast 98% dihitung HANYA atas baris file baru (bukan gabungan periode lama).
 *  - planInputs/buildPeriodManifest: rencana computePeriodPlan dari metadata manifest aktif + segmen
 *    baru, lalu manifest versi baru per sheet logis (periode yang tidak berubah merujuk file typed yang
 *    sama — tidak ada objek baru untuk periode lama).
 *  - periodPlanDigest/periodPlanSummary: sidik rencana yang dilihat pemilik (PLAN_STALE bila berbeda)
 *    dan kalimat riwayat ("April 2026 ditambahkan (12.950 baris)").
 */
import { createHash } from "node:crypto";
import type { ColumnMeta } from "./header";
import { INFER_THRESHOLD, okCount, type ColumnSchema, type SourceKind } from "./infer";
import {
  computePeriodPlan,
  type PeriodPlan,
  type PeriodPlanEntry,
  type PlanPeriodInput,
} from "./period-plan";
import type { RawProfile } from "./profile";
import { columnRef, planColumns, typeLabel } from "./refresh";
import { normName } from "@/features/widgets/remap";
import { MAX_COLUMN } from "@/features/widgets/spec";
import { z } from "zod";
import { columnTypeSchema } from "./recast-input";

// ── Kolom ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Perubahan skema sheet periode dari satu unggahan (T-057, rencana G-6 §4.9), diterapkan pada salinan
 * sheet aktif saat commit (applySchemaChange) — periode lama tidak pernah di-cast ulang:
 *  - kolom tambahan file → kolom tersembunyi baru (Teks) dengan posisi kanonik baru dan judul tersimpan;
 *    file typed periode lama tidak memuatnya → NULL lewat proyeksi query;
 *  - judul pengganti yang dikonfirmasi saat pemetaan → alias kolom (bulan berikutnya cocok otomatis);
 *  - lebar kanonik bertambah melewati kolom kosong (absent, T-014; posisinya tepat setelah
 *    Sheet.colCount, kolom baru sesudahnya): absent yang kembali ada di file menjadi kolom biasa
 *    (`normalized`), yang tetap tidak ada tetap absent di dalam lebar kanonik (recast menjaganya).
 */
export interface SheetSchemaChange {
  lineageId: string;
  /** Revisi skema sheet aktif tempat perubahan dihitung (berbeda saat commit → acuan basi). */
  baseRevision: number;
  /** Sheet.colCount baru (lebar kanonik). */
  colCount: number;
  /** Judul kolom (Sheet.columns) untuk posisi baru di atas Sheet.colCount lama. */
  columns: ColumnMeta[];
  /** Kolom baru (tersembunyi, Teks). */
  added: ColumnSchema[];
  aliases: { pos: number; alias: string }[];
  /** Posisi kolom absent yang kembali ada di file (menjadi kolom biasa). */
  normalized: number[];
}

/** Keputusan pemetaan satu sheet periode (T-057): posisi kolom aktif → kolom file baru, null = kosongkan. */
export type PeriodColumnDecision = ReadonlyMap<number, number | null>;

export interface PeriodColumnPlan {
  /**
   * colMap[pos-1] = kolom raw `c<n>` file baru untuk posisi kanonik `pos` (0 = tidak ada di file → NULL);
   * panjang = lebar kanonik (`colCount`). [] = identitas (urutan dan jumlah kolom sama persis).
   */
  colMap: number[];
  /** Masalah yang membuat versi menunggu pemetaan (kosong = cocok). */
  issues: string[];
  /** Kolom file baru yang tidak cocok/dipetakan (menjadi kolom tersembunyi baru). */
  extra: number;
  /** Lebar kanonik sheet versi baru (Sheet.colCount). */
  colCount: number;
  /** Skema cast segmen baru: skema aktif + alias + kolom baru (posisi kanonik). */
  schema: ColumnSchema[];
  /** Perubahan skema yang dibawa ke versi baru; null = skema aktif apa adanya. */
  change: Omit<SheetSchemaChange, "lineageId" | "baseRevision"> | null;
}

/**
 * Kolom sheet periode yang perlu keputusan pemetaan (sama di halaman, validasi app, dan worker): kolom
 * aktif terlihat yang hilang + kolom periode yang hilang (walau tersembunyi). `extra` = posisi kolom file
 * baru yang belum cocok (bisa dipilih untuk kolom yang hilang; sisanya menjadi kolom tersembunyi baru).
 */
export function periodMappingColumns(
  columns: ColumnMeta[],
  schema: ColumnSchema[],
  periodColumn: number | null,
): {
  matched: Map<number, ColumnSchema>;
  missing: ColumnSchema[];
  extra: number[];
  names: Map<number, string>;
} {
  const plan = planColumns(columns, schema);
  const found = new Set(plan.matched.values());
  const missing = [...plan.missing];
  const pc = periodColumn === null ? undefined : schema.find((c) => c.pos === periodColumn);
  if (pc && !found.has(pc) && !missing.includes(pc)) missing.push(pc);
  missing.sort((a, b) => a.pos - b.pos);
  return {
    matched: plan.matched,
    missing,
    extra: columns.filter((c) => !plan.matched.has(c.pos)).map((c) => c.pos),
    names: new Map(plan.overrides.map((o) => [o.pos, o.name ?? `kolom_${o.pos}`])),
  };
}

const hasAlias = (c: ColumnSchema, title: string) =>
  normName(c.original) === normName(title) ||
  (c.aliases ?? []).some((x) => normName(x) === normName(title));

/**
 * Pasangkan kolom file baru (judul asli + urutan kemunculan, aturan refresh T-013, lalu alias tersimpan)
 * dengan skema aktif sheet periode. `sheetColCount` = kolom kanonik sheet (Sheet.colCount);
 * `periodColumn` = posisi kanonik kolom periode (sumber kolom) atau null; `decision` = keputusan
 * pemetaan (T-057; tanpa keputusan setiap kolom yang hilang = masalah). Kolom absent yang kembali ada
 * dipetakan (periode lama tetap NULL); kolom tambahan menjadi kolom tersembunyi baru.
 */
export function periodColumnPlan(
  columns: ColumnMeta[],
  schema: ColumnSchema[],
  sheetColCount: number,
  periodColumn: number | null,
  sheet: string | null,
  decision?: PeriodColumnDecision,
): PeriodColumnPlan {
  const { matched, missing, names } = periodMappingColumns(columns, schema, periodColumn);
  const issues: string[] = [];
  const pc = periodColumn === null ? undefined : schema.find((c) => c.pos === periodColumn);
  if (periodColumn !== null && !pc) {
    issues.push(`Kolom periode sheet${sheet ? ` ${sheet}` : ""} tidak dikenal.`);
  }
  const map = new Map<number, number>();
  for (const [newPos, a] of matched) map.set(a.pos, newPos);
  const byNew = new Map(columns.map((c) => [c.pos, c]));
  const missingPos = new Set(missing.map((a) => a.pos));
  for (const pos of decision?.keys() ?? []) {
    if (!missingPos.has(pos)) issues.push(`Kolom posisi ${pos} tidak perlu dipetakan.`);
  }
  const aliases: { pos: number; alias: string }[] = [];
  for (const a of missing) {
    const pick = decision?.get(a.pos);
    const isPeriod = a === pc;
    if (pick === undefined) {
      // Kolom periode tersembunyi tidak termasuk kolom terlihat yang hilang: pesannya sendiri.
      issues.push(
        isPeriod && (a.hidden || a.absent)
          ? `${columnRef(a, sheet)} (kolom periode) tidak ada di file baru.`
          : `${columnRef(a, sheet)} tidak ada di file baru.`,
      );
      continue;
    }
    if (pick === null) {
      if (isPeriod) {
        issues.push(`${columnRef(a, sheet)} adalah kolom periode dan tidak bisa dikosongkan.`);
      }
      continue; // kosong (NULL) hanya di segmen baru; kolom tetap ada
    }
    const c = byNew.get(pick);
    if (!c || matched.has(pick) || [...map.values()].includes(pick)) {
      issues.push(
        `Kolom file baru posisi ${pick} tidak bisa dipakai untuk ${columnRef(a, sheet)}.`,
      );
      continue;
    }
    map.set(a.pos, pick);
    if (c.original.trim() !== "" && !hasAlias(a, c.original)) {
      aliases.push({ pos: a.pos, alias: c.original });
    }
  }
  const used = new Set(map.values());
  const extras = columns.filter((c) => !used.has(c.pos));
  const reappeared = [...matched.values()].some((a) => a.absent);
  const base = Math.max(0, Math.trunc(sheetColCount));
  const wide = Math.max(base, ...schema.map((c) => Math.trunc(c.pos)));
  // Lebar kanonik bertambah hanya bila perlu (kolom baru / absent kembali ada); selain itu tetap.
  const grow = extras.length > 0 || reappeared;
  const width = grow ? wide + extras.length : base;
  if (width > MAX_COLUMN) {
    issues.push(
      `Terlalu banyak kolom${sheet ? ` di sheet ${sheet}` : ""}: ${width} kolom melebihi ${MAX_COLUMN.toLocaleString("id-ID")}.`,
    );
  }
  for (const pos of map.keys()) {
    if (pos < 1 || pos > width) {
      const a = schema.find((c) => c.pos === pos)!;
      issues.push(`${columnRef(a, sheet)} perlu dipetakan ulang.`);
    }
  }
  const colMap = Array.from({ length: width }, (_, i) => map.get(i + 1) ?? 0);
  const aliasBy = new Map<number, string[]>();
  for (const x of aliases) aliasBy.set(x.pos, [...(aliasBy.get(x.pos) ?? []), x.alias]);
  // Hanya kolom absent yang kembali ada di file ini menjadi kolom biasa; yang tetap tidak ada tetap
  // absent (kosong permanen) walau posisinya kini di dalam lebar kanonik — unggahan berikutnya tanpa
  // kolom itu tidak berhenti di pemetaan (review T-057 M1).
  const normalized = [...matched.values()].filter((a) => a.absent).map((a) => a.pos);
  const out = schema.map((c): ColumnSchema => {
    let x: ColumnSchema = c;
    const al = aliasBy.get(c.pos);
    if (al) x = { ...x, aliases: [...(c.aliases ?? []), ...al] };
    if (normalized.includes(c.pos)) {
      const { absent: _absent, ...rest } = x;
      x = rest;
    }
    return x;
  });
  const added = extras.map((c, i): ColumnSchema => ({
    pos: wide + i + 1,
    name: names.get(c.pos) ?? `kolom_${wide + i + 1}`,
    original: c.original,
    type: "text",
    hidden: true,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
    nonEmpty: 0,
  }));
  const metas: ColumnMeta[] = grow
    ? [
        // Semua posisi di atas Sheet.colCount lama (absent tetap atau kembali ada) mendapat judul.
        ...schema
          .filter((c) => c.absent && c.pos > base)
          .map((c) => ({ pos: c.pos, name: c.name, original: c.original })),
        ...added.map((c) => ({ pos: c.pos, name: c.name, original: c.original })),
      ].sort((a, b) => a.pos - b.pos)
    : [];
  // Kolom baru membawa raw-nya lewat peta kolom (posisi kanonik baru → kolom file).
  if (grow) {
    extras.forEach((c, i) => {
      colMap[wide + i] = c.pos;
    });
  }
  const identityAll = columns.length === width && colMap.every((n, i) => n === i + 1);
  const change =
    grow || aliases.length ? { colCount: width, columns: metas, added, aliases, normalized } : null;
  return {
    colMap: identityAll ? [] : colMap,
    issues,
    extra: extras.length,
    colCount: width,
    schema: [...out, ...added],
    change,
  };
}

/** DatasetVersion.periodMeta (T-057): sheet file yang diabaikan + perubahan skema sheet unggahan. */
export interface PeriodMeta {
  ignoredSheets: string[];
  changes: SheetSchemaChange[];
}

const posSchema = z.number().int().min(1).max(MAX_COLUMN);
const metaSchema = z.object({ pos: posSchema, name: z.string(), original: z.string() });
const periodMetaSchema = z.object({
  ignoredSheets: z.array(z.string()).max(1_024).default([]),
  changes: z
    .array(
      z.object({
        lineageId: z.string().min(1),
        baseRevision: z.number().int().min(0),
        colCount: z.number().int().min(0).max(MAX_COLUMN),
        columns: z.array(metaSchema).max(MAX_COLUMN),
        // Kolom baru ditulis worker sendiri: bentuk ColumnSchema dijaga (posisi, tipe), sisanya apa adanya.
        added: z
          .array(
            z
              .object({
                pos: posSchema,
                name: z.string(),
                original: z.string(),
                type: columnTypeSchema,
              })
              .passthrough(),
          )
          .max(MAX_COLUMN),
        aliases: z.array(z.object({ pos: posSchema, alias: z.string() })).max(MAX_COLUMN),
        normalized: z.array(posSchema).max(MAX_COLUMN),
      }),
    )
    .max(1_024)
    .default([]),
});

/** periodMeta tersimpan → bentuk sah; null = kosong; bentuk tidak dikenal → null juga (dicatat pemanggil). */
export function parsePeriodMeta(raw: unknown): PeriodMeta | null {
  if (raw === null || raw === undefined) return null;
  const r = periodMetaSchema.safeParse(raw);
  return r.success ? (r.data as unknown as PeriodMeta) : null;
}

/**
 * Terapkan perubahan skema unggahan (T-057) pada sheet aktif yang disalin ke versi baru; null = tidak
 * cocok lagi dengan sheet itu (revisi berbeda, posisi bentrok) → acuan basi, tidak pernah ditebak.
 */
export function applySchemaChange(
  row: { colCount: number; columns: ColumnMeta[]; schema: ColumnSchema[]; schemaRevision: number },
  ch: SheetSchemaChange,
): { colCount: number; columns: ColumnMeta[]; schema: ColumnSchema[] } | null {
  if (ch.baseRevision !== row.schemaRevision || ch.colCount < row.colCount) return null;
  const have = new Set(row.schema.map((c) => c.pos));
  const top = Math.max(row.colCount, ...row.schema.map((c) => c.pos));
  const addedPos = ch.added.map((c) => c.pos);
  if (new Set(addedPos).size !== addedPos.length) return null;
  if (addedPos.some((p) => have.has(p) || p <= top || p > ch.colCount)) return null;
  if (ch.normalized.some((p) => !have.has(p) || p > ch.colCount)) return null;
  if (ch.aliases.some((x) => !have.has(x.pos))) return null;
  const metaPos = ch.columns.map((c) => c.pos);
  if (new Set(metaPos).size !== metaPos.length) return null;
  if (metaPos.some((p) => p <= row.colCount || p > ch.colCount)) return null;
  const schema = row.schema.map((c): ColumnSchema => {
    let x: ColumnSchema = c;
    for (const a of ch.aliases) {
      if (a.pos === c.pos && !hasAlias(x, a.alias)) {
        x = { ...x, aliases: [...(x.aliases ?? []), a.alias] };
      }
    }
    if (ch.normalized.includes(c.pos)) {
      const { absent: _absent, ...rest } = x;
      x = rest;
    }
    return x;
  });
  return {
    colCount: ch.colCount,
    columns: [...row.columns.filter((c) => c.pos <= row.colCount), ...ch.columns].sort(
      (a, b) => a.pos - b.pos,
    ),
    schema: [...schema, ...ch.added].sort((a, b) => a.pos - b.pos),
  };
}

/** Statistik kolom baru dari profil kanonik file baru (hanya baris file ini; periode lama NULL). */
export function withAddedStats<T extends { added: ColumnSchema[] }>(ch: T, profile: RawProfile): T {
  const rows = profile.dataRows;
  return {
    ...ch,
    added: ch.added.map((c) => {
      const p = profile.profiles.get(`c${c.pos}`);
      const n = p?.n ?? 0;
      return {
        ...c,
        nullPct: rows > 0 ? Math.round(((rows - n) / rows) * 10_000) / 10_000 : 0,
        distinctCount: p?.distinct ?? 0,
        nonEmpty: n,
      };
    }),
  };
}

/**
 * Masalah peta kolom (T-gcn8): panjang = kolom kanonik, setiap nilai 0..kolom raw, nilai > 0 unik.
 * [] = sah. Identitas ([]) hanya sah bila jumlah kolom raw = kolom kanonik.
 */
export function validateColMap(
  colMap: number[],
  sheetColCount: number,
  rawColCount: number,
  label: string,
): string[] {
  if (!colMap.length) {
    return rawColCount === sheetColCount
      ? []
      : [
          `${label}: peta kolom identitas untuk ${rawColCount} kolom file, ${sheetColCount} kolom data`,
        ];
  }
  const out: string[] = [];
  if (colMap.length !== sheetColCount) {
    out.push(`${label}: peta kolom ${colMap.length} posisi, ${sheetColCount} kolom data`);
  }
  const seen = new Set<number>();
  for (const n of colMap) {
    if (!Number.isInteger(n) || n < 0 || n > rawColCount) {
      out.push(`${label}: peta kolom merujuk kolom file ${n} di luar 1..${rawColCount}`);
    } else if (n > 0) {
      if (seen.has(n)) out.push(`${label}: kolom file ${n} dipetakan dua kali`);
      seen.add(n);
    }
  }
  if (!seen.size) out.push(`${label}: tidak ada kolom file yang terpetakan`);
  return out;
}

/** Kolom dengan nilai lolos konversi < 98% di file baru (persen bulat ke bawah). */
export interface CastProblem {
  column: ColumnSchema;
  /** Porsi nilai yang cocok (0–1), dibulatkan ke bawah ke persen bulat. */
  pct: number;
}

/**
 * Vonis cast atas baris file baru saja (AC 2 T-052): kolom non-teks yang terpetakan dengan nilai lolos
 * konversi < 98%. `profile` = profil kanonik (berkunci posisi skema).
 */
export function castProblems(
  schema: ColumnSchema[],
  profile: RawProfile,
  colMap: number[],
  source: SourceKind,
): CastProblem[] {
  const out: CastProblem[] = [];
  for (const c of [...schema].sort((a, b) => a.pos - b.pos)) {
    if (c.absent || c.type === "text") continue;
    if (colMap.length && !(colMap[c.pos - 1]! > 0)) continue;
    const p = profile.profiles.get(`c${c.pos}`);
    const n = p?.n ?? 0;
    if (!p || n === 0) continue;
    const ok = Math.min(n, okCount(p, c, source));
    if (ok / n >= INFER_THRESHOLD) continue;
    out.push({ column: c, pct: Math.floor((ok * 100) / n) / 100 });
  }
  return out;
}

/** castProblems sebagai kalimat alasan menunggu pemetaan. */
export function castIssues(
  schema: ColumnSchema[],
  profile: RawProfile,
  colMap: number[],
  source: SourceKind,
  sheet: string | null,
): string[] {
  return castProblems(schema, profile, colMap, source).map(
    ({ column: c, pct }) =>
      `${columnRef(c, sheet)} hanya ${Math.round(pct * 100)}% nilai di file baru yang cocok dengan tipe ${typeLabel(c)}.`,
  );
}

// ── Rencana + manifest ──────────────────────────────────────────────────────────────────────────────

/**
 * Kelompok file satu periode (T-060, Segment.groupId/groupPart/groupSize): id kelompok, nomor file
 * 1..n, dan jumlah segmen kelompok di periode + sheet logis yang sama. Tidak ada/null = satu file.
 */
export interface SegmentGroupRef {
  groupId?: string | null;
  groupPart?: number | null;
  groupSize?: number | null;
}

/** Satu file typed periode di manifest versi aktif. */
export interface ActiveSegmentRef extends SegmentGroupRef {
  /** SegmentTyped.id (dirujuk ulang apa adanya oleh versi baru). */
  typedId: string;
  segmentId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  /** Byte raw + typed. */
  bytes: number;
  sha256: string | null;
}

/** Sheet logis versi aktif (mode periode). */
export interface ActivePeriodSheet {
  sheetId: string;
  lineageId: string;
  name: string;
  schemaRevision: number;
  segments: ActiveSegmentRef[];
}

/**
 * Segmen baru dari file unggahan (satu per periode per sheet logis per file, baris > 0; kelompok file
 * T-060: satu per file kelompok yang memuat periode itu).
 */
export interface IncomingSegmentRef extends SegmentGroupRef {
  /** SHA-256 file asal (T-060 review L4: sidik per periode); tidak ada = sidik file unggahan. */
  sha256?: string | null;
  typedId: string;
  segmentId: string;
  lineageId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  bytes: number;
}

const byStart = <T extends { periodStart: string }>(a: T, b: T) =>
  a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0;

/**
 * Sidik gabungan file asal (T-060): satu file = sha256-nya apa adanya (sama dengan sebelum kelompok);
 * beberapa file = sha256 dari daftar sha terurut, jadi kelompok file yang sama (urutan apa pun) memberi
 * sidik yang sama. Ada yang tidak diketahui (null) → null.
 */
export function combinedSha256(shas: readonly (string | null | undefined)[]): string | null {
  const set = new Set(shas.map((x) => x ?? null));
  if (!set.size || set.has(null)) return null;
  const list = [...set].sort() as string[];
  return list.length === 1
    ? list[0]!
    : createHash("sha256")
        .update(`group:${list.join(",")}`)
        .digest("hex");
}

/**
 * Masalah segmen satu periode di satu sheet logis (T-060): lebih dari satu segmen hanya sah bila
 * semuanya satu kelompok file yang lengkap (id kelompok sama, nomor file berbeda, jumlah = groupSize).
 * Satu segmen: tanpa kelompok, atau kelompok berukuran 1. null = sah. Murni (dipakai rencana, manifest,
 * dan gerbang integritas).
 */
export function segmentGroupProblem(segs: readonly SegmentGroupRef[]): string | null {
  if (segs.length <= 1) {
    const g = segs[0];
    if (g?.groupId && g.groupSize !== 1) return "kelompok file tidak lengkap";
    return null;
  }
  const id = segs[0]!.groupId;
  if (!id || segs.some((g) => g.groupId !== id)) return "muncul lebih dari sekali";
  const parts = new Set(segs.map((g) => g.groupPart));
  if (parts.size !== segs.length || [...parts].some((p) => !p || p < 1)) {
    return "nomor file kelompok ganda";
  }
  if (segs.some((g) => g.groupSize !== segs.length)) return "kelompok file tidak lengkap";
  return null;
}

/** Periode → sheet logis → isi (rows/bytes/segmen), dan sidik file asal gabungan (combinedSha256). */
function group(
  segs: ({
    lineageId: string;
    periodKey: string;
    periodStart: string;
    rows: number;
    bytes: number;
    sha256?: string | null;
  } & SegmentGroupRef)[],
): PlanPeriodInput[] {
  const by = new Map<
    string,
    { key: string; start: string; parts: Map<string, typeof segs>; shas: (string | null)[] }
  >();
  for (const g of [...segs].sort(byStart)) {
    const e = by.get(g.periodKey) ?? {
      key: g.periodKey,
      start: g.periodStart,
      parts: new Map<string, typeof segs>(),
      shas: [],
    };
    e.parts.set(g.lineageId, [...(e.parts.get(g.lineageId) ?? []), g]);
    e.shas.push(g.sha256 ?? null);
    by.set(g.periodKey, e);
  }
  return [...by.values()].map((e) => {
    const sheets: PlanPeriodInput["sheets"] = {};
    for (const [lineage, list] of e.parts) {
      const bad = segmentGroupProblem(list);
      if (bad) throw new Error(`periode ${e.key} di sheet logis ${lineage}: ${bad}`);
      sheets[lineage] = {
        rows: list.reduce((n, x) => n + x.rows, 0),
        bytes: list.reduce((n, x) => n + x.bytes, 0),
        ...(list.length > 1 ? { segments: list.length } : {}),
      };
    }
    return { key: e.key, start: e.start, sheets, sha256: combinedSha256(e.shas) };
  });
}

/** Masukan computePeriodPlan dari manifest aktif dan segmen file baru. */
export function planInputs(
  active: ActivePeriodSheet[],
  incoming: IncomingSegmentRef[],
): { active: PlanPeriodInput[]; incoming: PlanPeriodInput[] } {
  return {
    active: group(active.flatMap((s) => s.segments.map((g) => ({ ...g, lineageId: s.lineageId })))),
    incoming: group(incoming),
  };
}

export interface ManifestRef {
  typedId: string;
  segmentId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  /** File typed dari unggahan ini (bukan rujukan ulang periode lama). */
  fromUpload: boolean;
}

/**
 * Manifest versi baru per sheet logis menurut rencana (urut awal periode): periode ditambah/diganti
 * memakai segmen file baru di sheet yang ada di file, selain itu file typed periode lama apa adanya;
 * periode yang dilepas tidak ikut. Jumlah baris setiap sheet harus sama dengan `after` rencana —
 * selisih = galat (rencana dan segmen tidak sepakat; tidak pernah diaktifkan).
 */
export function buildPeriodManifest(
  plan: PeriodPlan,
  active: ActivePeriodSheet[],
  incoming: IncomingSegmentRef[],
): Map<string, ManifestRef[]> {
  if (plan.rejection) throw new Error("rencana yang ditolak tidak punya manifest");
  const file = new Set(plan.fileSheets);
  const out = new Map<string, ManifestRef[]>();
  const entries = [...plan.entries].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  for (const s of active) {
    const refs: ManifestRef[] = [];
    for (const e of entries) {
      if (e.after === null) continue;
      const fresh = (e.action === "ADDED" || e.action === "REPLACED") && file.has(s.lineageId);
      const want = e.after[s.lineageId] ?? 0;
      // Satu periode = semua segmennya (kelompok file T-060: semua file kelompok, urut nomor file).
      const list = fresh
        ? incoming.filter((g) => g.lineageId === s.lineageId && g.periodKey === e.key)
        : s.segments.filter((g) => g.periodKey === e.key);
      const bad = segmentGroupProblem(list);
      if (bad) throw new Error(`manifest ${s.name} periode ${e.key}: ${bad}`);
      const got = list.reduce((n, g) => n + g.rows, 0);
      if (got !== want) {
        throw new Error(`manifest ${s.name} periode ${e.key}: ${got} baris, rencana ${want} baris`);
      }
      refs.push(
        ...[...list]
          .sort((x, y) => (x.groupPart ?? 0) - (y.groupPart ?? 0))
          .map((g) => pick(g, fresh)),
      );
    }
    out.set(s.lineageId, refs);
  }
  return out;
}

function pick(
  g: { typedId: string; segmentId: string; periodKey: string; periodStart: string; rows: number },
  fromUpload: boolean,
): ManifestRef {
  return {
    typedId: g.typedId,
    segmentId: g.segmentId,
    periodKey: g.periodKey,
    periodStart: g.periodStart,
    rows: g.rows,
    fromUpload,
  };
}

/** JSON dengan kunci objek terurut (sidik stabil walau urutan field berbeda). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Sidik rencana (sha256 heksa): yang dikonfirmasi pemilik harus sama dengan hitungan ulang server. */
export function periodPlanDigest(plan: PeriodPlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

const fmt = (n: number) => n.toLocaleString("id-ID");

function entryText(e: PeriodPlanEntry, plan: PeriodPlan): string | null {
  switch (e.action) {
    case "ADDED":
      return `${e.label} ditambahkan (${fmt(e.afterRows)} baris)`;
    case "REPLACED":
      return `${e.label} diganti (${fmt(e.beforeRows)} → ${fmt(e.afterRows)} baris)`;
    case "EVICTED": {
      const evicted = plan.entries.filter((x) => x.action === "EVICTED").length;
      return plan.totals.periodsAfter + evicted > plan.keep
        ? `${e.label} dilepas (batas ${fmt(plan.keep)} periode)`
        : `${e.label} dilepas (batas penyimpanan)`;
    }
    case "EXCLUDED":
      return `${e.label} dikecualikan (kemungkinan nyasar)`;
    default:
      return null;
  }
}

/** Kalimat riwayat/notifikasi rencana unggahan periode (urut periode). */
export function periodPlanSummary(plan: PeriodPlan): string {
  const parts = plan.entries.map((e) => entryText(e, plan)).filter((x): x is string => !!x);
  if (plan.droppedRows > 0)
    parts.push(`${fmt(plan.droppedRows)} baris tanpa tanggal valid dibuang`);
  for (const s of plan.ignoredSheets) parts.push(`sheet “${s}” tidak disimpan`);
  return parts.length ? parts.join(" · ") : "Tidak ada periode yang berubah";
}

/** Persetujuan eksplisit yang wajib ada saat "Terapkan" (selain sidik rencana). */
export interface PeriodAck {
  /** "Saya paham … diganti dengan data yang lebih sedikit". */
  shrink: boolean;
  /** "Buang N baris" tanpa tanggal valid: N harus sama dengan rencana. */
  droppedRows: number;
}

/** Alasan "Terapkan" ditolak untuk rencana ini (null = boleh). Pesan Bahasa Indonesia. */
export function confirmBlocker(plan: PeriodPlan, ack: PeriodAck): string | null {
  if (plan.rejection) return plan.rejection.message;
  if (plan.confirm.includes("NO_CHANGE")) {
    return "Tidak ada periode yang berubah dengan pilihan ini. Batalkan unggahan, atau pilih “Masukkan” untuk periode yang dikecualikan.";
  }
  if (plan.confirm.includes("SHRINK") && !ack.shrink) {
    const names = plan.entries.filter((e) => e.shrink).map((e) => e.label);
    return `Centang “Saya paham ${names.join(", ")} diganti dengan data yang lebih sedikit” untuk melanjutkan.`;
  }
  if (plan.droppedRows !== ack.droppedRows) {
    return plan.droppedRows > 0
      ? `Ada ${fmt(plan.droppedRows)} baris tanpa tanggal valid. Pilih “Buang ${fmt(plan.droppedRows)} baris” untuk melanjutkan, atau perbaiki file lalu unggah ulang.`
      : "Jumlah baris yang dibuang tidak cocok dengan rencana. Tinjau ulang.";
  }
  return null;
}

// ── Keputusan commit (worker "aktif otomatis" dan app "Terapkan") ───────────────────────────────────

/** Fakta file unggahan yang tidak bergantung pada data aktif (dibekukan bersama rencana). */
export interface UploadFacts {
  grain: PeriodPlan["grain"];
  source: PeriodPlan["source"];
  /** Sheet logis yang ada di file. */
  fileSheets: string[];
  droppedRows: number;
  ignoredSheets: string[];
  fileSha256: string | null;
}

/** Fakta file dari rencana beku (versi AWAITING_CONFIRM). */
export const factsOf = (plan: PeriodPlan): UploadFacts => ({
  grain: plan.grain,
  source: plan.source,
  fileSheets: plan.fileSheets,
  droppedRows: plan.droppedRows,
  ignoredSheets: plan.ignoredSheets,
  fileSha256: plan.fileSha256,
});

export type CommitMode =
  /** Worker setelah file diproses: aktif hanya bila rencana murni menambah dan `allowAuto`. */
  | { kind: "auto"; allowAuto: boolean }
  /** Pemilik menekan "Terapkan": rencana hitung ulang harus sama dengan yang dilihatnya. */
  | { kind: "confirm"; digest: string; ack: PeriodAck };

export type CommitDecision =
  | { decision: "activate"; plan: PeriodPlan; manifest: Map<string, ManifestRef[]> }
  | { decision: "await"; plan: PeriodPlan; manifest: Map<string, ManifestRef[]> }
  | { decision: "reject"; plan: PeriodPlan; message: string }
  | { decision: "plan_stale"; plan: PeriodPlan }
  | { decision: "blocked"; plan: PeriodPlan; message: string };

/**
 * Rencana SELALU dihitung ulang dari data aktif + pengaturan dataset + batas saat ini (tidak pernah
 * memercayai `autoActivate` rencana beku), lalu:
 *  - auto: penolakan → reject; aktif otomatis hanya bila rencana hitung ulang `autoActivate` dan
 *    `allowAuto` (versi dasar init = versi aktif); selain itu menunggu konfirmasi;
 *  - confirm: sidik berbeda → plan_stale (pemilik melihat rencana baru); penolakan/centang yang kurang →
 *    blocked; selain itu activate.
 */
export function decidePeriodCommit(a: {
  facts: UploadFacts;
  activeVersionId: string;
  active: ActivePeriodSheet[];
  incoming: IncomingSegmentRef[];
  settings: { keepPeriods: number | null; onLimit: "REJECT" | "EVICT_OLDEST" };
  limits: Parameters<typeof computePeriodPlan>[0]["limits"];
  include: string[];
  mode: CommitMode;
}): CommitDecision {
  const inputs = planInputs(a.active, a.incoming);
  const plan = computePeriodPlan({
    grain: a.facts.grain,
    source: a.facts.source,
    baseVersionId: a.activeVersionId,
    active: inputs.active,
    incoming: inputs.incoming,
    incomingSheets: a.facts.fileSheets,
    settings: a.settings,
    limits: a.limits,
    include: a.include,
    fileSha256: a.facts.fileSha256,
    droppedRows: a.facts.droppedRows,
    ignoredSheets: a.facts.ignoredSheets,
  });
  if (a.mode.kind === "confirm") {
    if (periodPlanDigest(plan) !== a.mode.digest) return { decision: "plan_stale", plan };
    const blocker = confirmBlocker(plan, a.mode.ack);
    if (blocker) return { decision: "blocked", plan, message: blocker };
    return {
      decision: "activate",
      plan,
      manifest: buildPeriodManifest(plan, a.active, a.incoming),
    };
  }
  if (plan.rejection) return { decision: "reject", plan, message: plan.rejection.message };
  const manifest = buildPeriodManifest(plan, a.active, a.incoming);
  return plan.autoActivate && a.mode.allowAuto
    ? { decision: "activate", plan, manifest }
    : { decision: "await", plan, manifest };
}
