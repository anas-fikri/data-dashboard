import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { activateVersionInTx, planWidget, type OldSheet } from "@/features/versions/activation";
import { MISSING_COLUMN, type SheetInfo } from "@/features/widgets/remap";

/*
 * T-013: aktivasi versi — keputusan spec widget (murni) dan urutan di dalam transaksi pemanggil:
 * pointer aktif → lock dashboard (urut id) → simpan spec widget → retensi (hapus versi + antre
 * pembersihan 1 jam) → AuditLog untuk rollback. Transaksi palsu mencatat urutan panggilan.
 */
const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;

const DS = "cmv4klj5r0007oczvgiofocpg";
const A = "cmv4kljx40009oczvdmpurrva";
const B = "cmv4kljx40009oczvdmpurrvb";
const R1 = "cmv4kljx40009oczvdmpurrv1";
const R2 = "cmv4kljx40009oczvdmpurrv2";
const F0 = "cmv4kljx40009oczvdmpurrf0";
const SA = "cmv4kljx40009oczvdmpurrsa";
const SB = "cmv4kljx40009oczvdmpurrsb";
const GONE = "cmv4kljx40009oczvdmpurrzz";

const OLD_SCHEMA = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Diskon", "decimal"),
];
const NEW_SCHEMA = [
  col(1, "Tanggal", "date"),
  col(2, "cabang", "text"),
  col(3, "Omzet", "decimal"),
];
const oldSheet: OldSheet = {
  id: SA,
  name: "Penjualan",
  index: 0,
  schema: OLD_SCHEMA,
  versionId: A,
  sheetCount: 1,
};
const target: SheetInfo[] = [{ id: SB, name: " penjualan ", index: 0, schema: NEW_SCHEMA }];

const fmt = { style: "number", decimals: 0 };
const bar = (sheetId: string) => ({
  sheetId,
  dimension: { column: 1 },
  measure: { agg: "sum", column: 2 },
  sort: "value_desc",
  topN: 12,
  format: fmt,
});
const kpi = (sheetId: string, column: number) => ({
  sheetId,
  measure: { agg: "sum", column },
  format: fmt,
});
const w = (id: string, type: string, spec: unknown, missingColumns: string[] = []) => ({
  id,
  type,
  spec,
  missingColumns,
});

describe("planWidget", () => {
  it("semua kolom ketemu → spec dipetakan ke sheet target dan disimpan (nama, bukan posisi)", () => {
    expect(planWidget(w("w1", "bar", bar(SA)), target, oldSheet)).toEqual({
      spec: { ...bar(SB), dimension: { column: 2 }, measure: { agg: "sum", column: 3 } },
      missingColumns: [],
    });
  });

  it("kolom hilang → spec dibiarkan, nama lama dicatat (tidak ditulis ulang bila sama)", () => {
    expect(planWidget(w("w2", "kpi", kpi(SA, 3)), target, oldSheet)).toEqual({
      missingColumns: ["Diskon"],
    });
    expect(planWidget(w("w2", "kpi", kpi(SA, 3), ["Diskon"]), target, oldSheet)).toBeNull();
  });

  it("R2-CC-1b: kolom hilang + versi sheet lama ikut dibuang retensi → spec pindah ke target, hanya kolom hilang yang ditandai", () => {
    const partly = { ...bar(SA), dimension: { column: 1 }, measure: { agg: "sum", column: 3 } };
    const moved = {
      ...bar(SB),
      dimension: { column: 2 },
      measure: { agg: "sum", column: MISSING_COLUMN },
    };
    // Versi sheet lama dibuang → tidak bisa roll-forward ke sana: spec disimpan dengan penanda.
    expect(planWidget(w("w9", "bar", partly), target, oldSheet, new Set([A]))).toEqual({
      spec: moved,
      missingColumns: ["Diskon"],
    });
    // Versi sheet lama tetap disimpan → spec dibiarkan (roll-forward memulihkannya).
    expect(planWidget(w("w9", "bar", partly), target, oldSheet, new Set(["lain"]))).toEqual({
      missingColumns: ["Diskon"],
    });
  });

  it("spec dengan penanda: nama kolom tersimpan ikut terbawa, tidak pernah 'kolom 16385'", () => {
    const marked = {
      ...bar(SA),
      dimension: { column: 1 },
      measure: { agg: "sum", column: MISSING_COLUMN },
    };
    // Penanda + kolom lain hilang di target: catatan = nama tersimpan + nama kolom yang baru hilang.
    const noCabang: SheetInfo[] = [{ ...target[0]!, schema: [col(1, "Omzet", "decimal")] }];
    expect(planWidget(w("wa", "bar", marked, ["Diskon"]), noCabang, oldSheet)).toEqual({
      missingColumns: ["Cabang", "Diskon"],
    });
    // Roll-forward ke versi spec itu: catatan menyisakan nama penanda saja (bukan "Cabang").
    const back: SheetInfo[] = [{ id: SA, name: "Penjualan", index: 0, schema: OLD_SCHEMA }];
    expect(planWidget(w("wa", "bar", marked, ["Cabang", "Diskon"]), back, undefined)).toEqual({
      missingColumns: ["Diskon"],
    });
    expect(planWidget(w("wa", "bar", marked, ["Diskon"]), back, undefined)).toBeNull();
    // Dipindah karena sheet lama dibuang: penanda tetap, nama tersimpan tetap.
    expect(planWidget(w("wa", "bar", marked, ["Diskon"]), target, oldSheet, new Set([A]))).toEqual({
      spec: {
        ...bar(SB),
        dimension: { column: 2 },
        measure: { agg: "sum", column: MISSING_COLUMN },
      },
      missingColumns: ["Diskon"],
    });
  });

  it("sudah di versi target → catatan kolom hilang dikosongkan; sudah kosong → tidak ada tulis", () => {
    expect(planWidget(w("w3", "kpi", kpi(SB, 3), ["X"]), target, undefined)).toEqual({
      missingColumns: [],
    });
    expect(planWidget(w("w3", "kpi", kpi(SB, 3)), target, undefined)).toBeNull();
  });

  it("sheet lama tidak ada lagi → dibiarkan; tanpa pasangan sheet → spec dibiarkan, catatan kosong", () => {
    expect(planWidget(w("w4", "kpi", kpi(GONE, 2), ["Omzet"]), target, undefined)).toBeNull();
    const other = { ...oldSheet, name: "Retur", sheetCount: 2 };
    expect(planWidget(w("w5", "kpi", kpi(SA, 2), ["Omzet"]), target, other)).toEqual({
      missingColumns: [],
    });
    expect(planWidget(w("w5", "kpi", kpi(SA, 2)), target, other)).toBeNull();
  });

  it("rollback setelah ganti nama di versi baru → kolom lewat judul asli, tidak ada yang hilang", () => {
    // Versi baru: "Omzet" diganti nama tampilnya jadi "Pendapatan", "Cabang"↔"Diskon" ditukar.
    const renamed = { ...col(2, "Pendapatan", "decimal"), original: "Omzet" };
    const swapA = { ...col(1, "Diskon", "text"), original: "Cabang" };
    const swapB = { ...col(3, "Cabang", "decimal"), original: "Diskon" };
    const newer: OldSheet = { ...oldSheet, id: SB, schema: [swapA, renamed, swapB], sheetCount: 1 };
    const older: SheetInfo[] = [{ id: SA, name: "Penjualan", index: 0, schema: OLD_SCHEMA }];
    expect(planWidget(w("w8", "bar", bar(SB)), older, newer)).toEqual({
      spec: bar(SA),
      missingColumns: [],
    });
  });

  it("widget kosong / spec rusak → tidak disentuh", () => {
    expect(planWidget(w("w6", "empty", {}), target, oldSheet)).toBeNull();
    expect(planWidget(w("w7", "bar", { rusak: true }), target, oldSheet)).toBeNull();
  });
});

describe("activateVersionInTx", () => {
  const order: string[] = [];
  const log =
    <T>(label: string, value: T) =>
    async () => {
      order.push(label);
      return value;
    };
  const day = (n: number) => new Date(Date.UTC(2026, 9, n));
  const tx = {
    datasetVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(log("versions.delete", { count: 2 })),
    },
    dataset: { update: vi.fn(log("dataset.update", {})) },
    dashboard: { findMany: vi.fn() },
    $executeRaw: vi.fn(async (q: { values: unknown[] }) => {
      order.push(`lock:${String(q.values[0])}`);
      return 1;
    }),
    widget: {
      findMany: vi.fn(),
      updateMany: vi.fn(async (a: { where: { id: string } }) => {
        order.push(`widget:${a.where.id}`);
        return { count: 1 };
      }),
    },
    sheet: { findMany: vi.fn(), groupBy: vi.fn() },
    storageCleanup: {
      createMany: vi.fn(async (_a: { data: unknown }) => {
        order.push("cleanup");
        return { count: 4 };
      }),
    },
    auditLog: { create: vi.fn(log("audit", {})) },
  };
  const run = (opts?: Parameters<typeof activateVersionInTx>[3]) =>
    activateVersionInTx(tx as never, DS, B, opts);

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    tx.datasetVersion.findFirst.mockResolvedValue({
      originalName: "penjualan-lama.xlsx",
      dataset: { activeVersionId: A },
    });
    tx.dashboard.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    tx.widget.findMany.mockResolvedValue([
      w("w1", "bar", bar(SA)),
      w("w2", "kpi", kpi(SA, 3)),
      w("w4", "kpi", kpi(GONE, 2), ["Omzet"]),
    ]);
    tx.sheet.findMany
      .mockReset()
      .mockResolvedValueOnce(target) // sheet versi target
      .mockResolvedValueOnce([{ ...oldSheet, versionId: A }]) // sheet lama widget
      .mockResolvedValueOnce([{ typedKey: `parquet/${DS}/${R1}/s/typed-1.parquet` }]); // retensi
    tx.sheet.groupBy.mockResolvedValue([{ versionId: A, _count: { _all: 1 } }]);
    tx.datasetVersion.findMany.mockResolvedValue([
      { id: F0, status: "FAILED", createdAt: day(1) },
      { id: R1, status: "READY", createdAt: day(2) },
      { id: R2, status: "READY", createdAt: day(3) },
      { id: A, status: "READY", createdAt: day(4) },
      { id: B, status: "READY", createdAt: day(5) },
    ]);
  });

  it("pointer → lock dashboard urut id → spec widget → hapus versi lama → antre pembersihan", async () => {
    const t0 = Date.now();
    const r = await run();
    expect(r).toEqual({ deletedTypedKeys: [`parquet/${DS}/${R1}/s/typed-1.parquet`] });
    expect(order).toEqual([
      "dataset.update",
      "lock:dashboard:d1",
      "lock:dashboard:d2",
      "widget:w1",
      "widget:w2",
      "versions.delete",
      "cleanup",
    ]);
    expect(tx.dataset.update).toHaveBeenCalledWith({
      where: { id: DS },
      data: { activeVersionId: B },
    });
    expect(tx.dashboard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { datasetId: DS }, orderBy: { id: "asc" } }),
    );
    expect(tx.widget.updateMany).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        missingColumns: [],
        spec: { ...bar(SB), dimension: { column: 2 }, measure: { agg: "sum", column: 3 } },
      },
    });
    expect(tx.widget.updateMany).toHaveBeenCalledWith({
      where: { id: "w2" },
      data: { missingColumns: ["Diskon"] },
    });
    // Versi aktif tidak pernah ikut dihapus (onDelete SetNull mengosongkan dataset).
    expect(tx.datasetVersion.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [F0, R1] }, datasetId: DS, activeFor: { is: null } },
    });
    const rows = tx.storageCleanup.createMany.mock.calls[0]![0].data as {
      prefix: string;
      reason: string;
      notBefore: Date;
    }[];
    expect(rows.map((x) => x.prefix)).toEqual([
      `raw/${DS}/${F0}/`,
      `parquet/${DS}/${F0}/`,
      `raw/${DS}/${R1}/`,
      `parquet/${DS}/${R1}/`,
    ]);
    for (const x of rows) {
      expect(x.reason).toBe("retensi versi");
      expect(x.notBefore.getTime() - t0).toBeGreaterThanOrEqual(60 * 60 * 1000);
    }
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("R2-CC-1b: sheet lama widget di versi yang dibuang retensi → spec disimpan di target dengan penanda sebelum hapus", async () => {
    tx.sheet.findMany
      .mockReset()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce([{ ...oldSheet, versionId: R1 }])
      .mockResolvedValueOnce([]);
    tx.sheet.groupBy.mockResolvedValue([{ versionId: R1, _count: { _all: 1 } }]);
    await run();
    expect(tx.widget.updateMany).toHaveBeenCalledWith({
      where: { id: "w2" },
      data: {
        missingColumns: ["Diskon"],
        spec: { ...kpi(SB, 3), measure: { agg: "sum", column: MISSING_COLUMN } },
      },
    });
    expect(order.indexOf("widget:w2")).toBeLessThan(order.indexOf("versions.delete"));
  });

  it("rollback (audit) → AuditLog dataset.version.activate {from, to, fileName}", async () => {
    await run({ actorId: "owner1", ip: "10.0.0.1", audit: true });
    expect(order.at(-1)).toBe("audit");
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "owner1",
        action: "dataset.version.activate",
        targetType: "dataset",
        targetId: DS,
        meta: { from: A, to: B, fileName: "penjualan-lama.xlsx" },
        ip: "10.0.0.1",
      },
      select: { id: true },
    });
  });

  it("tanpa versi yang perlu dibuang → tidak ada hapus/pembersihan; tanpa dashboard → tanpa lock", async () => {
    tx.dashboard.findMany.mockResolvedValueOnce([]);
    tx.datasetVersion.findMany.mockResolvedValueOnce([
      { id: A, status: "READY", createdAt: day(4) },
      { id: B, status: "READY", createdAt: day(5) },
    ]);
    expect(await run()).toEqual({ deletedTypedKeys: [] });
    expect(order).toEqual(["dataset.update"]);
  });

  it("versi bukan READY milik dataset ini → error (transaksi pemanggil dibatalkan)", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce(null);
    await expect(run()).rejects.toThrow();
    expect(tx.dataset.update).not.toHaveBeenCalled();
  });
});
