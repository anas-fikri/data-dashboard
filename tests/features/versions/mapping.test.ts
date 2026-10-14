import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { ActiveSheet } from "@/features/ingest/refresh";
import type { FreshSheet } from "@/features/versions/mapping";

/*
 * T-014 sisi app: tampilan pemetaan (isu dihitung ulang dari Sheet versi + skema aktif terkini, contoh
 * nilai dari pratinjau, % cast tepat/perkiraan), simpan pemetaan (kode NOT_FOUND/INVALID/STALE/
 * DATASET_BUSY/RATE_LIMITED, validasi asli validateMapping) dan status job untuk polling. Prisma +
 * antrean dimock.
 */
const tx = {
  $queryRaw: vi.fn(),
  datasetVersion: { findFirst: vi.fn() },
  sheet: { findMany: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dataset: { findFirst: vi.fn(), count: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const mappingInFlight = vi.fn();
const enqueueMapping = vi.fn();
vi.mock("@/lib/queue/versions", () => ({ mappingInFlight, enqueueMapping }));
const getJob = vi.fn();
vi.mock("@/lib/queue/connection", () => ({
  MAP_VERSION_JOB: "map-version",
  mappingQueue: () => ({ getJob }),
  withQueueTimeout: <T>(p: Promise<T>) => p,
}));

const m = await import("@/features/versions/mapping");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const ACTIVE_V = "cmv4kljx40009oczvdmpurrva";
const V = "cmv4kljx40009oczvdmpurrvb";
const AS1 = "cmv4kljx40009oczvdmpurrs1";
const AS2 = "cmv4kljx40009oczvdmpurrs2";
const FS1 = "cmv4kljx40009oczvdmpurrf1";
const FS2 = "cmv4kljx40009oczvdmpurrf2";

const col = (
  pos: number,
  name: string,
  type: ColumnSchema["type"],
  over: Partial<ColumnSchema> = {},
): ColumnSchema => ({
  pos,
  name,
  original: name,
  type,
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
  ...over,
});

const activeData: ActiveSheet = {
  id: AS1,
  name: "Data",
  index: 0,
  headerRow: 1,
  schemaRevision: 2,
  schema: [
    col(1, "Kode", "text"),
    col(2, "Cabang", "text"),
    col(3, "Nilai", "decimal", { numberLocale: "id" }),
    col(4, "Rahasia", "text", { hidden: true }),
    col(5, "Diskon", "decimal", { absent: true }),
  ],
};

/** File baru: "Cabang" berganti nama jadi "Kantor", "Rahasia" (tersembunyi) hilang, "Catatan" baru. */
const freshData: FreshSheet = {
  id: FS1,
  index: 0,
  name: "Data",
  headerRow: 1,
  rawRows: 11,
  columns: [
    { pos: 1, name: "Kode", original: "Kode" },
    { pos: 2, name: "Kantor", original: "Kantor" },
    { pos: 3, name: "Nilai", original: "Nilai" },
    { pos: 4, name: "Catatan", original: "Catatan" },
  ],
  schema: [
    col(1, "Kode", "text", { nonEmpty: 10 }),
    col(2, "Kantor", "text", { hidden: true, nonEmpty: 10 }),
    col(3, "Nilai", "decimal", { numberLocale: "id", castFailCount: 1, nonEmpty: 10 }),
    col(4, "Catatan", "text", { hidden: true, nonEmpty: 1 }),
  ],
  preview: {
    colCount: 4,
    rows: [
      { row: 1, cells: ["Kode", "Kantor", "Nilai", "Catatan"] },
      { row: 2, cells: ["A1", "Jakarta", "10", null] },
      { row: 3, cells: ["A2", "Jakarta", "x", " "] },
      { row: 4, cells: ["A3", "Bandung", "5", "ok"] },
      { row: 5, cells: ["A4", "Surabaya", "7", null] },
      { row: 6, cells: ["A5", "Medan", "1", null] },
    ],
  },
};

describe("mappingSheets (murni)", () => {
  it("kolom ganti nama → hilang + kolom baru tambahan; tersembunyi dan kosong (absent) tidak ditanya", () => {
    const [s, ...rest] = m.mappingSheets([activeData], [freshData]);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      active: { id: AS1, name: "Data", schemaRevision: 2 },
      target: { id: FS1, name: "Data" },
      candidates: [],
      autoMatched: [
        { activePos: 1, newPos: 1 },
        { activePos: 3, newPos: 3 },
      ],
      missing: [2],
      extra: [2, 4],
    });
    expect(s!.active.columns.map((c) => [c.pos, c.hidden, c.absent])).toEqual([
      [1, false, false],
      [2, false, false],
      [3, false, false],
      [4, true, false],
      [5, false, true],
    ]);
  });

  it("contoh nilai: baris di bawah header, unik, tanpa sel kosong, paling banyak 3", () => {
    const [s] = m.mappingSheets([activeData], [freshData]);
    const byPos = new Map(s!.newColumns.map((c) => [c.pos, c]));
    expect(byPos.get(2)).toEqual({
      pos: 2,
      original: "Kantor",
      name: "Kantor",
      type: "text",
      castFailCount: 0,
      nonEmpty: 10,
      samples: ["Jakarta", "Bandung", "Surabaya"],
    });
    expect(byPos.get(4)!.samples).toEqual(["ok"]);
  });

  it("cast < 98 %: persen tepat dari nonEmpty, dibulatkan ke bawah, dengan label tipe", () => {
    const [s] = m.mappingSheets([activeData], [freshData]);
    expect(s!.lowCast).toEqual([
      {
        pos: 3,
        activePos: 3,
        pct: 0.9,
        typeLabel: "Angka desimal (format 1.234,56)",
        approx: false,
      },
    ]);
  });

  it("skema lama tanpa nonEmpty: n diperkirakan dari nullPct × baris data (bukan crash)", () => {
    // rawRows 11, 1 baris tersimpan di/atas header → 10 baris data; nullPct 0,5 → n ≈ 5; gagal 2 → 60 %.
    const s = col(3, "Nilai", "decimal", { nullPct: 0.5, castFailCount: 2 });
    expect(m.lowCastOf(s, 10)).toEqual({
      pct: 0.6,
      typeLabel: "Angka desimal (format 1,234.56)",
      approx: true,
    });
    // 97,9 % tetap di bawah 98 % dan tampil 97 %.
    expect(
      m.lowCastOf(col(3, "N", "integer", { nonEmpty: 1000, castFailCount: 21 }), 0),
    ).toMatchObject({ pct: 0.97 });
    expect(m.lowCastOf(col(3, "N", "integer", { nonEmpty: 100, castFailCount: 2 }), 0)).toBeNull();
    expect(m.lowCastOf(col(3, "N", "text", { nonEmpty: 10, castFailCount: 9 }), 0)).toBeNull();
    expect(m.lowCastOf(col(3, "N", "date", { nonEmpty: 0 }), 0)).toBeNull();
  });

  it("sheet tanpa masalah tidak ditampilkan", () => {
    const clean: FreshSheet = {
      ...freshData,
      columns: freshData.columns.map((c) => (c.pos === 2 ? { ...c, original: "Cabang" } : c)),
      schema: freshData.schema!.map((c) => (c.pos === 3 ? { ...c, castFailCount: 0 } : c)),
    };
    expect(m.mappingSheets([activeData], [clean])).toEqual([]);
  });

  it("sheet aktif tidak ada di file baru → target null, kandidat = sheet baru tanpa pasangan + rencananya", () => {
    const ringkas: ActiveSheet = {
      id: AS2,
      name: "Ringkasan",
      index: 1,
      headerRow: 1,
      schemaRevision: 1,
      schema: [col(1, "Bulan", "text"), col(2, "Total", "decimal", { hidden: true })],
    };
    const rekap: FreshSheet = {
      id: FS2,
      index: 1,
      name: "Rekap",
      headerRow: 1,
      rawRows: 3,
      columns: [{ pos: 1, name: "Bulan", original: "Bulan" }],
      schema: [col(1, "Bulan", "text", { nonEmpty: 2 })],
      preview: null,
    };
    const views = m.mappingSheets([ringkas, activeData], [freshData, rekap]);
    expect(views.map((v) => v.active.id)).toEqual([AS1, AS2]);
    expect(views[1]).toMatchObject({
      target: null,
      missing: [1],
      newColumns: [],
      candidates: [
        {
          id: FS2,
          name: "Rekap",
          autoMatched: [{ activePos: 1, newPos: 1 }],
          missing: [],
          extra: [],
          newColumns: [{ pos: 1, samples: [] }],
        },
      ],
    });
  });
});

const activeRows = [{ ...activeData }];
const freshRows = [{ ...freshData, colCount: 4 }];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  tx.$queryRaw.mockResolvedValue([{ activeVersionId: ACTIVE_V }]);
  tx.datasetVersion.findFirst.mockResolvedValue({ status: "AWAITING_MAPPING", sheets: freshRows });
  tx.sheet.findMany.mockResolvedValue(activeRows);
  mappingInFlight.mockResolvedValue(null);
  enqueueMapping.mockResolvedValue("mp_1");
});

describe("mappingView", () => {
  const at = new Date("2026-10-14T03:00:00Z");
  const dataset = (versions: unknown[]) => ({
    id: DS,
    name: "Penjualan",
    activeVersion: { id: ACTIVE_V, originalName: "september.csv", sheets: activeRows },
    versions,
  });

  it("bukan pemilik / id rusak → null; tanpa versi menunggu → { none }", async () => {
    expect(await m.mappingView(OWNER, "bukan-id")).toBeNull();
    prisma.dataset.findFirst.mockResolvedValueOnce(null);
    expect(await m.mappingView("lain", DS)).toBeNull();
    expect(prisma.dataset.findFirst.mock.calls[0]![0].where).toEqual({ id: DS, ownerId: "lain" });
    prisma.dataset.findFirst.mockResolvedValueOnce(dataset([]));
    expect(await m.mappingView(OWNER, DS)).toEqual({
      none: true,
      datasetId: DS,
      datasetName: "Penjualan",
    });
  });

  it("versi menunggu: acuan skema aktif, status job, sheet bermasalah", async () => {
    prisma.dataset.findFirst.mockResolvedValueOnce(
      dataset([
        {
          id: V,
          originalName: "oktober.csv",
          createdAt: at,
          sourceDeletedAt: at,
          sheets: freshRows,
        },
      ]),
    );
    mappingInFlight.mockResolvedValueOnce("mp_9");
    const view = await m.mappingView(OWNER, DS);
    expect(view).toMatchObject({
      none: false,
      datasetName: "Penjualan",
      awaiting: {
        id: V,
        fileName: "oktober.csv",
        createdAt: at.toISOString(),
        sourceDeleted: true,
      },
      active: { id: ACTIVE_V, fileName: "september.csv" },
      base: { activeVersionId: ACTIVE_V, sheets: [{ id: AS1, schemaRevision: 2 }] },
      applying: true,
      jobId: "mp_9",
      sheets: [{ target: { id: FS1 }, missing: [2] }],
    });
    expect(mappingInFlight).toHaveBeenCalledWith(V);
    const q = prisma.dataset.findFirst.mock.calls[0]![0];
    expect(q.select.versions.where).toEqual({ status: "AWAITING_MAPPING" });
  });

  it("Redis mati → halaman tetap tampil (applying false)", async () => {
    prisma.dataset.findFirst.mockResolvedValueOnce(
      dataset([{ id: V, originalName: null, createdAt: at, sourceDeletedAt: null, sheets: [] }]),
    );
    mappingInFlight.mockRejectedValueOnce(new Error("redis down"));
    expect(await m.mappingView(OWNER, DS)).toMatchObject({ applying: false, jobId: null });
  });
});

describe("submitMapping", () => {
  const base = { activeVersionId: ACTIVE_V, sheets: [{ id: AS1, schemaRevision: 2 }] };
  const payload = (over: Record<string, unknown> = {}) => ({
    base,
    sheets: [{ activeSheetId: AS1, target: FS1, columns: [{ activePos: 2, newPos: 2 }] }],
    ...over,
  });
  type Limit = Parameters<typeof m.submitMapping>[5];
  const submit = (p: unknown = payload(), limit: Limit = vi.fn(async () => null)) =>
    m.submitMapping(OWNER, DS, V, p, "10.0.0.1", limit);

  it("valid → antre dengan input tervalidasi, pelaku + ip; rate limit dihitung", async () => {
    const limit = vi.fn(async () => null);
    expect(await submit(payload(), limit)).toEqual({ ok: true, data: { jobId: "mp_1" } });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(enqueueMapping).toHaveBeenCalledWith({
      versionId: V,
      datasetId: DS,
      input: payload(),
      actorId: OWNER,
      ip: "10.0.0.1",
    });
    // Lock Dataset milik user (FOR UPDATE) sebelum membaca versi.
    const sql = tx.$queryRaw.mock.calls[0]![0].join("?");
    expect(sql).toMatch(/FOR UPDATE/);
    expect(tx.$queryRaw.mock.calls[0]!.slice(1)).toEqual([DS, OWNER]);
  });

  it("id rusak, bukan pemilik, versi tidak ada → NOT_FOUND", async () => {
    expect(await m.submitMapping(OWNER, "x", V, payload(), "ip", vi.fn())).toMatchObject({
      code: "NOT_FOUND",
    });
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(await submit()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    tx.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect(await submit()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(enqueueMapping).not.toHaveBeenCalled();
  });

  it("versi sudah tidak menunggu pemetaan → INVALID", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({ status: "READY", sheets: freshRows });
    expect(await submit()).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("skema aktif berubah sejak halaman dimuat (revisi/versi aktif) → STALE, tanpa rate limit", async () => {
    const limit = vi.fn(async () => null);
    tx.sheet.findMany.mockResolvedValueOnce([{ ...activeData, schemaRevision: 3 }]);
    expect(await submit(payload(), limit)).toMatchObject({ ok: false, code: "STALE" });
    tx.$queryRaw.mockResolvedValueOnce([{ activeVersionId: "cmv4kljx40009oczvdmpurrvz" }]);
    expect(await submit(payload(), limit)).toMatchObject({ ok: false, code: "STALE" });
    expect(limit).not.toHaveBeenCalled();
    expect(enqueueMapping).not.toHaveBeenCalled();
  });

  it("keputusan tidak lengkap/ganda/di luar rentang → INVALID tanpa memakan kuota", async () => {
    const limit = vi.fn(async () => null);
    const bad = [
      payload({ sheets: [{ activeSheetId: AS1, target: FS1, columns: [] }] }),
      payload({
        sheets: [{ activeSheetId: AS1, target: FS1, columns: [{ activePos: 2, newPos: 3 }] }],
      }),
      payload({
        sheets: [{ activeSheetId: AS1, target: FS1, columns: [{ activePos: 2, newPos: 9 }] }],
      }),
      payload({ sheets: [{ activeSheetId: AS1, target: null, columns: [] }] }),
      { base },
    ];
    for (const p of bad)
      expect(await submit(p, limit)).toMatchObject({ ok: false, code: "INVALID" });
    expect(limit).not.toHaveBeenCalled();
  });

  it("kosongkan (NULL) sah", async () => {
    const p = payload({
      sheets: [{ activeSheetId: AS1, target: FS1, columns: [{ activePos: 2, newPos: null }] }],
    });
    expect(await submit(p)).toMatchObject({ ok: true });
  });

  it("job pemetaan versi ini masih berjalan → DATASET_BUSY tanpa rate limit; balapan enqueue → BUSY", async () => {
    const limit = vi.fn(async () => null);
    mappingInFlight.mockResolvedValueOnce("mp_0");
    expect(await submit(payload(), limit)).toMatchObject({ ok: false, code: "DATASET_BUSY" });
    expect(limit).not.toHaveBeenCalled();
    enqueueMapping.mockResolvedValueOnce(null);
    expect(await submit()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
  });

  it("rate limit habis → RATE_LIMITED, tidak antre", async () => {
    const limited = { ok: false, code: "RATE_LIMITED", message: "Coba lagi." } as const;
    expect(
      await submit(
        payload(),
        vi.fn(async () => limited),
      ),
    ).toBe(limited);
    expect(enqueueMapping).not.toHaveBeenCalled();
  });

  it("antrean lock Dataset lewat batas waktu (P2028) → DATASET_BUSY", async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2028", clientVersion: "6" }),
    );
    expect(await submit()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
  });
});

describe("status job pemetaan", () => {
  it("statusOf: antre/jalan/selesai/basi/hilang/tidak valid/gagal", () => {
    for (const s of ["waiting", "prioritized", "waiting-children", "delayed"]) {
      expect(m.statusOf(s, null)).toEqual({ state: "queued" });
    }
    expect(m.statusOf("active", null)).toEqual({ state: "running" });
    expect(m.statusOf("completed", { outcome: "done" })).toEqual({ state: "done" });
    expect(m.statusOf("completed", { outcome: "stale" })).toEqual({ state: "stale" });
    expect(m.statusOf("completed", { outcome: "gone" })).toEqual({ state: "gone" });
    expect(m.statusOf("completed", { outcome: "invalid", message: "Kolom X" })).toEqual({
      state: "invalid",
      message: "Kolom X",
    });
    expect(m.statusOf("completed", { outcome: "failed", message: "" })).toMatchObject({
      state: "failed",
      message: expect.stringMatching(/tetap menunggu pemetaan/),
    });
    expect(m.statusOf("completed", null)).toMatchObject({ state: "failed" });
    expect(m.statusOf("failed", null)).toMatchObject({ state: "failed" });
    expect(m.statusOf("unknown", null)).toBeNull();
  });

  const job = (over: Record<string, unknown> = {}) => ({
    name: "map-version",
    data: { datasetId: DS, versionId: V },
    returnvalue: { outcome: "done" },
    getState: async () => "completed",
    ...over,
  });

  it("pemilik + job map-version dataset ini → status", async () => {
    prisma.dataset.count.mockResolvedValueOnce(1);
    getJob.mockResolvedValueOnce(job());
    expect(await m.mappingStatus(OWNER, DS, "mp_1")).toEqual({ state: "done" });
    expect(prisma.dataset.count).toHaveBeenCalledWith({ where: { id: DS, ownerId: OWNER } });
  });

  it("bukan pemilik, job dataset lain, job recast, job hilang, id rusak → null (404)", async () => {
    expect(await m.mappingStatus(OWNER, DS, "../x")).toBeNull();
    prisma.dataset.count.mockResolvedValueOnce(0);
    expect(await m.mappingStatus("lain", DS, "mp_1")).toBeNull();
    expect(getJob).not.toHaveBeenCalled();
    prisma.dataset.count.mockResolvedValue(1);
    getJob.mockResolvedValueOnce(job({ data: { datasetId: "cmv4klj5r0007oczvgiofocpz" } }));
    expect(await m.mappingStatus(OWNER, DS, "mp_1")).toBeNull();
    getJob.mockResolvedValueOnce(job({ name: "recast" }));
    expect(await m.mappingStatus(OWNER, DS, "rc_1")).toBeNull();
    getJob.mockResolvedValueOnce(undefined);
    expect(await m.mappingStatus(OWNER, DS, "mp_1")).toBeNull();
  });
});
