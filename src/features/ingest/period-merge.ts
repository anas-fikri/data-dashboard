import { columnKeys } from "@/features/widgets/remap";
import type { ColumnMeta } from "./header";

/*
 * Gabung sheet berkolom sama di unggahan periode (v1.19, T-jsmj). Sheet file yang tidak berpasangan lewat
 * nama/alias (planSheets) ikut sheet data yang sama bila judul kolomnya sama persis dengan sheet file yang
 * sudah dipasangkan ke sheet data itu — atau, bila sheet data itu belum punya pasangan di file, bila
 * kolomnya cocok persis dengan skema aktifnya (tanpa pemetaan, tanpa kolom baru). Ragu (cocok dengan lebih
 * dari satu sheet data) → tidak digabung, sheet diabaikan seperti sebelumnya. Murni (diuji unit).
 */

/** Sidik judul kolom (nama dinormalkan, urut posisi) — sama = kolom sama. */
export const headerSignature = (columns: readonly Pick<ColumnMeta, "original">[]): string =>
  columnKeys(columns.map((c) => c.original)).join("\u0001");

export interface MergeCandidate {
  lineageId: string;
  /** Sidik judul sheet file ini bila dibaca dengan baris judul sheet data tersebut. */
  sig: string;
  /** Kolomnya cocok persis dengan skema aktif sheet data (tanpa isu pemetaan, tanpa kolom baru). */
  exact: boolean;
}

export type MergeTarget = { lineageId: string } | { reason: "none" | "ambiguous" };

/**
 * Sheet data tujuan untuk satu sheet file tambahan. `primary`: sidik sheet file yang sudah dipasangkan ke
 * tiap sheet data di file yang sama (sheet pertama yang masuk menjadi acuan sheet berikutnya).
 */
export function pickMergeTarget(
  candidates: readonly MergeCandidate[],
  primary: ReadonlyMap<string, string>,
): MergeTarget {
  const hits = candidates.filter((c) =>
    primary.has(c.lineageId) ? primary.get(c.lineageId) === c.sig : c.exact,
  );
  if (hits.length === 1) return { lineageId: hits[0]!.lineageId };
  return { reason: hits.length ? "ambiguous" : "none" };
}
