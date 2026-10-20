import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { DeadlineError, runIngest, type IngestProgress } from "@/features/ingest/ingest";
import {
  runPeriodIngest,
  type PeriodActiveSheet,
  type PeriodCommitInput,
  type PeriodCommitResult,
  type PeriodIngestLoad,
  type PeriodIngestRepo,
  type PeriodSegmentRecord,
  type PeriodTypedRecord,
} from "@/features/ingest/period-ingest";
import type { PeriodLimits, PeriodPlan } from "@/features/ingest/period-plan";
import {
  decidePeriodCommit,
  periodPlanSummary,
  type ActiveSegmentRef,
  type IncomingSegmentRef,
  type ManifestRef,
} from "@/features/ingest/period-upload-plan";
import { sameSnapshot } from "@/features/ingest/refresh";
import { buildXlsx, colLetter, DS, FakeStorage, readParquet, testRoot, VID } from "./fakes";

/*
 * Ingest unggahan periode (T-052) dengan parser + DuckDB sungguhan; versi aktif per periode dipalsukan
 * (metadata manifest + file tiruan di storage — worker tidak pernah membaca data periode lama).
 *  AC1 hanya file baru yang diproses, rencana "April 2026 ditambahkan", aktif otomatis, tanpa objek
 *      baru untuk Jan–Mar; AC2 vonis cast atas baris baru saja; AC3 arsip 12 bulan dipecah per periode
 *      + periode nyasar → menunggu konfirmasi; AC4 penolakan batas sebelum typing.
 */
const t = testRoot("period-ingest");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const LIMITS: PeriodLimits = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * 1024 ** 3,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};
const ACTIVE = "cmv4kljx40009oczvaktif0001";
const SHEET = "cmv4kljx40009oczvsheet0001";
const LINEAGE = "lineagecmv4kljx40009ocz";
const SOURCE = `raw/${DS}/${VID}/source.csv`;

const csv = (rows: string[][]) => `${rows.map((r) => r.join(";")).join("\n")}\n`;
const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

/** Skema aktif hasil ingest biasa (inferensi) dari file berbentuk sama. */
async function schemaOf(
  rows: string[][],
): Promise<{ schema: ColumnSchema[]; colCount: number; headerRow: number }> {
  const s = t.setup(t.file(`v1-${Math.random().toString(36).slice(2)}.csv`, csv(rows)));
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  const sh = s.repo.byIndex()[0]!;
  return { schema: sh.schema!, colCount: sh.colCount, headerRow: sh.headerRow };
}

const HEADER = ["kode", "tanggal", "nilai"];
const month = (m: number, n: number, from = 0) =>
  range(n, (i) => [
    `K${m}-${i + from}`,
    `2026-${String(m).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    String(10 + i),
  ]);

class FakePeriodRepo implements PeriodIngestRepo {
  status = "UPLOADED";
  error: string | null = null;
  plan: PeriodPlan | null = null;
  manifest: Map<string, ManifestRef[]> | null = null;
  segments = new Map<string, PeriodSegmentRecord>();
  typed = new Map<string, PeriodTypedRecord & { segmentId: string }>();
  rawSheets: string[] = [];
  progressLog: IngestProgress[] = [];
  highWater = 10_000n;
  commits = 0;
  /** Diubah uji: pengaturan dataset saat commit (beda dengan saat load → rencana dihitung ulang). */
  commitSettings: PeriodIngestLoad["settings"] | null = null;
  private n = 0;
  constructor(
    readonly load0: PeriodIngestLoad,
    readonly limits: PeriodLimits = LIMITS,
  ) {}
  async load() {
    return structuredClone(this.load0);
  }
  async begin() {
    if (!["UPLOADED", "INGESTING"].includes(this.status)) return false;
    this.status = "INGESTING";
    return true;
  }
  async exists() {
    return true;
  }
  async progress(_v: string, p: IngestProgress) {
    this.progressLog.push(p);
  }
  async deleteSheets() {
    const ids = [...this.segments.keys()];
    this.segments.clear();
    this.typed.clear();
    this.rawSheets = [];
    return ids;
  }
  async allocateRows(_l: string, span: number) {
    const base = this.highWater;
    this.highWater += BigInt(span);
    return base;
  }
  async createSegment(_v: string, d: PeriodSegmentRecord) {
    this.segments.set(d.id, d);
  }
  async addTyped(segmentId: string, tr: PeriodTypedRecord) {
    const id = `typed${++this.n}`;
    this.typed.set(id, { ...tr, segmentId });
    return id;
  }
  async createRawSheet(_v: string, s: { name: string }) {
    this.rawSheets.push(s.name);
  }
  async awaitMapping(_v: string, d: { reason: string }) {
    if (this.status !== "INGESTING") return false;
    this.status = "AWAITING_MAPPING";
    this.error = d.reason;
    return true;
  }
  incoming(): IncomingSegmentRef[] {
    return [...this.typed.entries()].map(([typedId, tr]) => {
      const g = this.segments.get(tr.segmentId)!;
      return {
        typedId,
        segmentId: g.id,
        lineageId: g.lineageId,
        periodKey: g.period!.key,
        periodStart: g.period!.start,
        rows: tr.dataRows,
        bytes: g.rawBytes + tr.typedBytes,
      };
    });
  }
  async commit(_v: string, d: PeriodCommitInput): Promise<PeriodCommitResult> {
    this.commits++;
    const a = this.load0.active!;
    const now = {
      activeVersionId: a.versionId,
      sheets: a.sheets.map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
    };
    if (!sameSnapshot(d.snapshot, now)) return { outcome: "stale" };
    const r = decidePeriodCommit({
      facts: d.facts,
      activeVersionId: a.versionId,
      active: a.sheets,
      incoming: this.incoming(),
      settings: this.commitSettings ?? this.load0.settings,
      limits: this.limits,
      include: [],
      mode: { kind: "auto", allowAuto: d.allowAuto },
    });
    if (r.decision === "reject") return { outcome: "rejected", message: r.message };
    if (r.decision !== "activate" && r.decision !== "await") return { outcome: "stale" };
    this.plan = r.plan;
    this.manifest = r.manifest;
    this.status = r.decision === "activate" ? "READY" : "AWAITING_CONFIRM";
    return { outcome: r.decision === "activate" ? "activated" : "awaiting", plan: r.plan };
  }
  async fail(_v: string, message: string) {
    if (!["UPLOADED", "INGESTING"].includes(this.status)) return false;
    this.status = "FAILED";
    this.error = message;
    return true;
  }
  async recordCleanup() {}
}

/** Versi aktif per bulan: satu segmen per periode (file tiruan di storage). */
function activeSheet(
  storage: FakeStorage,
  base: { schema: ColumnSchema[]; colCount: number; headerRow: number },
  periods: Record<string, number>,
  periodSource: "COLUMN" | "LABEL" = "COLUMN",
): PeriodActiveSheet {
  const segments: ActiveSegmentRef[] = [];
  const keys: string[] = [];
  for (const [start, rows] of Object.entries(periods)) {
    const id = `seg${start.replace(/-/g, "")}`;
    const raw = `parquet/${DS}/seg/${id}/raw.parquet`;
    const typed = `parquet/${DS}/seg/${id}/typed-2.parquet`;
    for (const k of [raw, typed]) {
      const p = join(storage.dir, k);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, "x");
    }
    keys.push(raw, typed);
    segments.push({
      typedId: `t-${start}`,
      segmentId: id,
      periodKey: start.slice(0, 7),
      periodStart: start,
      rows,
      bytes: 1000,
      sha256: `sha-${start}`,
    });
  }
  return {
    id: SHEET,
    sheetId: SHEET,
    name: "CSV",
    aliasName: null,
    index: 0,
    headerRow: base.headerRow,
    schemaRevision: 2,
    schema: base.schema,
    lineageId: LINEAGE,
    colCount: base.colCount,
    periodSource,
    periodColumn:
      periodSource === "COLUMN" ? base.schema.find((c) => c.original === "tanggal")!.pos : null,
    segments,
    keys,
  };
}

function setup(
  rows: string[][],
  base: { schema: ColumnSchema[]; colCount: number; headerRow: number },
  periods: Record<string, number>,
  over: Partial<PeriodIngestLoad> & { source?: "COLUMN" | "LABEL"; limits?: PeriodLimits } = {},
) {
  const file = t.file(`p-${Math.random().toString(36).slice(2)}.csv`, csv(rows));
  const storage = new FakeStorage(join(t.root, `store-${Math.random().toString(36).slice(2)}`), {
    [SOURCE]: file,
  });
  const sheet = activeSheet(storage, base, periods, over.source);
  const load: PeriodIngestLoad = {
    datasetId: DS,
    sourceKey: SOURCE,
    originalName: "april.csv",
    grain: "MONTH",
    label: null,
    baseVersionId: ACTIVE,
    active: { versionId: ACTIVE, grain: "MONTH", sheets: [sheet] },
    settings: { keepPeriods: null, onLimit: "REJECT" },
    ...over,
  };
  const before = storage.keys();
  const repo = new FakePeriodRepo(load, over.limits ?? LIMITS);
  const run = () =>
    runPeriodIngest(
      VID,
      { repo, storage, limits: over.limits ?? LIMITS },
      {
        tmpRoot: join(t.root, "tmp"),
        duckMemory: "256MB",
      },
    );
  return { storage, repo, run, before, sheet };
}

const JAN_MAR = { "2026-01-01": 30, "2026-02-01": 28, "2026-03-01": 31 };

describe("AC1: periode baru ditambahkan tanpa menyentuh periode lama", () => {
  it("April (mode kolom) → satu segmen baru, rencana 'April 2026 ditambahkan (n baris)', aktif otomatis, Jan–Mar dirujuk ulang", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR);
    expect(await s.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(s.repo.status).toBe("READY");
    expect(periodPlanSummary(s.repo.plan!)).toBe("April 2026 ditambahkan (30 baris)");
    expect(s.repo.plan!.autoActivate).toBe(true);
    // Objek baru hanya segmen April (raw + typed); objek Jan–Mar tidak berubah/bertambah.
    const added = s.storage.keys().filter((k) => !s.before.includes(k));
    expect(added).toHaveLength(2);
    const seg = [...s.repo.segments.values()][0]!;
    expect(added.sort()).toEqual(
      [seg.rawKey, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`].sort(),
    );
    expect(seg.period).toMatchObject({ key: "2026-04", start: "2026-04-01" });
    expect(seg.period!.minDate).toBe("2026-04-01 00:00:00");
    expect(seg.colMap).toEqual([]);
    // Manifest: Jan–Mar = file typed aktif yang sama, April = file baru; urut periode.
    const m = s.repo.manifest!.get(LINEAGE)!;
    expect(m.map((r) => [r.periodKey, r.typedId, r.fromUpload])).toEqual([
      ["2026-01", "t-2026-01-01", false],
      ["2026-02", "t-2026-02-01", false],
      ["2026-03", "t-2026-03-01", false],
      ["2026-04", [...s.repo.typed.keys()][0], true],
    ]);
    // Typed April: skema aktif (tanpa inferensi) + `_period` + `_row` dari lineage.
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed).toHaveLength(30);
    expect(typed[0]).toEqual([
      10_002,
      new Date("2026-04-01T00:00:00Z"),
      "K4-0",
      new Date("2026-04-01T00:00:00Z"),
      10n,
    ]);
  });

  it("kolom diurutkan ulang di file → peta kolom ke posisi kanonik, nilai tetap di kolomnya", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = [["nilai", "kode", "tanggal"], ...month(4, 5).map(([k, d, v]) => [v!, k!, d!])];
    const s = setup(rows, base, JAN_MAR);
    expect((await s.run()).outcome).toBe("done");
    const seg = [...s.repo.segments.values()][0]!;
    expect(seg.colMap).toEqual([2, 3, 1]);
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => r[2])).toEqual(["K4-0", "K4-1", "K4-2", "K4-3", "K4-4"]);
    expect(typed.map((r) => r[4])).toEqual([10n, 11n, 12n, 13n, 14n]);
  });

  it("versi dasar saat init ≠ versi aktif → tidak aktif otomatis (menunggu konfirmasi)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR, {
      baseVersionId: "cmv4kljx40009oczvlama00001",
    });
    expect((await s.run()).outcome).toBe("confirm");
    expect(s.repo.status).toBe("AWAITING_CONFIRM");
  });

  it("pengaturan berubah sebelum commit → rencana dihitung ulang (bukan rencana awal yang dipercaya)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR);
    // Saat diproses masih muat; saat commit pemilik sudah menurunkan "Simpan 3 periode" + lepas otomatis.
    s.repo.commitSettings = { keepPeriods: 3, onLimit: "EVICT_OLDEST" };
    expect((await s.run()).outcome).toBe("confirm");
    expect(s.repo.plan!.confirm).toContain("EVICT");
    expect(s.repo.plan!.entries.find((e) => e.key === "2026-01")!.action).toBe("EVICTED");
  });
});

describe("sheet file yang tidak berpasangan", () => {
  it("xlsx: sheet 'Ringkasan' tidak ada di data aktif → tidak disimpan, rencana wajib dikonfirmasi", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const xml = (rows: string[][]) =>
      rows
        .map(
          (r, i) =>
            `<row r="${i + 1}">${r.map((v, c) => `<c r="${colLetter(c + 1)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
        )
        .join("");
    const file = t.file(
      `x-${Math.random().toString(36).slice(2)}.xlsx`,
      await buildXlsx([
        { name: "Data", xml: xml([HEADER, ...month(4, 20)]) },
        { name: "Ringkasan", xml: xml([["total"], ["20"]]) },
      ]),
    );
    const key = `raw/${DS}/${VID}/source.xlsx`;
    const storage = new FakeStorage(join(t.root, `store-x${Math.random().toString(36).slice(2)}`), {
      [key]: file,
    });
    const sheet = { ...activeSheet(storage, base, JAN_MAR), name: "Data" };
    const repo = new FakePeriodRepo({
      datasetId: DS,
      sourceKey: key,
      originalName: "april.xlsx",
      grain: "MONTH",
      label: null,
      baseVersionId: ACTIVE,
      active: { versionId: ACTIVE, grain: "MONTH", sheets: [sheet] },
      settings: { keepPeriods: null, onLimit: "REJECT" },
    });
    const r = await runPeriodIngest(
      VID,
      { repo, storage, limits: LIMITS },
      { tmpRoot: join(t.root, "tmp"), duckMemory: "256MB" },
    );
    expect(r.outcome).toBe("confirm");
    expect(repo.plan).toMatchObject({ ignoredSheets: ["Ringkasan"], confirm: ["IGNORED_SHEETS"] });
    expect(periodPlanSummary(repo.plan!)).toBe(
      "April 2026 ditambahkan (20 baris) · sheet “Ringkasan” tidak disimpan",
    );
    expect([...repo.segments.values()].map((g) => g.lineageId)).toEqual([LINEAGE]);
  });
});

describe("AC2: vonis cast dihitung atas baris baru saja", () => {
  it("500 baris baru, 20 tanggal gagal cast (4% > 2%) di atas basis 100.000 baris → AWAITING_MAPPING, tanpa typed", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = month(4, 500).map((r, i) => (i < 20 ? [r[0]!, "bukan-tanggal", r[2]!] : r));
    const s = setup([HEADER, ...rows], base, {
      "2026-01-01": 33_000,
      "2026-02-01": 33_000,
      "2026-03-01": 34_000,
    });
    const r = await s.run();
    expect(r.outcome).toBe("awaiting");
    expect(s.repo.status).toBe("AWAITING_MAPPING");
    expect(s.repo.error).toMatch(/hanya 96% nilai di file baru yang cocok dengan tipe Tanggal/);
    // Raw tersimpan untuk pemetaan; tidak ada file typed/segmen periode.
    expect(s.repo.typed.size).toBe(0);
    expect([...s.repo.segments.values()].every((g) => g.period === null)).toBe(true);
    expect(s.repo.rawSheets).toEqual(["CSV"]);
  });

  it("5 dari 500 (1%) → lolos vonis; baris tanpa tanggal valid tidak dibuang diam-diam (menunggu konfirmasi)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = month(4, 500).map((r, i) => (i < 5 ? [r[0]!, "", r[2]!] : r));
    const s = setup([HEADER, ...rows], base, JAN_MAR);
    expect((await s.run()).outcome).toBe("confirm");
    expect(s.repo.plan).toMatchObject({ droppedRows: 5, confirm: ["DROPPED_ROWS"] });
    expect(s.repo.plan!.entries.find((e) => e.key === "2026-04")!.afterRows).toBe(495);
  });

  it("kolom terlihat hilang dari file → AWAITING_MAPPING dengan nama kolomnya", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup(
      [["kode", "tanggal"], ...month(4, 10).map((r) => [r[0]!, r[1]!])],
      base,
      JAN_MAR,
    );
    expect((await s.run()).outcome).toBe("awaiting");
    expect(s.repo.error).toMatch(/Kolom "nilai" tidak ada di file baru/);
  });
});

describe("AC3: arsip 12 bulan dipecah satu segmen per periode dalam satu pass", () => {
  it("12 bulan + 3 baris nyasar → 13 segmen, periode nyasar dikecualikan → AWAITING_CONFIRM", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = [
      ...range(12, (m) => month(m + 1, 40)).flat(),
      ["X1", "2025-12-30", "1"],
      ["X2", "2025-12-31", "2"],
      ["X3", "2025-12-31", "3"],
    ];
    const s = setup([HEADER, ...rows], base, {});
    expect((await s.run()).outcome).toBe("confirm");
    const segs = [...s.repo.segments.values()];
    expect(segs).toHaveLength(13);
    expect(segs.map((g) => g.period!.key).sort()[0]).toBe("2025-12");
    expect([...s.repo.typed.values()].map((x) => x.dataRows).sort((a, b) => a - b)[0]).toBe(3);
    const stray = s.repo.plan!.entries.find((e) => e.key === "2025-12")!;
    expect(stray).toMatchObject({ stray: true, action: "EXCLUDED" });
    expect(s.repo.plan!.confirm).toEqual(["STRAY"]);
    // Manifest bawaan tanpa periode nyasar (default "Kecualikan").
    expect(s.repo.manifest!.get(LINEAGE)!.map((r) => r.periodKey)).toHaveLength(12);
  });
});

describe("AC4: penolakan batas sebelum typing", () => {
  it("mode kolom: melewati batas simpan (REJECT) → FAILED dengan nama periode, tanpa segmen/objek", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR, {
      settings: { keepPeriods: 3, onLimit: "REJECT" },
    });
    const r = await s.run();
    expect(r).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toMatch(/Hapus periode Januari 2026 dulu/);
    expect(s.repo.segments.size).toBe(0);
    expect(s.repo.commits).toBe(0);
    expect(s.storage.keys().filter((k) => !s.before.includes(k))).toEqual([]);
  });

  it("mode label: periode di luar jendela → ditolak setelah parse, sebelum typing", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup(
      [HEADER, ...month(4, 30)],
      base,
      { "2026-05-01": 10, "2026-06-01": 10 },
      {
        source: "LABEL",
        label: "2026-01-01",
        settings: { keepPeriods: 2, onLimit: "EVICT_OLDEST" },
      },
    );
    const r = await s.run();
    expect(r).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toMatch(/Periode Januari 2026 di luar batas simpan 2 periode/);
    expect(s.repo.segments.size).toBe(0);
  });

  it("mode label tanpa label → FAILED dengan ajakan memilih periode", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR, { source: "LABEL" });
    expect(await s.run()).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toMatch(/Periode untuk sheet berlabel belum dipilih/);
  });

  it("mode label → satu segmen periode label, selalu menunggu konfirmasi", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR, {
      source: "LABEL",
      label: "2026-04-01",
    });
    expect((await s.run()).outcome).toBe("confirm");
    expect(s.repo.plan!.confirm).toEqual(["LABEL"]);
    // T-054: min/max kolom tanggal acuan (kolom date pertama) dicatat untuk peringatan tinjauan.
    expect([...s.repo.segments.values()][0]!.period).toMatchObject({
      key: "2026-04",
      minDate: "2026-04-01 00:00:00",
      maxDate: "2026-04-28 00:00:00",
    });
  });

  it("T-054 mode label: rentang kolom acuan dicatat apa adanya walau di luar label", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 5)], base, JAN_MAR, {
      source: "LABEL",
      label: "2026-05-01",
    });
    expect((await s.run()).outcome).toBe("confirm");
    expect([...s.repo.segments.values()][0]!.period).toMatchObject({
      key: "2026-05",
      start: "2026-05-01",
      minDate: "2026-04-01 00:00:00",
      maxDate: "2026-04-05 00:00:00",
    });
  });

  it("T-054 mode label tanpa kolom tanggal acuan → rentang null", async () => {
    const rows = (n: number) => range(n, (i) => [`K${i}`, String(10 + i)]);
    const base = await schemaOf([["kode", "nilai"], ...rows(30)]);
    const s = setup([["kode", "nilai"], ...rows(30)], base, JAN_MAR, {
      source: "LABEL",
      label: "2026-04-01",
    });
    expect((await s.run()).outcome).toBe("confirm");
    expect([...s.repo.segments.values()][0]!.period).toMatchObject({
      minDate: null,
      maxDate: null,
    });
  });
});

describe("prasyarat", () => {
  it("versi aktif bukan per periode → FAILED tanpa memproses file", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR);
    s.repo.load0.active!.grain = null;
    expect(await s.run()).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toMatch(/tidak lagi menyimpan data per periode/);
  });

  it("acuan cast basi saat commit → dilempar (BullMQ mengulang), objek segmen tidak dihapus", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR);
    s.repo.commit = async () => ({ outcome: "stale" });
    await expect(s.run()).rejects.toThrow(/skema aktif berubah/);
    expect(s.storage.keys().filter((k) => !s.before.includes(k))).toHaveLength(2);
  });

  it("review L2: commit melempar galat permanen lalu FAILED tercatat (commit pasti tidak masuk) → objek segmen dihapus", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR);
    s.repo.commit = async () => {
      throw new DeadlineError("deadline");
    };
    expect(await s.run()).toMatchObject({ outcome: "failed" });
    expect(s.repo.status).toBe("FAILED");
    expect(s.storage.keys().filter((k) => !s.before.includes(k))).toEqual([]);
  });
});
