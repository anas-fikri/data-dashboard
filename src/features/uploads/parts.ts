/*
 * Rencana part multipart (fungsi murni, dipakai server dan browser). Ukuran setiap part ditentukan
 * server dan ditandatangani sebagai Content-Length; part terakhir berisi sisa.
 */

export const PART_SIZE = 16 * 1024 * 1024;

export function partCountOf(size: number, partSize = PART_SIZE): number {
  return Math.max(1, Math.ceil(size / partSize));
}

/** Ukuran yang diharapkan untuk part ke-n (1-based). */
export function expectedPartSize(
  n: number,
  size: number,
  partSize = PART_SIZE,
  count = partCountOf(size, partSize),
): number {
  if (!Number.isInteger(n) || n < 1 || n > count)
    throw new RangeError(`part ${n} di luar 1..${count}`);
  return n < count ? partSize : size - partSize * (count - 1);
}

/** Rentang byte [start, end) part ke-n di file. */
export function partRange(n: number, partSize = PART_SIZE): [number, number] {
  return [(n - 1) * partSize, n * partSize];
}

export interface StoredPart {
  partNumber: number;
  size: number;
}

export type PartsVerdict =
  | { kind: "complete" }
  | { kind: "missing"; missing: number[] }
  | { kind: "corrupt"; reason: string };

/**
 * Bandingkan part yang ada di storage dengan rencana: setiap nomor 1..count wajib ada dengan ukuran
 * persis. Part asing (nomor di luar rencana) atau ukuran berbeda = rusak (upload di-abort).
 */
export function verifyParts(
  parts: StoredPart[],
  size: number,
  partSize = PART_SIZE,
  count = partCountOf(size, partSize),
): PartsVerdict {
  const seen = new Set<number>();
  for (const p of parts) {
    if (!Number.isInteger(p.partNumber) || p.partNumber < 1 || p.partNumber > count) {
      return { kind: "corrupt", reason: `part ${p.partNumber} tidak diterbitkan` };
    }
    const want = expectedPartSize(p.partNumber, size, partSize, count);
    if (p.size !== want) {
      return {
        kind: "corrupt",
        reason: `part ${p.partNumber} berukuran ${p.size} byte, seharusnya ${want}`,
      };
    }
    seen.add(p.partNumber);
  }
  const missing: number[] = [];
  for (let n = 1; n <= count; n++) if (!seen.has(n)) missing.push(n);
  return missing.length ? { kind: "missing", missing } : { kind: "complete" };
}
