import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import type { ColumnSchema } from "@/features/ingest/infer";
import { matchSheet, remapConfig, type SheetInfo } from "@/features/widgets/remap";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { RETENTION_GRACE_MS, retentionVictims, versionPrefixes } from "./retention";

/*
 * Aktivasi versi dataset (T-013, flow-kerja A4/B5): dipakai ingest yang cocok (finish) dan rollback
 * pemilik. Pemanggil SUDAH memegang lock baris Dataset (SELECT … FOR UPDATE); urutan lock di sini:
 * Dataset → advisory lock dashboard (urut id, kunci sama dengan dashboards/service.ts) → tulis widget/
 * versi. Langkah:
 *  1. Dataset.activeVersionId = versi target.
 *  2. Spec widget dipetakan ke sheet versi target dan DISIMPAN (sebelum retensi menghapus sheet lama).
 *     Kolom yang tidak ketemu: spec dibiarkan, nama kolomnya dicatat di Widget.missingColumns.
 *  3. Retensi: versi yang dibuang dihapus (Sheet ikut kaskade) dan prefix objeknya diantrekan ke
 *     StorageCleanup dengan masa tenggang 1 jam.
 *  4. Rollback (opts.audit): AuditLog "dataset.version.activate".
 * typedKey versi yang dibuang dikembalikan agar pemanggil di proses app bisa membuang salinan lokal
 * (forgetLocalParquet) setelah commit; di worker itu tanpa efek.
 */

type Tx = Prisma.TransactionClient;

export interface ActivateOptions {
  actorId?: string;
  ip?: string;
  audit?: boolean;
}

export async function activateVersionInTx(
  tx: Tx,
  datasetId: string,
  versionId: string,
  opts: ActivateOptions = {},
): Promise<{ deletedTypedKeys: string[] }> {
  const v = await tx.datasetVersion.findFirst({
    where: { id: versionId, datasetId, status: "READY" },
    select: { originalName: true, dataset: { select: { activeVersionId: true } } },
  });
  // Kesalahan pemanggil (versi dataset lain / belum siap): batalkan seluruh transaksi.
  if (!v) throw new Error("versi tidak bisa diaktifkan: bukan versi READY dataset ini");
  await tx.dataset.update({ where: { id: datasetId }, data: { activeVersionId: versionId } });
  await persistWidgets(tx, datasetId, versionId);
  const deletedTypedKeys = await applyRetention(tx, datasetId, versionId);
  if (opts.audit) {
    await recordAudit(tx, {
      actorId: opts.actorId ?? null,
      action: "dataset.version.activate",
      targetType: "dataset",
      targetId: datasetId,
      meta: { from: v.dataset.activeVersionId, to: versionId, fileName: v.originalName },
      ip: opts.ip ?? "unknown",
    });
  }
  return { deletedTypedKeys };
}

export interface StoredWidget {
  id: string;
  type: string;
  spec: unknown;
  missingColumns: string[];
}

/** Sheet lama widget + jumlah sheet di versinya (fallback "satu-satunya sheet" di matchSheet). */
export interface OldSheet extends SheetInfo {
  sheetCount: number;
}

export type WidgetUpdate = { spec?: unknown; missingColumns: string[] };

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Perubahan satu widget saat versi target diaktifkan (murni); null = tidak ada yang ditulis.
 *  - sudah di sheet versi target → missingColumns dikosongkan;
 *  - sheet lama tidak ada lagi → dibiarkan (missingColumns lama tetap menjadi pesan widget);
 *  - sheet lama tidak punya pasangan → spec dibiarkan (SHEET_UNAVAILABLE), missingColumns kosong;
 *  - semua kolom ketemu → spec baru disimpan; ada yang hilang → spec dibiarkan, nama kolom dicatat.
 */
export function planWidget(
  w: StoredWidget,
  target: SheetInfo[],
  old: OldSheet | undefined,
): WidgetUpdate | null {
  const parsed = parseWidgetConfig(w.type, w.spec);
  if (!parsed.ok) return null;
  const config = parsed.config;
  if (config.type === "empty") return null;
  const clear = w.missingColumns.length ? { missingColumns: [] } : null;
  if (target.some((s) => s.id === config.spec.sheetId)) return clear;
  if (!old) return null;
  const to = matchSheet(old, target, old.sheetCount);
  if (!to) return clear;
  const moved = remapConfig(config, old, to);
  if (!moved.missing.length) return { spec: moved.config.spec, missingColumns: [] };
  return sameList(moved.missing, w.missingColumns) ? null : { missingColumns: moved.missing };
}

const schemaOf = (s: unknown) => (s as ColumnSchema[] | null) ?? [];
const sheetIdOf = (w: StoredWidget): string | null => {
  const c = parseWidgetConfig(w.type, w.spec);
  return c.ok && c.config.type !== "empty" ? c.config.spec.sheetId : null;
};

async function persistWidgets(tx: Tx, datasetId: string, versionId: string): Promise<void> {
  const dashboards = await tx.dashboard.findMany({
    where: { datasetId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!dashboards.length) return;
  // Kunci yang sama dengan lockKey("dashboard", id): tambah/hapus widget dan simpan tata letak
  // menunggu sampai aktivasi selesai.
  for (const d of dashboards) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`dashboard:${d.id}`}))`,
    );
  }
  const widgets = await tx.widget.findMany({
    where: { dashboard: { datasetId }, type: { not: "empty" } },
    select: { id: true, type: true, spec: true, missingColumns: true },
  });
  if (!widgets.length) return;
  const target: SheetInfo[] = (
    await tx.sheet.findMany({
      where: { versionId, typedKey: { not: null } },
      orderBy: { index: "asc" },
      select: { id: true, name: true, index: true, schema: true },
    })
  ).map((s) => ({ ...s, schema: schemaOf(s.schema) }));
  const targetIds = new Set(target.map((s) => s.id));
  const oldIds = [
    ...new Set(widgets.flatMap((w) => sheetIdOf(w) ?? []).filter((id) => !targetIds.has(id))),
  ];
  const oldRows = oldIds.length
    ? await tx.sheet.findMany({
        where: { id: { in: oldIds }, version: { datasetId } },
        select: { id: true, name: true, index: true, schema: true, versionId: true },
      })
    : [];
  const counts = oldRows.length
    ? await tx.sheet.groupBy({
        by: ["versionId"],
        where: { versionId: { in: [...new Set(oldRows.map((s) => s.versionId))] } },
        _count: { _all: true },
      })
    : [];
  const countOf = new Map(counts.map((c) => [c.versionId, c._count._all]));
  const olds = new Map(
    oldRows.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        index: s.index,
        schema: schemaOf(s.schema),
        sheetCount: countOf.get(s.versionId) ?? 0,
      },
    ]),
  );
  for (const w of widgets) {
    const change = planWidget(w, target, olds.get(sheetIdOf(w) ?? ""));
    if (!change) continue;
    // updateMany: widget yang terhapus bersamaan (hapus dashboard) tidak menggagalkan aktivasi.
    await tx.widget.updateMany({
      where: { id: w.id },
      data: {
        missingColumns: change.missingColumns,
        ...(change.spec === undefined ? {} : { spec: change.spec as Prisma.InputJsonValue }),
      },
    });
  }
}

async function applyRetention(tx: Tx, datasetId: string, activeId: string): Promise<string[]> {
  const versions = await tx.datasetVersion.findMany({
    where: { datasetId, status: { in: ["READY", "FAILED"] } },
    select: { id: true, status: true, createdAt: true },
  });
  const victims = retentionVictims(versions, activeId);
  if (!victims.length) return [];
  const typed = await tx.sheet.findMany({
    where: { versionId: { in: victims }, typedKey: { not: null } },
    select: { typedKey: true },
  });
  await tx.datasetVersion.deleteMany({
    where: { id: { in: victims }, datasetId, activeFor: { is: null } },
  });
  const notBefore = new Date(Date.now() + RETENTION_GRACE_MS);
  await tx.storageCleanup.createMany({
    data: victims.flatMap((id) =>
      versionPrefixes(datasetId, id).map((prefix) => ({
        prefix,
        reason: "retensi versi",
        notBefore,
      })),
    ),
  });
  return typed.flatMap((s) => (s.typedKey ? [s.typedKey] : []));
}
