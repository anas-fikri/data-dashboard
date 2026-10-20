import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { DeadlineError, runIngest, type IngestProgress } from "@/features/ingest/ingest";
import {
  runPeriodIngest,
  runPeriodMapping,
  type PeriodMappingRepo,
  type PeriodRawSheet,
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
  applySchemaChange,
  decidePeriodCommit,
  periodPlanSummary,
  type SheetSchemaChange,
  type ActiveSegmentRef,
  type IncomingSegmentRef,
  type ManifestRef,
} from "@/features/ingest/period-upload-plan";
import { sameSnapshot } from "@/features/ingest/refresh";
import type { SheetRecord } from "@/features/ingest/ingest";
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
  /** Sheet raw saja versi yang menunggu pemetaan (T-057: sumber pemetaan). */
  rawRecs: PeriodRawSheet[] = [];
  ignored: string[] = [];
  /** Perubahan skema sheet yang dibawa commit (T-057). */
  changes: SheetSchemaChange[] = [];
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
  async createRawSheet(
    _v: string,
    s: SheetRecord,
    lineageId: string,
    _segmentId: string,
    rawKey: string,
  ) {
    this.rawSheets.push(s.name);
    this.rawRecs.push({
      ...structuredClone(s),
      id: `rawsheet${this.rawRecs.length + 1}`,
      lineageId,
      rawKey,
    });
  }
  async awaitMapping(_v: string, d: { reason: string; ignoredSheets: string[] }) {
    if (this.status !== "INGESTING") return false;
    this.status = "AWAITING_MAPPING";
    this.error = d.reason;
    this.ignored = d.ignoredSheets;
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
        ...(g.group
          ? { groupId: g.group.id, groupPart: g.group.part, groupSize: g.group.size }
          : {}),
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
    this.changes = d.changes;
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
      periodSource === "COLUMN" ? base.schema.find((c) => /tanggal/i.test(c.original))!.pos : null,
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

  it("T-055 EVICT_OLDEST: batas simpan → periode terlama dilepas utuh (tinjauan), tanpa baris dipotong", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...month(4, 30)], base, JAN_MAR, {
      settings: { keepPeriods: 3, onLimit: "EVICT_OLDEST" },
    });
    expect((await s.run()).outcome).toBe("confirm");
    const plan = s.repo.plan!;
    expect(plan.confirm).toContain("EVICT");
    expect(plan.rejection).toBeNull();
    expect(plan.entries.map((e) => [e.key, e.action, e.beforeRows, e.afterRows])).toEqual([
      ["2026-01", "EVICTED", 30, 0],
      ["2026-02", "UNCHANGED", 28, 28],
      ["2026-03", "UNCHANGED", 31, 31],
      ["2026-04", "ADDED", 0, 30],
    ]);
    // Manifest: Januari tidak ikut (utuh), periode lain apa adanya; total = jumlah periode utuh.
    expect(s.repo.manifest!.get(LINEAGE)!.map((r) => [r.periodKey, r.rows])).toEqual([
      ["2026-02", 28],
      ["2026-03", 31],
      ["2026-04", 30],
    ]);
    expect(plan.totals.after).toEqual({ [LINEAGE]: 89 });
  });

  it("T-055 satu periode melebihi batas baris → ditolak dengan jumlah baris + batasnya, data aktif tidak berubah", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const limits = { ...LIMITS, sheetMaxRows: 20 };
    const s = setup(
      [HEADER, ...month(4, 30)],
      base,
      { "2026-01-01": 5 },
      {
        limits,
        settings: { keepPeriods: null, onLimit: "EVICT_OLDEST" },
      },
    );
    expect(await s.run()).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toMatch(
      /^Periode April 2026 berisi 30 baris di satu sheet, melebihi batas 20 baris per sheet\./,
    );
    // Tidak ada yang dilepas atau ditulis: tanpa commit, segmen, atau objek baru.
    expect(s.repo.commits).toBe(0);
    expect(s.repo.segments.size).toBe(0);
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

// ── T-057: pemetaan kolom pada unggahan periode ─────────────────────────────────────────────────────

/** Repo pemetaan di atas repo ingest tiruan (status, segmen, commit yang sama). */
class FakeMappingRepo implements PeriodMappingRepo {
  audit: { actorId: string; ip: string; meta: Record<string, unknown> } | null = null;
  commits = 0;
  constructor(readonly r: FakePeriodRepo) {}
  load = () => this.r.load();
  allocateRows = (l: string, n: number) => this.r.allocateRows(l, n);
  createSegment = (v: string, d: PeriodSegmentRecord) => this.r.createSegment(v, d);
  addTyped = (id: string, t: PeriodTypedRecord) => this.r.addTyped(id, t);
  recordCleanup = async () => {};
  async rawSheets() {
    return {
      sheets: structuredClone(this.r.rawRecs),
      sha256: "sha-file",
      ignoredSheets: this.r.ignored,
    };
  }
  async deletePeriodSegments() {
    if (this.r.status !== "AWAITING_MAPPING") return [];
    const ids = [...this.r.segments.values()].filter((g) => g.period).map((g) => g.id);
    for (const id of ids) this.r.segments.delete(id);
    for (const [k, t] of this.r.typed) if (ids.includes(t.segmentId)) this.r.typed.delete(k);
    return ids;
  }
  async commit(v: string, d: Parameters<PeriodMappingRepo["commit"]>[1]) {
    this.commits++;
    if (this.r.status !== "AWAITING_MAPPING") return { outcome: "gone" as const };
    const r = await this.r.commit(v, d);
    if (r.outcome === "activated" || r.outcome === "awaiting") this.audit = d.audit;
    return r;
  }
  async dropRawSegments() {
    const ids = [...this.r.segments.values()].filter((g) => !g.period).map((g) => g.id);
    for (const id of ids) this.r.segments.delete(id);
    return ids;
  }
}

/** Unggahan periode yang menunggu pemetaan + jalankan pemetaan dengan keputusan `columns`. */
async function awaiting(
  rows: string[][],
  base: { schema: ColumnSchema[]; colCount: number; headerRow: number },
  over: Parameters<typeof setup>[3] = {},
) {
  const s = setup(rows, base, JAN_MAR, over);
  expect((await s.run()).outcome).toBe("awaiting");
  const mrepo = new FakeMappingRepo(s.repo);
  const snapshot = {
    activeVersionId: ACTIVE,
    sheets: [{ id: SHEET, schemaRevision: 2 }],
  };
  const map = (
    columns: { activePos: number; newPos: number | null }[],
    extra: Record<string, unknown> = {},
  ) =>
    runPeriodMapping(
      VID,
      {
        base: snapshot,
        sheets: [{ activeSheetId: SHEET, target: s.repo.rawRecs[0]!.id, columns }],
        ...extra,
      },
      { repo: mrepo, storage: s.storage, limits: LIMITS },
      {
        tmpRoot: join(t.root, "tmp"),
        duckMemory: "256MB",
        watch: async () => {},
        actorId: "owner1",
        ip: "10.0.0.1",
        jobId: "mp_9",
      },
    );
  return { ...s, mrepo, map };
}

const KIRIM = ["kode", "Tanggal Kirim", "nilai"];
const newKeys = (s: { storage: FakeStorage; before: string[] }) =>
  s.storage.keys().filter((k) => !s.before.includes(k));

describe("T-057 AC1: judul kolom berganti → AWAITING_MAPPING; hanya segmen baru yang di-cast", () => {
  it("'Tgl Kirim' vs 'Tanggal Kirim' → menunggu pemetaan; setelah dipetakan April aktif, Jan–Mar tidak tersentuh", async () => {
    const base = await schemaOf([KIRIM, ...month(1, 30)]);
    const s = await awaiting([["kode", "Tgl Kirim", "nilai"], ...month(4, 10)], base);
    expect(s.repo.error).toMatch(/Kolom "Tanggal Kirim" tidak ada di file baru/);
    // Raw saja; tanpa typed.
    expect(s.repo.typed.size).toBe(0);
    const rawOnly = [...s.repo.segments.keys()];

    expect(await s.map([{ activePos: 2, newPos: 2 }])).toEqual({
      outcome: "done",
      activated: true,
    });
    expect(s.repo.status).toBe("READY");
    expect(periodPlanSummary(s.repo.plan!)).toBe("April 2026 ditambahkan (10 baris)");
    // Manifest: Jan–Mar = file typed aktif yang sama (tidak di-cast ulang), April = segmen baru.
    const m = s.repo.manifest!.get(LINEAGE)!;
    expect(m.filter((r) => !r.fromUpload).map((r) => r.typedId)).toEqual([
      "t-2026-01-01",
      "t-2026-02-01",
      "t-2026-03-01",
    ]);
    // Objek baru hanya raw + typed segmen April; raw saja dari ingest dibersihkan.
    const seg = [...s.repo.segments.values()].find((g) => g.period)!;
    expect(newKeys(s).sort()).toEqual(
      [seg.rawKey, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`].sort(),
    );
    expect(rawOnly.some((id) => s.repo.segments.has(id))).toBe(false);
    // Nilai tanggal dari kolom 'Tgl Kirim' masuk ke posisi kanonik 'Tanggal Kirim'.
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => r[3])).toEqual(month(4, 10).map((r) => new Date(`${r[1]}T00:00:00Z`)));
    // Judul pengganti diingat sebagai alias; audit pemetaan dengan id job.
    expect(s.repo.changes).toEqual([
      expect.objectContaining({
        lineageId: LINEAGE,
        baseRevision: 2,
        aliases: [{ pos: 2, alias: "Tgl Kirim" }],
        added: [],
      }),
    ]);
    expect(s.mrepo.audit).toMatchObject({
      actorId: "owner1",
      meta: { jobId: "mp_9", mapped: 1, nulls: 0 },
    });
  });

  it("AC4: bulan berikutnya memakai 'Tgl Kirim' lagi → terpetakan otomatis lewat alias, tanpa AWAITING_MAPPING", async () => {
    const base = await schemaOf([KIRIM, ...month(1, 30)]);
    const first = await awaiting([["kode", "Tgl Kirim", "nilai"], ...month(4, 10)], base);
    expect((await first.map([{ activePos: 2, newPos: 2 }])).outcome).toBe("done");
    const ch = first.repo.changes[0]!;
    const next = applySchemaChange({ ...base, columns: [], schemaRevision: 2 }, ch)!;
    expect(next.schema[1]!.aliases).toEqual(["Tgl Kirim"]);
    const s = setup(
      [["kode", "Tgl Kirim", "nilai"], ...month(5, 12)],
      { ...base, schema: next.schema },
      {
        ...JAN_MAR,
        "2026-04-01": 10,
      },
    );
    expect(await s.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(periodPlanSummary(s.repo.plan!)).toBe("Mei 2026 ditambahkan (12 baris)");
    expect(s.repo.changes).toEqual([]);
  });

  it("acuan skema berubah sejak halaman dibuka → stale; ubah tipe → invalid; tanpa segmen ditulis", async () => {
    const base = await schemaOf([KIRIM, ...month(1, 30)]);
    const s = await awaiting([["kode", "Tgl Kirim", "nilai"], ...month(4, 10)], base);
    const stale = await runPeriodMapping(
      VID,
      {
        base: { activeVersionId: ACTIVE, sheets: [{ id: SHEET, schemaRevision: 1 }] },
        sheets: [{ activeSheetId: SHEET, target: s.repo.rawRecs[0]!.id, columns: [] }],
      },
      { repo: s.mrepo, storage: s.storage, limits: LIMITS },
      { tmpRoot: join(t.root, "tmp"), watch: async () => {}, actorId: "o", ip: "i" },
    );
    expect(stale).toEqual({ outcome: "stale" });
    expect(
      await s.map([{ activePos: 2, newPos: 2 }], {
        sheets: [
          {
            activeSheetId: SHEET,
            target: s.repo.rawRecs[0]!.id,
            columns: [{ activePos: 2, newPos: 2 }],
            casts: [{ pos: 3, type: "text" }],
          },
        ],
      }),
    ).toMatchObject({ outcome: "invalid", message: expect.stringMatching(/halaman Skema/) });
    expect(await s.map([{ activePos: 2, newPos: null }])).toMatchObject({
      outcome: "invalid",
      message: expect.stringMatching(/kolom periode/),
    });
    expect([...s.repo.segments.values()].filter((g) => g.period)).toEqual([]);
    expect(s.repo.status).toBe("AWAITING_MAPPING");
  });

  it("nilai kolom yang dipetakan banyak tidak cocok → review (tanpa segmen); dengan persetujuan → nilai itu NULL", async () => {
    const base = await schemaOf([KIRIM, ...month(1, 30)]);
    // 'nilai' (bilangan bulat) hilang; pemilik memetakan 'ket' (teks) ke sana.
    const rows = [
      ["kode", "Tanggal Kirim", "ket"],
      ...month(4, 10).map((r, i) => [r[0]!, r[1]!, i < 5 ? "x" : "7"]),
    ];
    const s = await awaiting(rows, base);
    const review = await s.map([{ activePos: 3, newPos: 3 }]);
    expect(review).toEqual({
      outcome: "review",
      issues: [
        { sheet: "CSV", column: "nilai", header: "ket", pct: 0.5, typeLabel: expect.any(String) },
      ],
    });
    expect([...s.repo.segments.values()].filter((g) => g.period)).toEqual([]);
    expect((await s.map([{ activePos: 3, newPos: 3 }], { acknowledge: true })).outcome).toBe(
      "done",
    );
    const seg = [...s.repo.segments.values()].find((g) => g.period)!;
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => r[4])).toEqual([null, null, null, null, null, 7n, 7n, 7n, 7n, 7n]);
  });
});

describe("T-057 AC2: 'Kosongkan' dan kolom tambahan", () => {
  it("'Kosongkan' → NULL hanya di periode baru, kolom tidak absent; kolom tambahan → kolom tersembunyi baru, periode lama tanpa cast ulang", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = [
      ["kode", "tanggal", "keterangan"],
      ...month(4, 6).map((r, i) => [r[0]!, r[1]!, `catatan ${i}`]),
    ];
    const s = await awaiting(rows, base);
    expect(s.repo.error).toMatch(/Kolom "nilai" tidak ada di file baru/);
    expect(await s.map([{ activePos: 3, newPos: null }])).toEqual({
      outcome: "done",
      activated: true,
    });
    const seg = [...s.repo.segments.values()].find((g) => g.period)!;
    // nilai (pos 3) = kosong untuk April; keterangan = posisi kanonik baru 4 (kolom file 3).
    expect(seg.colMap).toEqual([1, 2, 0, 3]);
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => r[4])).toEqual([null, null, null, null, null, null]);
    expect(typed.map((r) => r[5])).toEqual(range(6, (i) => `catatan ${i}`));
    const tr = [...s.repo.typed.values()][0]!;
    expect(tr.columns).toEqual([1, 2, 3, 4]);
    const ch = s.repo.changes[0]!;
    expect(ch).toMatchObject({
      colCount: 4,
      columns: [{ pos: 4, original: "keterangan" }],
      aliases: [],
      normalized: [],
    });
    expect(ch.added).toEqual([
      expect.objectContaining({
        pos: 4,
        original: "keterangan",
        type: "text",
        hidden: true,
        nonEmpty: 6,
        nullPct: 0,
      }),
    ]);
    // Skema versi baru: nilai tetap kolom biasa (bukan absent), kolom baru tersembunyi.
    const next = applySchemaChange({ ...base, columns: [], schemaRevision: 2 }, ch)!;
    expect(next.schema.find((c) => c.pos === 3)!.absent).toBeUndefined();
    expect(next.schema.map((c) => [c.pos, c.hidden])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
    ]);
    // Periode lama: file typed yang sama (tanpa kolom 4 → NULL lewat proyeksi query), tidak ditulis ulang.
    expect(newKeys(s)).toHaveLength(2);
  });

  it("kolom tambahan tanpa kolom yang hilang → aktif otomatis dengan kolom tersembunyi baru (tanpa pemetaan)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = [[...HEADER, "catatan"], ...month(4, 5).map((r) => [...r, "ok"])];
    const s = setup(rows, base, JAN_MAR);
    expect(await s.run()).toEqual({ outcome: "done", sheets: 1 });
    const seg = [...s.repo.segments.values()][0]!;
    expect(seg.colMap).toEqual([]);
    expect(s.repo.changes).toEqual([
      expect.objectContaining({
        colCount: 4,
        added: [expect.objectContaining({ pos: 4, original: "catatan", hidden: true })],
      }),
    ]);
    const typed = await readParquet(
      join(s.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => r[5])).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });

  it("commit menolak (batas) → segmen pemetaan dibersihkan, versi tetap menunggu pemetaan", async () => {
    const base = await schemaOf([KIRIM, ...month(1, 30)]);
    const s = await awaiting([["kode", "Tgl Kirim", "nilai"], ...month(4, 10)], base);
    s.repo.commitSettings = { keepPeriods: 3, onLimit: "REJECT" };
    const r = await s.map([{ activePos: 2, newPos: 2 }]);
    expect(r).toMatchObject({ outcome: "failed" });
    expect([...s.repo.segments.values()].filter((g) => g.period)).toEqual([]);
    expect(s.repo.status).toBe("AWAITING_MAPPING");
  });
});

describe("T-057 review M1: kolom absent (T-014) yang tetap tidak ada", () => {
  it("absent Diskon, April menambah Catatan → Diskon tetap absent; Mei tanpa Diskon aktif otomatis (tanpa pemetaan)", async () => {
    const base0 = await schemaOf([HEADER, ...month(1, 30)]);
    const diskon: ColumnSchema = {
      pos: 4,
      name: "Diskon",
      original: "Diskon",
      type: "integer",
      numberLocale: "us",
      hidden: false,
      nullPct: 1,
      distinctCount: 0,
      castFailCount: 0,
      nonEmpty: 0,
      absent: true,
    };
    const base = { ...base0, schema: [...base0.schema, diskon] };
    const april = setup(
      [[...HEADER, "catatan"], ...month(4, 5).map((r) => [...r, "ok"])],
      base,
      JAN_MAR,
    );
    expect(await april.run()).toEqual({ outcome: "done", sheets: 1 });
    const ch = april.repo.changes[0]!;
    expect(ch).toMatchObject({ colCount: 5, normalized: [] });
    expect(ch.columns.map((c) => [c.pos, c.original])).toEqual([
      [4, "Diskon"],
      [5, "catatan"],
    ]);
    const seg = [...april.repo.segments.values()][0]!;
    expect(seg.colMap).toEqual([1, 2, 3, 0, 4]);
    const typed = await readParquet(
      join(april.storage.dir, `parquet/${DS}/seg/${seg.id}/typed-2.parquet`),
    );
    expect(typed.map((r) => [r[5], r[6]])).toEqual(range(5, () => [null, "ok"]));
    const next = applySchemaChange(
      { colCount: 3, columns: [], schema: base.schema, schemaRevision: 2 },
      ch,
    )!;
    expect(next.schema.find((c) => c.pos === 4)!.absent).toBe(true);
    // Mei: tanpa Diskon (tetap absent) → aktif otomatis, tanpa pemetaan.
    const mei = setup(
      [[...HEADER, "catatan"], ...month(5, 3).map((r) => [...r, "x"])],
      { ...base, schema: next.schema, colCount: next.colCount },
      { ...JAN_MAR, "2026-04-01": 5 },
    );
    expect(await mei.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(mei.repo.changes).toEqual([]);
  });
});

describe("T-060 AC1: satu periode dari beberapa file sebagai satu kelompok", () => {
  const xml = (rows: string[][]) =>
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}">${r.map((v, c) => `<c r="${colLetter(c + 1)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
      )
      .join("");
  /** Maret 2026 (40 baris) dipecah ke 3 file: 2 CSV + 1 xlsx (jenis file per bagian). */
  async function parts() {
    const rows = month(3, 40);
    const tag = Math.random().toString(36).slice(2);
    return [
      t.file(`m1-${tag}.csv`, csv([HEADER, ...rows.slice(0, 15)])),
      t.file(`m2-${tag}.csv`, csv([HEADER, ...rows.slice(15, 30)])),
      t.file(
        `m3-${tag}.xlsx`,
        await buildXlsx([{ name: "CSV", xml: xml([HEADER, ...rows.slice(30)]) }]),
      ),
    ];
  }
  const keys = [1, 2, 3].map((n) => `raw/${DS}/${VID}/part-${n}.${n === 3 ? "xlsx" : "csv"}`);
  const names = ["maret-1.csv", "maret-2.csv", "maret-3.xlsx"];

  function groupSetup(
    files: string[],
    base: { schema: ColumnSchema[]; colCount: number; headerRow: number },
    sheet?: PeriodActiveSheet,
  ) {
    const storage = new FakeStorage(join(t.root, `store-g${Math.random().toString(36).slice(2)}`), {
      [keys[0]!]: files[0]!,
      [keys[1]!]: files[1]!,
      [keys[2]!]: files[2]!,
    });
    const active = sheet ?? activeSheet(storage, base, JAN_MAR);
    // Segmen aktif dari unggahan kelompok sebelumnya: file tiruan juga harus ada di storage ini.
    for (const k of active.keys) {
      if (!storage.keys().includes(k)) {
        const p = join(storage.dir, k);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, "x");
      }
    }
    const repo = new FakePeriodRepo({
      datasetId: DS,
      sourceKey: keys[0]!,
      originalName: "maret-1.csv + 2 file lain",
      sources: keys.map((key, i) => ({ key, name: names[i]! })),
      grain: "MONTH",
      label: null,
      baseVersionId: ACTIVE,
      active: { versionId: ACTIVE, grain: "MONTH", sheets: [active] },
      settings: { keepPeriods: null, onLimit: "REJECT" },
    });
    const run = () =>
      runPeriodIngest(
        VID,
        { repo, storage, limits: LIMITS },
        { tmpRoot: join(t.root, "tmp"), duckMemory: "256MB" },
      );
    return { storage, repo, run, sheet: active };
  }

  /** Isi data Maret dari file typed manifest (tanpa _row): urut file kelompok lalu baris. */
  async function marchRows(s: ReturnType<typeof groupSetup>) {
    const out: unknown[][] = [];
    for (const r of s.repo.manifest!.get(LINEAGE)!.filter((x) => x.periodKey === "2026-03")) {
      const tr = s.repo.typed.get(r.typedId)!;
      for (const row of await readParquet(join(s.storage.dir, tr.typedKey))) out.push(row.slice(1));
    }
    return out;
  }

  it("3 file Maret → satu versi berisi 3 segmen Maret yang menggantikan seluruh Maret; unggah ulang kelompok yang sama → data identik, tanpa baris ganda", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const files = await parts();
    const s = groupSetup(files, base);
    expect(await s.run()).toMatchObject({ outcome: "confirm" });
    expect(s.repo.status).toBe("AWAITING_CONFIRM");
    const mar = s.repo.plan!.entries.find((e) => e.key === "2026-03")!;
    expect(mar).toMatchObject({ action: "REPLACED", beforeRows: 31, afterRows: 40 });
    expect(periodPlanSummary(s.repo.plan!)).toBe("Maret 2026 diganti (31 → 40 baris)");
    // Satu segmen per file, satu kelompok lengkap, nama file per bagian, jenis file per bagian.
    const segs = [...s.repo.segments.values()].sort((a, b) => a.group!.part - b.group!.part);
    expect(segs.map((g) => [g.period!.key, g.group, g.originalName, g.sourceKind])).toEqual([
      ["2026-03", { id: VID, part: 1, size: 3 }, "maret-1.csv", "csv"],
      ["2026-03", { id: VID, part: 2, size: 3 }, "maret-2.csv", "csv"],
      ["2026-03", { id: VID, part: 3, size: 3 }, "maret-3.xlsx", "xlsx"],
    ]);
    // Rentang _row antarbagian tidak bertumpuk (dialokasikan per segmen).
    expect(new Set(segs.map((g) => g.rowBase)).size).toBe(3);
    // Manifest: Jan–Feb dirujuk ulang, Maret = 3 segmen baru (urut nomor file), Maret lama tidak ikut.
    const m = s.repo.manifest!.get(LINEAGE)!;
    expect(m.map((r) => [r.periodKey, r.rows, r.fromUpload])).toEqual([
      ["2026-01", 30, false],
      ["2026-02", 28, false],
      ["2026-03", 15, true],
      ["2026-03", 15, true],
      ["2026-03", 10, true],
    ]);
    expect(m.some((r) => r.typedId === "t-2026-03-01")).toBe(false);
    const first = await marchRows(s);
    expect(first).toHaveLength(40);
    expect(new Set(first.map((r) => r[1])).size).toBe(40); // kode unik: tanpa baris ganda

    // Unggah ulang kelompok yang sama di atas hasil di atas (Maret = 3 segmen kelompok).
    const after: PeriodActiveSheet = {
      ...s.sheet,
      segments: [
        ...s.sheet.segments.filter((g) => g.periodKey !== "2026-03"),
        ...s.repo
          .incoming()
          .map((g) => ({ ...g, sha256: s.repo.segments.get(g.segmentId)!.sha256 })),
      ],
      keys: [
        ...s.sheet.keys.filter((k) => !k.includes("seg20260301")),
        ...s.repo.incoming().flatMap((g) => {
          const seg = s.repo.segments.get(g.segmentId)!;
          return [seg.rawKey, s.repo.typed.get(g.typedId)!.typedKey];
        }),
      ],
    };
    const again = groupSetup(files, base, after);
    // Objek kelompok pertama ikut ada di storage kedua (sudah dibuat oleh helper).
    expect(await again.run()).toMatchObject({ outcome: "confirm" });
    const mar2 = again.repo.plan!.entries.find((e) => e.key === "2026-03")!;
    expect(mar2).toMatchObject({
      action: "REPLACED",
      beforeRows: 40,
      afterRows: 40,
      identical: true,
    });
    expect(again.repo.plan!.confirm).toEqual(["REPLACE", "IDENTICAL"]);
    expect(
      again.repo.manifest!.get(LINEAGE)!.filter((r) => r.periodKey === "2026-03"),
    ).toHaveLength(3);
    expect(await marchRows(again)).toEqual(first);
  });

  it("satu file kelompok butuh pemetaan kolom → seluruh kelompok gagal, data aktif tidak berubah, segmen dibersihkan", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const files = await parts();
    const rows = month(3, 40);
    files[1] = t.file(
      `m2b-${Math.random().toString(36).slice(2)}.csv`,
      csv([["kode", "tgl_lain", "nilai"], ...rows.slice(15, 30)]),
    );
    const s = groupSetup(files, base);
    const r = await s.run();
    expect(r.outcome).toBe("failed");
    expect(s.repo.status).toBe("FAILED");
    expect(s.repo.error).toMatch(/^Kelompok file tidak diproses: /);
    expect(s.repo.commits).toBe(0);
    expect(s.repo.segments.size).toBe(0);
    expect(s.storage.keys().some((k) => k.includes("/seg/") && !k.includes("seg2026"))).toBe(false);
  });
});
