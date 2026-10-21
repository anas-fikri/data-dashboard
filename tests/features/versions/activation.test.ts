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

  it("R3-CC-1: spec dengan penanda tanpa pasangan sheet → nama penanda tetap tercatat (bukan dikosongkan)", () => {
    const marked = { ...bar(SA), measure: { agg: "sum", column: MISSING_COLUMN } };
    const other = { ...oldSheet, name: "Retur", sheetCount: 2 };
    // Versi sheet lama tetap disimpan: nama di balik penanda satu-satunya ada di missingColumns.
    expect(planWidget(w("wm", "bar", marked, ["Diskon"]), target, other)).toBeNull();
    // Catatan memuat kolom spec yang masih ada di sheet lama ("Cabang") → hanya nama penanda tersisa.
    expect(planWidget(w("wm", "bar", marked, ["Cabang", "Diskon"]), target, other)).toEqual({
      missingColumns: ["Diskon"],
    });
    // Versi sheet lama ikut dibuang: sheet hilang (SHEET_UNAVAILABLE), catatan dikosongkan.
    expect(planWidget(w("wm", "bar", marked, ["Diskon"]), target, other, new Set([A]))).toEqual({
      missingColumns: [],
    });
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

  it("T-033 (R5-1): nama akar dipakai ulang (alias ganda) → tebakan null; sheetMap ingest 'Ganti semua' memasang widget", () => {
    const SC = "cmv4kljx40009oczvdmpurrsc";
    const sales: OldSheet = {
      id: SA,
      name: "Sales",
      aliasName: "Penjualan",
      index: 0,
      schema: OLD_SCHEMA,
      versionId: A,
      sheetCount: 2,
    };
    const next: SheetInfo[] = [
      // "Penjualan" = sheet "Sales" yang kembali ke nama akarnya (planSheets memasangkannya lewat
      // alias); "Sales 2026" sheet lain yang juga membawa alias "Penjualan" → tebakan nama ambigu.
      { id: SB, name: "Penjualan", index: 0, schema: OLD_SCHEMA },
      { id: SC, name: "Sales 2026", aliasName: "Penjualan", index: 1, schema: OLD_SCHEMA },
    ];
    expect(planWidget(w("w1", "bar", bar(SA)), next, sales)).toBeNull();
    expect(planWidget(w("w1", "bar", bar(SA)), next, sales, new Set(), { [SA]: SB })).toEqual({
      spec: bar(SB),
      missingColumns: [],
    });
  });

  it("T-014 sheetMap: sheet ganti nama di dataset multi-sheet → widget ikut pasangan pemetaan", () => {
    const multi = { ...oldSheet, sheetCount: 2 };
    const renamed: SheetInfo[] = [
      { ...target[0]!, name: "Sales" },
      { id: "cmv4kljx40009oczvdmpurrsc", name: "Retur", index: 1, schema: OLD_SCHEMA },
    ];
    // Tanpa peta: nama tidak cocok dan lebih dari satu sheet → spec dibiarkan di sheet lama.
    expect(planWidget(w("w1", "bar", bar(SA)), renamed, multi)).toBeNull();
    expect(planWidget(w("w1", "bar", bar(SA)), renamed, multi, new Set(), { [SA]: SB })).toEqual({
      spec: { ...bar(SB), dimension: { column: 2 }, measure: { agg: "sum", column: 3 } },
      missingColumns: [],
    });
  });

  it("T-014 alias: rollback dan roll-forward setelah sheet ganti nama dipetakan (multi-sheet)", () => {
    const RETUR_OLD = "cmv4kljx40009oczvdmpurrsc";
    const RETUR_NEW = "cmv4kljx40009oczvdmpurrsd";
    // V2 (dipetakan): sheet "Sales" = pasangan "Penjualan" (alias), "Retur" tetap.
    const sales: OldSheet = {
      id: SB,
      name: "Sales",
      aliasName: "Penjualan",
      index: 0,
      schema: NEW_SCHEMA,
      versionId: B,
      sheetCount: 2,
    };
    const v1: SheetInfo[] = [
      { id: SA, name: "Penjualan", index: 0, schema: OLD_SCHEMA },
      { id: RETUR_OLD, name: "Retur", index: 1, schema: OLD_SCHEMA },
    ];
    // Rollback ke V1: widget di V2.Sales kembali ke V1.Penjualan (alias sheet lama = nama target).
    const onSales = { ...bar(SB), dimension: { column: 2 }, measure: { agg: "sum", column: 3 } };
    expect(planWidget(w("w1", "bar", onSales), v1, sales)).toEqual({
      spec: bar(SA),
      missingColumns: [],
    });
    // Roll-forward ke V2: widget di V1.Penjualan ke V2.Sales (nama sheet lama = alias target).
    const v2: SheetInfo[] = [
      { id: SB, name: "Sales", aliasName: "Penjualan", index: 0, schema: NEW_SCHEMA },
      { id: RETUR_NEW, name: "Retur", index: 1, schema: OLD_SCHEMA },
    ];
    const penjualan: OldSheet = { ...oldSheet, sheetCount: 2 };
    expect(planWidget(w("w2", "kpi", kpi(SA, 2)), v2, penjualan)).toEqual({
      spec: kpi(SB, 3),
      missingColumns: [],
    });
    // Sheet lain tetap lewat nama; alias tidak pernah mengalahkan nama yang sama.
    const retur: OldSheet = { ...penjualan, id: RETUR_OLD, name: "Retur" };
    expect(planWidget(w("w3", "kpi", kpi(RETUR_OLD, 2)), v2, retur)).toEqual({
      spec: kpi(RETUR_NEW, 2),
      missingColumns: [],
    });
  });

  it("R2-UI-4: dua ganti nama dipetakan berturut-turut (V1 → V2 → V3) → rollback ke V1/V2 dan roll-forward", () => {
    const SC = "cmv4kljx40009oczvdmpurrse";
    const C = "cmv4kljx40009oczvdmpurrvc";
    const retur = (id: string) => ({ id, name: "Retur", index: 1, schema: OLD_SCHEMA });
    const v1: SheetInfo[] = [
      { id: SA, name: "Penjualan", index: 0, schema: OLD_SCHEMA },
      retur("cmv4kljx40009oczvdmpurrr1"),
    ];
    // Alias V2 dan V3 sama-sama akar silsilah ("Penjualan"), bukan nama versi sebelumnya.
    const v2: SheetInfo[] = [
      { id: SB, name: "Sales", aliasName: "Penjualan", index: 0, schema: NEW_SCHEMA },
      retur("cmv4kljx40009oczvdmpurrr2"),
    ];
    const v3: SheetInfo[] = [
      { id: SC, name: "Revenue", aliasName: "Penjualan", index: 0, schema: NEW_SCHEMA },
      retur("cmv4kljx40009oczvdmpurrr3"),
    ];
    const onV3: OldSheet = { ...v3[0]!, versionId: C, sheetCount: 2 };
    // Rollback V3 → V1 (lompat dua versi) dan V3 → V2.
    expect(planWidget(w("w1", "kpi", kpi(SC, 3)), v1, onV3)).toEqual({
      spec: kpi(SA, 2),
      missingColumns: [],
    });
    expect(planWidget(w("w1", "kpi", kpi(SC, 3)), v2, onV3)).toEqual({
      spec: kpi(SB, 3),
      missingColumns: [],
    });
    // Roll-forward V1 → V3 dan V2 → V3.
    const onV1: OldSheet = { ...v1[0]!, versionId: A, sheetCount: 2 };
    expect(planWidget(w("w2", "kpi", kpi(SA, 2)), v3, onV1)).toEqual({
      spec: kpi(SC, 3),
      missingColumns: [],
    });
    const onV2: OldSheet = { ...v2[0]!, versionId: B, sheetCount: 2 };
    expect(planWidget(w("w3", "kpi", kpi(SB, 3)), v3, onV2)).toEqual({
      spec: kpi(SC, 3),
      missingColumns: [],
    });
  });

  it("T-014 kolom kosong (absent, pos > kolom file) di target → widget pindah lewat judul asli, tanpa penanda", () => {
    const withAbsent: SheetInfo[] = [
      { ...target[0]!, schema: [...NEW_SCHEMA, { ...col(4, "Diskon", "decimal"), absent: true }] },
    ];
    expect(planWidget(w("w2", "kpi", kpi(SA, 3)), withAbsent, oldSheet)).toEqual({
      spec: kpi(SB, 4),
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
    // Pivot tersimpan (T-072): dipetakan dengan aturan widget pivot, revisi naik.
    savedPivot: {
      findMany: vi.fn(async (): Promise<unknown[]> => []),
      updateMany: vi.fn(async (a: { where: { id: string } }) => {
        order.push(`savedPivot:${a.where.id}`);
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
    // T-073: widget terikat pivot tersimpan (spec = tampilan) tidak dipetakan; pivot tersimpannya yang dipetakan.
    expect(tx.widget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dashboard: { datasetId: DS }, type: { not: "empty" }, savedPivotId: null },
      }),
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

  it("T-014: sheetMap diteruskan ke rencana widget (sheet ganti nama ikut dipindah)", async () => {
    tx.sheet.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...target[0]!, name: "Sales" }])
      .mockResolvedValueOnce([{ ...oldSheet, versionId: A }])
      .mockResolvedValueOnce([]);
    tx.sheet.groupBy.mockResolvedValue([{ versionId: A, _count: { _all: 2 } }]);
    await run({ sheetMap: { [SA]: SB } });
    expect(tx.widget.updateMany).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        missingColumns: [],
        spec: { ...bar(SB), dimension: { column: 2 }, measure: { agg: "sum", column: 3 } },
      },
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
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

  it("versi bukan READY milik dataset ini (mis. AWAITING_CONFIRM) → error; widget dan pivot tersimpan tidak disentuh", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce(null);
    await expect(run()).rejects.toThrow();
    expect(tx.dataset.update).not.toHaveBeenCalled();
    expect(tx.savedPivot.findMany).not.toHaveBeenCalled();
    expect(tx.savedPivot.updateMany).not.toHaveBeenCalled();
  });

  it("T-072: pivot tersimpan dipetakan dengan aturan widget pivot sesudah widget, sebelum retensi; revisi naik", async () => {
    const pv = {
      sheetId: SA,
      rows: [{ column: 1 }],
      values: [
        { agg: "sum", column: 2 },
        {
          kind: "calc",
          label: "Bersih",
          expr: {
            op: "sub",
            args: [
              { agg: "sum", column: 2 },
              { agg: "sum", column: 3 },
            ],
          },
        },
      ],
      sort: "value_desc",
      format: fmt,
      totals: true,
      subtotals: false,
      filters: [{ column: 1, op: "in", values: ["Jakarta"] }],
    };
    const ok = { ...pv, values: [pv.values[0]] };
    tx.savedPivot.findMany.mockResolvedValueOnce([
      { id: "p1", spec: ok, missingColumns: [] },
      { id: "p2", spec: pv, missingColumns: [] },
      { id: "p3", spec: { rusak: true }, missingColumns: [] },
    ]);
    await run();
    expect(tx.savedPivot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { datasetId: DS } }),
    );
    expect(order).toEqual([
      "dataset.update",
      "lock:dashboard:d1",
      "lock:dashboard:d2",
      "widget:w1",
      "widget:w2",
      "savedPivot:p1",
      "savedPivot:p2",
      "versions.delete",
      "cleanup",
    ]);
    // Semua kolom ketemu → spec di sheet target (baris, nilai, Saring ikut dipetakan).
    expect(tx.savedPivot.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", datasetId: DS },
      data: {
        missingColumns: [],
        spec: {
          ...ok,
          sheetId: SB,
          rows: [{ column: 2 }],
          values: [{ agg: "sum", column: 3 }],
          filters: [{ column: 2, op: "in", values: ["Jakarta"] }],
        },
        revision: { increment: 1 },
      },
    });
    // Kolom di field terhitung hilang → nama dicatat, spec dibiarkan (roll-forward memulihkannya).
    expect(tx.savedPivot.updateMany).toHaveBeenCalledWith({
      where: { id: "p2", datasetId: DS },
      data: { missingColumns: ["Diskon"], revision: { increment: 1 } },
    });
  });

  it("T-072: tanpa dashboard → pivot tersimpan tetap dipetakan (tanpa lock dashboard)", async () => {
    tx.dashboard.findMany.mockResolvedValueOnce([]);
    tx.savedPivot.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        spec: {
          sheetId: SA,
          rows: [{ column: 1 }],
          values: [{ agg: "count" }],
          sort: "value_desc",
          format: fmt,
          totals: false,
          subtotals: false,
        },
        missingColumns: [],
      },
    ]);
    await run();
    expect(tx.widget.findMany).not.toHaveBeenCalled();
    expect(order.some((o) => o.startsWith("lock:"))).toBe(false);
    expect(order).toContain("savedPivot:p1");
  });
});
