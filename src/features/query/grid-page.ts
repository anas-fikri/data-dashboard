import "server-only";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isoDay, periodLabel, type PeriodGrain } from "@/features/ingest/period";
import { canEditWhere } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import { PREVIEW_STATUSES } from "./grid-service";

/*
 * Data halaman "Lihat data" /datasets/:id/data (T-043): pemilik dataset atau editor salah satu
 * dashboard-nya; selain itu null (404, D2). Hanya versi aktif; tab sheet cukup id/indeks/nama, skema
 * hanya untuk sheet yang dibuka. Kolom yang disembunyikan di skema tidak dikirim ke klien (endpoint
 * baris juga menolaknya, G-6 §3.4). Pengecualian (T-054, "Lihat isi file"): ?version= = versi
 * unggahan periode yang menunggu konfirmasi, hanya untuk pemilik (editor → 404); endpoint grid
 * mengizinkan versi itu lewat PREVIEW_STATUSES.
 */

export interface GridPageColumn {
  pos: number;
  name: string;
  original: string;
  type: ColumnSchema["type"];
}

/** Satu pilihan pemilih periode (T-058): kunci, label ("Maret 2026"), baris di metadata segmen. */
export interface GridPagePeriod {
  key: string;
  label: string;
  /** Baris data periode ini di sheet (SegmentTyped.dataRows); null = belum diukur. */
  rows: number | null;
}

export interface GridPageView {
  datasetId: string;
  datasetName: string;
  role: "OWNER" | "EDITOR";
  version: { id: string; fileName: string | null } | null;
  /**
   * Pratinjau versi tertunda (T-054): null = versi aktif; "pending" = versi tertunda dibuka; "gone" =
   * versi yang diminta tidak lagi menunggu konfirmasi (diterapkan/dibatalkan/kedaluwarsa).
   */
  preview: "pending" | "gone" | null;
  tabs: { index: number; name: string }[];
  sheet: {
    id: string;
    index: number;
    name: string;
    schemaRevision: number;
    /** null = skema/typed belum siap. */
    columns: GridPageColumn[] | null;
    /** Sheet periode (T-058): periode di manifest, urut kronologis; null = sheet non-periode. */
    periods: GridPagePeriod[] | null;
  } | null;
}

/** Periode manifest sheet, urut awal periode (satu segmen per periode per sheet). */
export function sheetPeriods(
  grain: PeriodGrain | null,
  source: string | null,
  segs: { key: string | null; start: Date | null; rows: number | null }[],
): GridPagePeriod[] | null {
  if (!grain || !source) return null;
  const out = new Map<string, GridPagePeriod & { start: string }>();
  for (const g of segs) {
    const start = isoDay(g.start);
    if (!g.key || !start) continue;
    const e = out.get(g.key);
    if (e) e.rows = e.rows === null || g.rows === null ? null : e.rows + g.rows;
    else out.set(g.key, { key: g.key, start, label: periodLabel(grain, start), rows: g.rows });
  }
  return [...out.values()]
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map(({ start: _s, ...p }) => p);
}

export function visibleColumns(schema: unknown): GridPageColumn[] | null {
  if (!Array.isArray(schema)) return null;
  return (schema as ColumnSchema[])
    .filter((c) => !c.hidden)
    .map((c) => ({ pos: c.pos, name: c.name, original: c.original, type: c.type }));
}

/**
 * `sheet`: indeks tab (?sheet=) atau id sheet versi aktif (?sheetId=, tautan "Buka di Lihat data" dari
 * widget tabel, T-047); tidak dikenal → sheet pertama.
 */
export async function gridPageView(
  userId: string,
  datasetId: string,
  sheet: number | string | null,
  previewVersionId: string | null = null,
): Promise<GridPageView | null> {
  const ds = await prisma.dataset.findUnique({
    where: { id: datasetId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      activeVersion: {
        select: {
          id: true,
          originalName: true,
          sheets: { orderBy: { index: "asc" }, select: { id: true, index: true, name: true } },
        },
      },
    },
  });
  if (!ds) return null;
  let role: GridPageView["role"] | null = ds.ownerId === userId ? "OWNER" : null;
  if (!role) {
    const d = await prisma.dashboard.findFirst({
      where: { datasetId: ds.id, ...canEditWhere(userId) },
      select: { id: true },
    });
    role = d ? "EDITOR" : null;
  }
  if (!role) return null;
  let v = ds.activeVersion;
  let preview: GridPageView["preview"] = null;
  if (previewVersionId !== null) {
    if (role !== "OWNER") return null;
    const pv = await prisma.datasetVersion.findFirst({
      where: { id: previewVersionId, datasetId: ds.id },
      select: {
        id: true,
        status: true,
        originalName: true,
        sheets: { orderBy: { index: "asc" }, select: { id: true, index: true, name: true } },
      },
    });
    preview = pv && PREVIEW_STATUSES.includes(pv.status) ? "pending" : "gone";
    v = pv && preview === "pending" ? pv : null;
  }
  const tabs = v?.sheets ?? [];
  const chosen =
    tabs.find((t) => (typeof sheet === "string" ? t.id === sheet : t.index === sheet)) ?? tabs[0];
  const s = chosen
    ? await prisma.sheet.findFirst({
        where: { id: chosen.id, versionId: v!.id },
        select: {
          id: true,
          index: true,
          name: true,
          schemaRevision: true,
          schema: true,
          typedKey: true,
          periodSource: true,
          version: { select: { periodGrain: true } },
          segments: {
            select: {
              segmentTyped: {
                select: {
                  dataRows: true,
                  segment: { select: { periodKey: true, periodStart: true } },
                },
              },
            },
          },
        },
      })
    : null;
  return {
    datasetId: ds.id,
    datasetName: ds.name,
    role,
    version: v ? { id: v.id, fileName: v.originalName } : null,
    preview,
    tabs: tabs.map((t) => ({ index: t.index, name: t.name })),
    sheet: s
      ? {
          id: s.id,
          index: s.index,
          name: s.name,
          schemaRevision: s.schemaRevision,
          columns: s.typedKey ? visibleColumns(s.schema) : null,
          periods: sheetPeriods(
            s.version.periodGrain,
            s.periodSource,
            s.segments.map(({ segmentTyped: t }) => ({
              key: t.segment.periodKey,
              start: t.segment.periodStart,
              rows: t.dataRows,
            })),
          ),
        }
      : null,
  };
}
