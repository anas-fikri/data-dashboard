import { Prisma } from "@prisma/client";

/** SQLSTATE deadlock (40P01) dan gagal serialisasi (40001). */
const CONFLICT_STATE = /\b(40P01|40001)\b/;

/**
 * Transaksi dibatalkan Postgres karena deadlock atau gagal serialisasi (review T-016 R2 DI-1):
 * dibatalkan utuh dan aman dicoba lagi → BUSY, bukan 500. Bentuknya di Prisma 6: P2034 (konflik tulis
 * / deadlock), P2010 dengan meta.code SQLSTATE (query mentah, mis. lock baris), atau
 * PrismaClientUnknownRequestError tanpa `code` yang hanya menyebut SQLSTATE di pesannya.
 */
export function isTxConflict(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      e.code === "P2034" || (e.code === "P2010" && CONFLICT_STATE.test(String(e.meta?.code ?? "")))
    );
  }
  return e instanceof Prisma.PrismaClientUnknownRequestError && CONFLICT_STATE.test(e.message);
}
