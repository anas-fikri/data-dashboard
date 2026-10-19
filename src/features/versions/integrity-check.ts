/*
 * Gerbang integritas versi (T-038, ADR-0008) — bagian murni, dipakai worker (ingest, pemetaan) dan app
 * (rollback). verifyVersionIntegrity (fail-closed) sebelum SETIAP aktivasi: manifest lengkap dan
 * konsisten (setiap sheet ber-typed punya segmen, ordinal berurutan, rentang `_row` antarsegmen tidak
 * bertumpuk) dan semua kunci yang dirujuk ada di storage. Jumlah baris + `_row` unik per file diperiksa
 * saat file typed ditulis (typedFileProblems, file masih lokal). Ada selisih → versi FAILED, versi aktif
 * tidak tersentuh.
 */

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
}
export interface ManifestSheet {
  id: string;
  name: string;
  /** Pointer typed sheet (null = sheet tanpa data typed). */
  typedKey: string | null;
  segments: ManifestSegment[];
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
