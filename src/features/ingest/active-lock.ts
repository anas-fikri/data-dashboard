import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Koreksi skema hanya untuk sheet versi aktif (T-013): kunci baris Dataset (FOR SHARE) bila versi
 * sheet masih aktif. Bersaing dengan finish/aktivasi (FOR UPDATE baris yang sama): koreksi yang commit
 * lebih dulu membuat ingest refresh "stale" (diulang); setelah versi lain aktif, kondisi join dicek
 * ulang atas baris Dataset terbaru → false (recast/edit "stale"). Urutan kunci Dataset → Sheet sama
 * dengan finish dan hapus dataset. Modul terpisah (hanya Prisma) agar proses app (schema/runtime) tidak
 * ikut memuat pipeline ingest.
 */
export async function lockActiveSheet(
  tx: Prisma.TransactionClient,
  sheetId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT d.id FROM "Dataset" d JOIN "Sheet" s ON s."versionId" = d."activeVersionId"
    WHERE s.id = ${sheetId} FOR SHARE OF d`;
  return rows.length > 0;
}
