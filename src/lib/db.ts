import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Satu PrismaClient per proses: di dev bertahan melewati hot reload, di produksi dibagi salinan modul
 * bundle yang berbeda (mis. instrumentation.ts dan route handler, T-pvq8) — satu pool koneksi.
 */
export const prisma = (globalForPrisma.prisma ??= new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
}));
