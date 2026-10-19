import { randomBytes } from "node:crypto";

/*
 * Kunci objek data (T-038, ADR-0008). Segmen baru: parquet/<ds>/seg/<segmentId>/raw.parquet dan
 * typed-<rev>[-<token12>].parquet — imutabel, tidak terikat versi. Segmen legacy (sebelum T-038)
 * tetap di prefix versi parquet/<ds>/<ver>/<sheet>/. Hanya kunci yang cocok DATA_KEY yang boleh
 * dihapus satu per satu (GC, sapuan yatim, file percobaan recast/pemetaan). Murni.
 */
const ID = "[a-z0-9]{20,32}";
const FILE = "(?:raw|typed-\\d+(?:-[0-9a-f]{12})?)\\.parquet";

/** File data persis: grup 1 = datasetId, grup 2 = segmentId (hanya kunci seg/). */
export const DATA_KEY = new RegExp(`^parquet/(${ID})/(?:${ID}/${ID}|seg/(${ID}))/${FILE}$`);
/** Prefix satu segmen: grup 1 = datasetId, grup 2 = segmentId. */
export const SEGMENT_PREFIX = new RegExp(`^parquet/(${ID})/seg/(${ID})/$`);

const isId = (s: string) => new RegExp(`^${ID}$`).test(s);

export function segmentPrefix(datasetId: string, segmentId: string): string {
  if (!isId(datasetId) || !isId(segmentId)) throw new Error("id segmen tidak valid");
  return `parquet/${datasetId}/seg/${segmentId}/`;
}

/** Prefix semua segmen satu dataset (sapuan objek yatim). */
export const datasetSegmentsPrefix = (datasetId: string) => `parquet/${datasetId}/seg/`;

/**
 * Id segmen baru, dibuat SEBELUM objeknya diunggah agar kuncinya bisa memuat id (baris Segment ditulis
 * lebih dulu → percobaan ulang/kegagalan selalu tahu objek mana miliknya). Bentuk sama dengan cuid
 * (huruf kecil + angka, 25 karakter).
 */
export const newSegmentId = () => `c${randomBytes(12).toString("hex")}`;
