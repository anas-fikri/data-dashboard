import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import type { ColumnSchema } from "@/features/ingest/infer";
import { markerNames, matchSheet, remapConfig, type SheetInfo } from "@/features/widgets/remap";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { RETENTION_GRACE_MS, retentionVictims, versionPrefixes } from "./retention";

/*
 * Aktivasi versi dataset (T-013, flow-kerja A4/B5): dipakai ingest yang cocok (finish) dan rollback
 * pemilik. Pemanggil SUDAH memegang lock baris Dataset (SELECT … FOR UPDATE); urutan lock di sini:
 * Dataset → advisory lock dashboard (urut id, kunci sama dengan dashboards/service.ts) → tulis widget/
 * versi. Langkah:
 *  1. Dataset.activeVersionId = versi target.
 *  2. Versi yang dibuang retensi ditentukan dulu, lalu spec widget dipetakan ke sheet versi target dan
 *     DISIMPAN (sebelum retensi menghapus sheet lama). Kolom yang tidak ketemu: nama kolomnya dicatat di
 *     Widget.missingColumns; spec dibiarkan di sheet lama (roll-forward memulihkannya), kecuali sheet
 *     lama ikut dibuang — spec dipindah dengan penanda MISSING_COLUMN untuk kolom itu saja.
 *  3. Retensi: versi yang dibuang dihapus (Sheet ikut kaskade) dan prefix objeknya diantrekan ke
 *     StorageCleanup dengan masa tenggang 1 jam.
 *  4. Rollback (opts.audit): AuditLog "dataset.version.activate".
 * Pemetaan kolom (T-014) memberi `sheetMap` (sheet lama → sheet versi target) agar widget ikut sheet
 * yang ganti nama; AuditLog-nya dicatat pemanggil ("dataset.version.map"). Akar silsilah nama sheet
 * itu juga tersimpan sebagai Sheet.aliasName sehingga rollback/roll-forward berikutnya, juga lintas
 * beberapa ganti nama, tetap menemukan sheet-nya (matchSheet: alias ↔ nama dan alias ↔ alias).
 * typedKey versi yang dibuang dikembalikan agar pemanggil di proses app bisa membuang salinan lokal
 * (forgetLocalParquet) setelah commit; di worker itu tanpa efek.
 */

type Tx = Prisma.TransactionClient;

export interface ActivateOptions {
  actorId?: string;
  ip?: string;
  audit?: boolean;
  /** Id sheet lama → id sheet versi target (pasangan pemetaan, T-014); didahulukan dari matchSheet. */
  sheetMap?: Record<string, string>;
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
  const victims = await retentionOf(tx, datasetId, versionId);
  await persistWidgets(tx, datasetId, versionId, new Set(victims), opts.sheetMap);
  const deletedTypedKeys = await applyRetention(tx, datasetId, victims);
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

/** Sheet lama widget + versinya + jumlah sheet di versi itu (fallback "satu-satunya sheet" di matchSheet). */
export interface OldSheet extends SheetInfo {
  versionId: string;
  sheetCount: number;
}

export type WidgetUpdate = { spec?: unknown; missingColumns: string[] };

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Perubahan satu widget saat versi target diaktifkan (murni); null = tidak ada yang ditulis.
 * `victims` = id versi yang dibuang retensi aktivasi ini.
 *  - sudah di sheet versi target → missingColumns hanya menyisakan nama penanda MISSING_COLUMN spec;
 *  - sheet lama tidak ada lagi → dibiarkan (missingColumns lama tetap menjadi pesan widget);
 *  - sheet lama tidak punya pasangan → spec dibiarkan (SHEET_UNAVAILABLE); missingColumns hanya
 *    menyisakan nama penanda MISSING_COLUMN spec (satu-satunya tempat nama itu tersimpan — R3-CC-1),
 *    kosong bila versi sheet lama ikut dibuang (sheet hilang: SHEET_UNAVAILABLE lebih tepat);
 *  - semua kolom ketemu → spec baru disimpan; ada yang hilang → nama kolom dicatat, spec dibiarkan
 *    (roll-forward ke versi lama memulihkannya) kecuali versi sheet lama ikut dibuang: spec disimpan di
 *    sheet target dengan penanda untuk kolom yang hilang saja (panel dan kartu sepakat).
 * `sheetMap` (pemetaan T-014): pasangan eksplisit sheet lama → sheet target, dipakai sebelum matchSheet.
 */
export function planWidget(
  w: StoredWidget,
  target: SheetInfo[],
  old: OldSheet | undefined,
  victims: ReadonlySet<string> = new Set(),
  sheetMap: Record<string, string> = {},
): WidgetUpdate | null {
  const parsed = parseWidgetConfig(w.type, w.spec);
  if (!parsed.ok) return null;
  const config = parsed.config;
  if (config.type === "empty") return null;
  const record = (names: string[]) =>
    sameList(names, w.missingColumns) ? null : { missingColumns: names };
  const here = target.find((s) => s.id === config.spec.sheetId);
  if (here) return record(markerNames(config, here.schema, w.missingColumns));
  if (!old) return null;
  const mapped = Object.hasOwn(sheetMap, old.id) ? sheetMap[old.id] : undefined;
  const to = target.find((s) => s.id === mapped) ?? matchSheet(old, target, old.sheetCount);
  const gone = victims.has(old.versionId);
  if (!to) return record(gone ? [] : markerNames(config, old.schema, w.missingColumns));
  const moved = remapConfig(config, old, to, w.missingColumns);
  if (!moved.missing.length) return { spec: moved.config.spec, missingColumns: [] };
  if (gone) return { spec: moved.config.spec, missingColumns: moved.missing };
  return record(moved.missing);
}

const schemaOf = (s: unknown) => (s as ColumnSchema[] | null) ?? [];
const sheetIdOf = (w: StoredWidget): string | null => {
  const c = parseWidgetConfig(w.type, w.spec);
  return c.ok && c.config.type !== "empty" ? c.config.spec.sheetId : null;
};

async function persistWidgets(
  tx: Tx,
  datasetId: string,
  versionId: string,
  victims: ReadonlySet<string>,
  sheetMap?: Record<string, string>,
): Promise<void> {
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
      select: { id: true, name: true, aliasName: true, index: true, schema: true },
    })
  ).map((s) => ({ ...s, schema: schemaOf(s.schema) }));
  const targetIds = new Set(target.map((s) => s.id));
  const oldIds = [
    ...new Set(widgets.flatMap((w) => sheetIdOf(w) ?? []).filter((id) => !targetIds.has(id))),
  ];
  const oldRows = oldIds.length
    ? await tx.sheet.findMany({
        where: { id: { in: oldIds }, version: { datasetId } },
        select: {
          id: true,
          name: true,
          aliasName: true,
          index: true,
          schema: true,
          versionId: true,
        },
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
        aliasName: s.aliasName,
        index: s.index,
        schema: schemaOf(s.schema),
        versionId: s.versionId,
        sheetCount: countOf.get(s.versionId) ?? 0,
      },
    ]),
  );
  for (const w of widgets) {
    const change = planWidget(w, target, olds.get(sheetIdOf(w) ?? ""), victims, sheetMap);
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

/** Id versi yang dibuang retensi bila versi ini aktif. */
async function retentionOf(tx: Tx, datasetId: string, activeId: string): Promise<string[]> {
  const versions = await tx.datasetVersion.findMany({
    where: { datasetId, status: { in: ["READY", "FAILED"] } },
    select: { id: true, status: true, createdAt: true },
  });
  return retentionVictims(versions, activeId);
}

async function applyRetention(tx: Tx, datasetId: string, victims: string[]): Promise<string[]> {
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
