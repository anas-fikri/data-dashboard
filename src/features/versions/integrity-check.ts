/*
 * Gerbang integritas versi (T-038, ADR-0008) — bagian murni, dipakai worker (ingest, pemetaan) dan app
 * (rollback). verifyVersionIntegrity (fail-closed) sebelum SETIAP aktivasi: manifest lengkap dan
 * konsisten (setiap sheet ber-typed punya segmen, ordinal berurutan, rentang `_row` antarsegmen tidak
 * bertumpuk) dan semua kunci yang dirujuk ada di storage. Jumlah baris + `_row` unik per file diperiksa
 * saat file typed ditulis (typedFileProblems, file masih lokal). Ada selisih → versi FAILED, versi aktif
 * tidak tersentuh.
 *
 * Versi periode (T-049): setiap sheet punya sumber periode; setiap segmen punya periode yang cocok
 * dengan satuan versi dan jumlah baris tercatat; satu periode tidak muncul dua kali dalam satu sheet
 * (baris tergandakan) — kecuali sebagai satu kelompok file yang lengkap (T-060: id kelompok sama, nomor
 * file berbeda, jumlah = groupSize; segmentGroupProblem). Isi file — tidak ada `_period` NULL dan baris per periode = metadata — diperiksa
 * typedFileProblems saat file ditulis (ingest/recast), jadi metadata yang dicek di sini sudah terbukti
 * cocok dengan file-nya. Versi non-periode tidak boleh merujuk segmen berperiode.
 */
import { isIsoDate, periodKeyOf, periodStartOf, type PeriodGrain } from "@/features/ingest/period";
import { segmentGroupProblem } from "@/features/ingest/period-upload-plan";

/** Gagal gerbang integritas: permanen (mengulang dengan file yang sama tidak menolong). */
export class IntegrityError extends Error {
  constructor(readonly problems: string[]) {
    super(integrityMessage(problems));
  }
}

/** Kalimat galat (tanpa tindak lanjut — pemanggil menambahkannya sesuai konteks). */
export function integrityMessage(problems: string[]): string {
  const shown = problems.slice(0, 3).join("; ");
  const more = problems.length > 3 ? `; dan ${problems.length - 3} lainnya` : "";
  return `Pemeriksaan integritas data gagal (${shown}${more}).`;
}

export interface ManifestSegment {
  ordinal: number;
  rawKey: string;
  typedKey: string;
  rowBase: bigint;
  /** null = segmen legacy (rentang belum diukur). */
  maxSrcRow: number | null;
  /** Periode segmen (T-049); null/tidak ada = segmen non-periode. */
  periodKey?: string | null;
  /** Awal periode ISO naive (YYYY-MM-DD). */
  periodStart?: string | null;
  /** Baris data file typed (SegmentTyped.dataRows); null = file lama (belum diukur). */
  dataRows?: number | null;
  /** Kelompok file satu periode (T-060, Segment.groupId/groupPart/groupSize); null = satu file. */
  groupId?: string | null;
  groupPart?: number | null;
  groupSize?: number | null;
}
export interface ManifestSheet {
  id: string;
  name: string;
  /** Pointer typed sheet (null = sheet tanpa data typed). */
  typedKey: string | null;
  segments: ManifestSegment[];
  /** Satuan periode versi (T-049); null/tidak ada = versi non-periode. */
  periodGrain?: PeriodGrain | null;
  /** Sumber periode sheet (T-049). */
  periodSource?: string | null;
}

/** Selisih periode satu sheet (T-049). */
function periodProblems(s: ManifestSheet, label: string): string[] {
  const out: string[] = [];
  const grain = s.periodGrain ?? null;
  if (!grain) {
    if (s.segments.some((g) => g.periodKey || g.periodStart)) {
      out.push(`${label}: segmen berperiode di versi non-periode`);
    }
    return out;
  }
  if (s.typedKey && !s.periodSource) out.push(`${label}: sumber periode tidak tercatat`);
  const byKey = new Map<string, ManifestSegment[]>();
  for (const g of s.segments) {
    const at = `${label} segmen ${g.ordinal + 1}`;
    if (!g.periodKey || !g.periodStart || !isIsoDate(g.periodStart)) {
      out.push(`${at}: periode tidak tercatat`);
      continue;
    }
    if (
      periodStartOf(grain, g.periodStart) !== g.periodStart ||
      periodKeyOf(grain, g.periodStart) !== g.periodKey
    ) {
      out.push(`${at}: periode ${g.periodKey} tidak cocok dengan satuan versi`);
    }
    byKey.set(g.periodKey, [...(byKey.get(g.periodKey) ?? []), g]);
    if (g.dataRows === null || g.dataRows === undefined) {
      out.push(`${at}: jumlah baris periode ${g.periodKey} tidak tercatat`);
    }
  }
  for (const [key, list] of byKey) {
    const bad = segmentGroupProblem(list);
    if (bad) out.push(`${label}: periode ${key} ${bad}`);
  }
  return out;
}

/** Selisih metadata manifest (tanpa I/O). [] = konsisten. Murni. */
export function manifestProblems(sheets: ManifestSheet[]): string[] {
  const out: string[] = [];
  for (const s of sheets) {
    const label = `sheet "${s.name}"`;
    const segs = [...s.segments].sort((a, b) => a.ordinal - b.ordinal);
    if (s.typedKey && !segs.length) out.push(`${label} tanpa segmen`);
    if (segs.some((g, i) => g.ordinal !== i)) out.push(`${label}: urutan segmen tidak berurutan`);
    if (segs.length === 1 && s.typedKey && segs[0]!.typedKey !== s.typedKey) {
      out.push(`${label}: file typed tidak cocok dengan manifest`);
    }
    if (segs.length > 1) {
      if (segs.some((g) => g.maxSrcRow === null))
        out.push(`${label}: segmen lama tanpa rentang baris`);
      const ranges = [...segs].sort((a, b) => (a.rowBase < b.rowBase ? -1 : 1));
      for (let i = 1; i < ranges.length; i++) {
        const prev = ranges[i - 1]!;
        if (prev.rowBase + BigInt(prev.maxSrcRow ?? 0) > ranges[i]!.rowBase) {
          out.push(`${label}: nomor baris antarsegmen bertumpuk`);
          break;
        }
      }
    }
    out.push(...periodProblems(s, label));
  }
  return out;
}

const PARALLEL = 8;

/** Kunci yang tidak ada (404). Galat lain (jaringan/izin) dilempar — bukan bukti hilang. */
export async function missingKeys(
  keys: string[],
  exists: (key: string) => Promise<boolean>,
): Promise<string[]> {
  const missing: string[] = [];
  for (let i = 0; i < keys.length; i += PARALLEL) {
    const part = keys.slice(i, i + PARALLEL);
    const ok = await Promise.all(part.map((k) => exists(k)));
    part.forEach((k, j) => {
      if (!ok[j]) missing.push(k);
    });
  }
  return missing;
}

export interface IntegrityDeps {
  /** Manifest per sheet versi; null = versi tidak ada. */
  manifest(versionId: string): Promise<ManifestSheet[] | null>;
  exists(key: string): Promise<boolean>;
}

/** Selisih versi (manifest + kunci di storage); [] = boleh diaktifkan. */
export async function verifyVersionIntegrity(
  versionId: string,
  deps: IntegrityDeps,
): Promise<string[]> {
  const sheets = await deps.manifest(versionId);
  if (!sheets) return ["versi tidak ditemukan"];
  const problems = manifestProblems(sheets);
  const keys = [
    ...new Set(sheets.flatMap((s) => s.segments.flatMap((g) => [g.rawKey, g.typedKey]))),
  ];
  for (const k of await missingKeys(keys, deps.exists)) problems.push(`file data tidak ada: ${k}`);
  return problems;
}
