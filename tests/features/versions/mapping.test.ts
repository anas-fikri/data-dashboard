import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { ActiveSheet } from "@/features/ingest/refresh";
import type { FreshSheet } from "@/features/versions/mapping";

/*
 * T-014 sisi app: tampilan pemetaan (isu dihitung ulang dari Sheet versi + skema aktif terkini, contoh
 * nilai dari pratinjau, % cast tepat/perkiraan), rencana pasangan pilihan user (diminta per pasangan),
 * simpan pemetaan (kode NOT_FOUND/INVALID/STALE/DATASET_BUSY/RATE_LIMITED, validasi asli
 * validateMapping) dan status job untuk polling. Prisma + antrean dimock.
 */
const tx = {
  $queryRaw: vi.fn(),
  datasetVersion: { findFirst: vi.fn() },
  sheet: { findMany: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dataset: { findFirst: vi.fn(), count: vi.fn() },
  datasetVersion: { findFirst: vi.fn() },
  sheet: { findFirst: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const mappingInFlight = vi.fn();
const enqueueMapping = vi.fn();
const mappingLast = vi.fn();
vi.mock("@/lib/queue/versions", () => ({ mappingInFlight, enqueueMapping, mappingLast }));
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
  colCount: 4,
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

  it("tipe aktif berubah setelah unggah (typed-1 memakai tipe lama) → rasio tidak tepat, tidak ditampilkan", () => {
    const retyped: ActiveSheet = {
      ...activeData,
      schema: activeData.schema.map((c) =>
        c.pos === 3 ? { ...c, type: "integer" as const, numberLocale: "us" as const } : c,
      ),
    };
    expect(m.mappingSheets([retyped], [freshData])[0]!.lowCast).toEqual([]);
  });

  it("sheet tanpa masalah tidak ditampilkan", () => {
    const clean: FreshSheet = {
      ...freshData,
      columns: freshData.columns.map((c) => (c.pos === 2 ? { ...c, original: "Cabang" } : c)),
      schema: freshData.schema!.map((c) => (c.pos === 3 ? { ...c, castFailCount: 0 } : c)),
    };
    expect(m.mappingSheets([activeData], [clean])).toEqual([]);
  });

  it("R2-INT-5: tipe aktif non-teks berubah setelah unggah, tanpa kolom hilang → sheet tetap tampil (target 'Ubah tipe')", () => {
    const clean: FreshSheet = {
      ...freshData,
      columns: freshData.columns.map((c) => (c.pos === 2 ? { ...c, original: "Cabang" } : c)),
      schema: freshData.schema!.map((c) => (c.pos === 3 ? { ...c, castFailCount: 0 } : c)),
    };
    const retype = (over: Partial<ColumnSchema>): ActiveSheet => ({
      ...activeData,
      schema: activeData.schema.map((c) => (c.pos === 3 ? { ...c, ...over } : c)),
    });
    // Desimal format id → bilangan bulat, atau format angka saja yang berubah: job memeriksa ulang.
    for (const a of [
      retype({ type: "integer", numberLocale: "us" }),
      retype({ numberLocale: "us" }),
    ]) {
      const views = m.mappingSheets([a], [clean]);
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({ target: { id: FS1 }, missing: [], lowCast: [] });
      expect(views[0]!.autoMatched).toContainEqual({ activePos: 3, newPos: 3 });
    }
    // Diubah ke teks: job tidak memeriksa kolom teks → tidak ada yang perlu ditampilkan.
    expect(m.mappingSheets([retype({ type: "text", numberLocale: undefined })], [clean])).toEqual(
      [],
    );
  });

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
    colCount: 1,
    columns: [{ pos: 1, name: "Bulan", original: "Bulan" }],
    schema: [col(1, "Bulan", "text", { nonEmpty: 2 })],
    preview: null,
  };

  it("sheet aktif tidak ada di file baru → target null, kandidat = id/nama/jumlah kolom saja", () => {
    const views = m.mappingSheets([ringkas, activeData], [freshData, rekap]);
    expect(views.map((v) => v.active.id)).toEqual([AS1, AS2]);
    expect(views[1]).toEqual(
      expect.objectContaining({
        target: null,
        missing: [1],
        newColumns: [],
        candidates: [{ id: FS2, name: "Rekap", colCount: 1 }],
      }),
    );
  });

  it("pairPlan pasangan user: header aktif dari pratinjau, contoh di bawah header itu, tanpa lowCast tebakan", () => {
    // Sheet aktif ber-header baris 2 (koreksi user); file baru menebak baris 1 (judul laporan).
    const data2: ActiveSheet = { ...ringkas, headerRow: 2, schema: [col(1, "Bulan", "integer")] };
    const report: FreshSheet = {
      ...rekap,
      rawRows: 4,
      columns: [{ pos: 1, name: "Laporan", original: "Laporan" }],
      schema: [col(1, "Laporan", "integer", { castFailCount: 2, nonEmpty: 3 })],
      preview: {
        colCount: 1,
        rows: [
          { row: 1, cells: ["Laporan"] },
          { row: 2, cells: ["Bulan"] },
          { row: 3, cells: ["1"] },
          { row: 4, cells: ["x"] },
        ],
      },
    };
    expect(m.pairPlan(data2, report, true)).toEqual({
      newColumns: [
        {
          pos: 1,
          original: "Bulan",
          name: "Bulan",
          type: "integer",
          castFailCount: 2,
          nonEmpty: 3,
          samples: ["1", "x"],
        },
      ],
      autoMatched: [{ activePos: 1, newPos: 1 }],
      missing: [],
      extra: [],
      lowCast: [],
      headerRow: 2,
      headerChanged: true,
    });
    // Pasangan otomatis: header tersimpan, lowCast dari statistik typed-1 (tipe sama dengan aktif).
    expect(
      m.pairPlan({ ...data2, headerRow: 1, schema: [col(1, "Laporan", "integer")] }, report),
    ).toMatchObject({ headerRow: 1, headerChanged: false, lowCast: [{ pos: 1, pct: 0.33 }] });
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
  mappingLast.mockResolvedValue(null);
  enqueueMapping.mockResolvedValue({ ok: true, jobId: "mp_1" });
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
    const issues = [{ sheet: "Data", column: "Nilai", header: "Nilai", pct: 0.5, typeLabel: "X" }];
    mappingLast.mockResolvedValueOnce({ jobId: "mp_8", result: { outcome: "review", issues } });
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
      last: { jobId: "mp_8", state: "review", issues },
      sheets: [{ target: { id: FS1 }, missing: [2] }],
    });
    expect(mappingInFlight).toHaveBeenCalledWith(V);
    expect(mappingLast).toHaveBeenCalledWith(V);
    const q = prisma.dataset.findFirst.mock.calls[0]![0];
    expect(q.select.versions.where).toEqual({ status: "AWAITING_MAPPING" });
  });

  it("Redis mati → halaman tetap tampil (applying false)", async () => {
    prisma.dataset.findFirst.mockResolvedValueOnce(
      dataset([{ id: V, originalName: null, createdAt: at, sourceDeletedAt: null, sheets: [] }]),
    );
    mappingInFlight.mockRejectedValueOnce(new Error("redis down"));
    mappingLast.mockRejectedValueOnce(new Error("redis down"));
    expect(await m.mappingView(OWNER, DS)).toMatchObject({
      applying: false,
      jobId: null,
      last: null,
    });
  });

  it("mappingJobId (halaman dataset): job berjalan + hasil terakhir versi yang menunggu; selain itu null", async () => {
    expect(await m.mappingJobId(OWNER, "x")).toBeNull();
    prisma.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect(await m.mappingJobId(OWNER, DS)).toBeNull();
    expect(prisma.datasetVersion.findFirst.mock.calls[0]![0].where).toEqual({
      datasetId: DS,
      status: "AWAITING_MAPPING",
      dataset: { ownerId: OWNER },
    });
    prisma.datasetVersion.findFirst.mockResolvedValueOnce({ id: V });
    mappingLast.mockResolvedValueOnce({ jobId: "mp_7", result: { outcome: "failed" } });
    expect(await m.mappingJobId(OWNER, DS)).toEqual({
      jobId: null,
      last: { jobId: "mp_7", state: "failed", message: expect.stringMatching(/gagal/) },
    });
  });
});

describe("pairPlanFor (rencana pasangan pilihan user)", () => {
  it("id rusak, bukan pemilik, sheet bukan milik versi aktif/versi menunggu → NOT_FOUND", async () => {
    expect(await m.pairPlanFor(OWNER, DS, V, AS1, "x")).toMatchObject({ code: "NOT_FOUND" });
    prisma.dataset.findFirst.mockResolvedValueOnce(null);
    expect(await m.pairPlanFor("lain", DS, V, AS1, FS1)).toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.dataset.findFirst.mock.calls[0]![0].where).toEqual({ id: DS, ownerId: "lain" });
    prisma.dataset.findFirst.mockResolvedValueOnce({ activeVersionId: ACTIVE_V });
    prisma.sheet.findFirst.mockResolvedValueOnce(activeRows[0]).mockResolvedValueOnce(null);
    expect(await m.pairPlanFor(OWNER, DS, V, AS1, FS1)).toMatchObject({ code: "NOT_FOUND" });
    const [activeQ, freshQ] = prisma.sheet.findFirst.mock.calls.map((c) => c[0].where);
    expect(activeQ).toEqual({ id: AS1, versionId: ACTIVE_V });
    expect(freshQ).toEqual({
      id: FS1,
      version: { id: V, datasetId: DS, status: "AWAITING_MAPPING" },
    });
  });

  it("pemilik → rencana pasangan (header + kolom)", async () => {
    prisma.dataset.findFirst.mockResolvedValueOnce({ activeVersionId: ACTIVE_V });
    prisma.sheet.findFirst.mockResolvedValueOnce(activeRows[0]).mockResolvedValueOnce(freshRows[0]);
    expect(await m.pairPlanFor(OWNER, DS, V, AS1, FS1)).toMatchObject({
      ok: true,
      data: { missing: [2], extra: [2, 4], lowCast: [], headerRow: 1, headerChanged: false },
    });
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

  it("valid → antre dengan input tervalidasi, pelaku + ip, batas job per user; rate limit dihitung", async () => {
    const limit = vi.fn(async () => null);
    expect(await submit(payload(), limit)).toEqual({ ok: true, data: { jobId: "mp_1" } });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(enqueueMapping).toHaveBeenCalledWith(
      { versionId: V, datasetId: DS, input: payload(), actorId: OWNER, ip: "10.0.0.1" },
      2,
    );
    const ack = payload({ acknowledge: true });
    expect(await submit(ack)).toMatchObject({ ok: true });
    expect(enqueueMapping.mock.calls[1]![0].input).toEqual(ack);
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

  it("T-052: unggahan periode yang menunggu pemetaan → INVALID (pemetaan periode = T-057), tanpa antre", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({
      status: "AWAITING_MAPPING",
      mode: "PERIOD",
      sheets: freshRows,
    });
    expect(await submit()).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringMatching(/unggahan periode belum tersedia/),
    });
    expect(enqueueMapping).not.toHaveBeenCalled();
  });

  it("versi sudah tidak menunggu pemetaan → INVALID", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({ status: "READY", sheets: freshRows });
    expect(await submit()).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("skema aktif berubah sejak halaman dimuat (revisi/versi aktif) → STALE", async () => {
    tx.sheet.findMany.mockResolvedValueOnce([{ ...activeData, schemaRevision: 3 }]);
    expect(await submit()).toMatchObject({ ok: false, code: "STALE" });
    tx.$queryRaw.mockResolvedValueOnce([{ activeVersionId: "cmv4kljx40009oczvdmpurrvz" }]);
    expect(await submit()).toMatchObject({ ok: false, code: "STALE" });
    expect(enqueueMapping).not.toHaveBeenCalled();
  });

  it("bentuk payload rusak → INVALID tanpa kuota, tanpa lock Dataset dan tanpa membaca baris", async () => {
    const limit = vi.fn(async () => null);
    for (const p of [{ base }, payload({ acknowledge: false }), "x", null]) {
      expect(await submit(p, limit)).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(limit).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rate limit dihitung sebelum lock Dataset: keputusan yang ditolak pun memakan kuota", async () => {
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
    ];
    for (const p of bad)
      expect(await submit(p, limit)).toMatchObject({ ok: false, code: "INVALID" });
    expect(limit).toHaveBeenCalledTimes(bad.length);
  });

  it("kosongkan (NULL) sah", async () => {
    const p = payload({
      sheets: [{ activeSheetId: AS1, target: FS1, columns: [{ activePos: 2, newPos: null }] }],
    });
    expect(await submit(p)).toMatchObject({ ok: true });
  });

  it("job pemetaan versi ini masih berjalan / batas job per user / kiriman lain → DATASET_BUSY", async () => {
    enqueueMapping.mockResolvedValueOnce({ ok: false, reason: "version" });
    expect(await submit()).toMatchObject({
      ok: false,
      code: "DATASET_BUSY",
      message: expect.stringMatching(/sedang diterapkan/),
    });
    enqueueMapping.mockResolvedValueOnce({ ok: false, reason: "user", count: 2 });
    expect(await submit()).toMatchObject({
      ok: false,
      code: "DATASET_BUSY",
      message: expect.stringMatching(/koreksi skema atau pemetaan Anda/),
    });
    enqueueMapping.mockResolvedValueOnce({ ok: false, reason: "lock" });
    expect(await submit()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
  });

  it("rate limit habis → RATE_LIMITED sebelum lock Dataset, tidak antre", async () => {
    const limited = { ok: false, code: "RATE_LIMITED", message: "Coba lagi." } as const;
    expect(
      await submit(
        payload(),
        vi.fn(async () => limited),
      ),
    ).toBe(limited);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    expect(m.statusOf("completed", { outcome: "gone", message: "Sudah dipetakan." })).toEqual({
      state: "gone",
      message: "Sudah dipetakan.",
    });
    const issues = [{ sheet: "Data", column: "Nilai", header: "Nilai", pct: 0.8, typeLabel: "X" }];
    expect(m.statusOf("completed", { outcome: "review", issues })).toEqual({
      state: "review",
      issues,
    });
    expect(m.statusOf("completed", { outcome: "review" })).toEqual({ state: "review", issues: [] });
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
