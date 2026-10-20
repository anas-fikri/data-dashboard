import "server-only";
import type { ColumnSchema } from "@/features/ingest/infer";
import { canEditWhere } from "@/features/sharing/access";
import { prisma } from "@/lib/db";

/*
 * Data halaman "Lihat data" /datasets/:id/data (T-043): pemilik dataset atau editor salah satu
 * dashboard-nya; selain itu null (404, D2). Hanya versi aktif; tab sheet cukup id/indeks/nama, skema
 * hanya untuk sheet yang dibuka. Kolom yang disembunyikan di skema tidak dikirim ke klien (endpoint
 * baris juga menolaknya, G-6 §3.4).
 */

export interface GridPageColumn {
  pos: number;
  name: string;
  original: string;
  type: ColumnSchema["type"];
}

export interface GridPageView {
  datasetId: string;
  datasetName: string;
  role: "OWNER" | "EDITOR";
  version: { id: string; fileName: string | null } | null;
  tabs: { index: number; name: string }[];
  sheet: {
    id: string;
    index: number;
    name: string;
    schemaRevision: number;
    /** null = skema/typed belum siap. */
    columns: GridPageColumn[] | null;
  } | null;
}

export function visibleColumns(schema: unknown): GridPageColumn[] | null {
  if (!Array.isArray(schema)) return null;
  return (schema as ColumnSchema[])
    .filter((c) => !c.hidden)
    .map((c) => ({ pos: c.pos, name: c.name, original: c.original, type: c.type }));
}

export async function gridPageView(
  userId: string,
  datasetId: string,
  sheetIndex: number | null,
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
  const v = ds.activeVersion;
  const tabs = v?.sheets ?? [];
  const chosen = tabs.find((t) => t.index === sheetIndex) ?? tabs[0];
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
        },
      })
    : null;
  return {
    datasetId: ds.id,
    datasetName: ds.name,
    role,
    version: v ? { id: v.id, fileName: v.originalName } : null,
    tabs: tabs.map((t) => ({ index: t.index, name: t.name })),
    sheet: s
      ? {
          id: s.id,
          index: s.index,
          name: s.name,
          schemaRevision: s.schemaRevision,
          columns: s.typedKey ? visibleColumns(s.schema) : null,
        }
      : null,
  };
}
