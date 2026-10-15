import "server-only";
import { recordAudit } from "@/features/audit/service";
import { dashboardAccess } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import { downloadToFile, uploadFile } from "@/lib/storage/files";
import { deleteExportObject, listExportObjects } from "@/lib/storage/exports";
import type { ExportCleanupRepo, ExportCleanupStorage } from "./cleanup";
import type { ExportJobRepo, ExportStorage } from "./job";
import type { ExportRepo, ExportRow } from "./service";

/*
 * Perakitan produksi ekspor (T-017): Prisma (tabel Export, AuditLog) + storage S3. Dipakai app (buat,
 * status, unduh) dan worker (job, pembersihan).
 */

const ROW_SELECT = {
  id: true,
  userId: true,
  dashboardId: true,
  widgetId: true,
  format: true,
  status: true,
  errorCode: true,
  errorMessage: true,
  key: true,
  fileName: true,
  rows: true,
  finishedAt: true,
  expiresAt: true,
  deletedAt: true,
} as const;

const IN_FLIGHT = ["QUEUED", "RUNNING"] as ("QUEUED" | "RUNNING")[];

export const prismaExportRepo: ExportRepo = {
  createIfRoom(input, max, since) {
    return prisma.$transaction(async (tx) => {
      // Batas berjalan per user: hitung + buat di bawah lock per user (tanpa balapan antar-permintaan).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`export:${input.userId}`}))`;
      const running = await tx.export.count({
        where: { userId: input.userId, status: { in: IN_FLIGHT }, createdAt: { gt: since } },
      });
      if (running >= max) return null;
      return tx.export.create({
        data: {
          userId: input.userId,
          dashboardId: input.dashboardId,
          widgetId: input.widgetId,
          format: input.format,
          params: input.params,
          fileName: input.fileName,
        },
        select: { id: true },
      });
    });
  },
  async findOwned(userId, id): Promise<ExportRow | null> {
    return prisma.export.findFirst({ where: { id, userId }, select: ROW_SELECT });
  },
  async fail(id, code, message) {
    await prisma.export.updateMany({
      where: { id, status: { in: IN_FLIGHT } },
      data: { status: "FAILED", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
  },
  async widgetTitle(widgetId) {
    const w = await prisma.widget.findUnique({ where: { id: widgetId }, select: { title: true } });
    return w?.title ?? null;
  },
  async dashboardRole(userId, dashboardId) {
    return (await dashboardAccess(userId, dashboardId))?.role ?? null;
  },
  audit: (entry) => recordAudit(prisma, entry),
};

export const prismaExportJobRepo: ExportJobRepo = {
  async load(id) {
    const e = await prisma.export.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        dashboardId: true,
        widgetId: true,
        format: true,
        status: true,
        params: true,
        fileName: true,
        key: true,
      },
    });
    if (!e) return null;
    const w = e.widgetId
      ? await prisma.widget.findUnique({ where: { id: e.widgetId }, select: { title: true } })
      : null;
    return { ...e, title: w?.title ?? null };
  },
  async start(id) {
    const r = await prisma.export.updateMany({
      where: { id, status: { in: IN_FLIGHT } },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    return r.count > 0;
  },
  async finish(id, d) {
    const r = await prisma.export.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        status: "DONE",
        key: d.key,
        rows: d.rows,
        bytes: BigInt(d.bytes),
        finishedAt: d.finishedAt,
        expiresAt: d.expiresAt,
        errorCode: null,
        errorMessage: null,
      },
    });
    return r.count > 0;
  },
  fail: (id, code, message) => prismaExportRepo.fail(id, code, message),
  async exists(id) {
    return (await prisma.export.count({ where: { id } })) > 0;
  },
};

export const prismaExportCleanupRepo: ExportCleanupRepo = {
  async expired(now, limit) {
    const rows = await prisma.export.findMany({
      where: { status: "DONE", deletedAt: null, expiresAt: { lte: now }, key: { not: null } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { id: true, key: true },
    });
    return rows.flatMap((r) => (r.key ? [{ id: r.id, key: r.key }] : []));
  },
  one: (id) =>
    prisma.export.findUnique({
      where: { id },
      select: { key: true, expiresAt: true, deletedAt: true },
    }),
  async markDeleted(ids, at) {
    await prisma.export.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: at },
    });
  },
  async markDeletedByKeys(keys, at) {
    await prisma.export.updateMany({
      where: { key: { in: keys }, deletedAt: null },
      data: { deletedAt: at },
    });
  },
  async liveKeys(keys, now) {
    const rows = await prisma.export.findMany({
      where: { key: { in: keys }, status: "DONE", deletedAt: null, expiresAt: { gt: now } },
      select: { key: true },
    });
    return new Set(rows.flatMap((r) => (r.key ? [r.key] : [])));
  },
  async failStale(before, code, message) {
    const r = await prisma.export.updateMany({
      where: { status: { in: IN_FLIGHT }, createdAt: { lt: before } },
      data: { status: "FAILED", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
    return r.count;
  },
};

export const s3ExportStorage: ExportStorage & ExportCleanupStorage = {
  download: (key, dest, signal) => downloadToFile(key, dest, signal),
  upload: (key, path, contentType, opts) => uploadFile(key, path, contentType, opts),
  remove: (key) => deleteExportObject(key),
  listOlderThan: (before, limit) => listExportObjects(before, limit),
};
