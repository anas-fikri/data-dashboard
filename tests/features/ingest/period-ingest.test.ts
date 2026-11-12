import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import type { CopySource } from "@/features/ingest/period-keymerge";
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
    const id = `typed${this.archive.size + ++this.n}`;
    this.typed.set(id, { ...tr, segmentId });
    this.archive.set(id, { typed: { ...tr, segmentId }, segment: this.segments.get(segmentId)! });
    return id;
  }
  /** Segmen + typed semua unggahan (lintas run, v1.20): sumber salinan Tambah/Perbarui. */
  archive = new Map<
    string,
    { typed: PeriodTypedRecord & { segmentId: string }; segment: PeriodSegmentRecord }
  >();
  async copySources(typedIds: string[]): Promise<CopySource[]> {
    return typedIds.flatMap((id) => {
      const a = this.archive.get(id);
      if (!a) return [];
      const g = a.segment;
      return [
        {
          typedId: id,
          segmentId: g.id,
          typedKey: a.typed.typedKey,
          schemaRevision: a.typed.schemaRevision,
          columns: a.typed.columns,
          profile: a.typed.profile,
          typedHeaderRow: a.typed.headerRow,
          rawKey: g.rawKey,
          rawRows: g.rawRows,
          headerRow: g.headerRow,
          colCount: g.colCount,
          colMap: g.colMap,
          rowBase: g.rowBase,
          maxSrcRow: g.maxSrcRow,
          sha256: g.sha256,
          sourceKind: g.sourceKind,
          originalName: g.originalName ?? null,
          minDate: g.period?.minDate ?? null,
          maxDate: g.period?.maxDate ?? null,
          uploadedById: null,
        },
      ];
    });
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
        sha256: g.sha256,
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
    // Seperti commitPeriodInTx: perubahan skema ganda untuk satu sheet logis = acuan basi.
    if (new Set(d.changes.map((c) => c.lineageId)).size !== d.changes.length) {
      return { outcome: "stale" };
    }
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
    keyColumns: [],
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

  it("T-jsmj: 3 sheet berkolom sama (nama beda, periode acak) → digabung ke sheet data, satu kelompok per periode, wajib ditinjau", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const xml = (rows: string[][]) =>
      rows
        .map(
          (r, i) =>
            `<row r="${i + 1}">${r.map((v, c) => `<c r="${colLetter(c + 1)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
        )
        .join("");
    const file = t.file(
      `m-${Math.random().toString(36).slice(2)}.xlsx`,
      await buildXlsx([
        // Nama sheet tidak sama dengan "Data": dulu semuanya diabaikan.
        { name: "Bagian 1", xml: xml([HEADER, ...month(4, 10), ...month(5, 5)]) },
        { name: "Bagian 2", xml: xml([HEADER, ...month(4, 7, 100)]) },
        { name: "Bagian 3", xml: xml([HEADER, ...month(5, 8, 200)]) },
        { name: "Ringkasan", xml: xml([["total"], ["30"]]) },
      ]),
    );
    const key = `raw/${DS}/${VID}/source.xlsx`;
    const storage = new FakeStorage(join(t.root, `store-m${Math.random().toString(36).slice(2)}`), {
      [key]: file,
    });
    const sheet = { ...activeSheet(storage, base, JAN_MAR), name: "Data" };
    const repo = new FakePeriodRepo({
      datasetId: DS,
      sourceKey: key,
      originalName: "apr-mei.xlsx",
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
    expect(repo.plan).toMatchObject({
      ignoredSheets: ["Ringkasan"],
      mergedSheets: [{ sheet: "Data", from: ["Bagian 1", "Bagian 2", "Bagian 3"] }],
    });
    expect(repo.plan!.confirm).toEqual(expect.arrayContaining(["MERGED_SHEETS", "IGNORED_SHEETS"]));
    const rows = Object.fromEntries(repo.plan!.entries.map((e) => [e.key, e.afterRows]));
    expect(rows["2026-04"]).toBe(17);
    expect(rows["2026-05"]).toBe(13);
    // Satu kelompok per periode: nomor bagian unik, ukuran = jumlah segmen periode itu.
    const segs = [...repo.segments.values()].filter((g) => g.period);
    const byPeriod = new Map<string, typeof segs>();
    for (const g of segs) byPeriod.set(g.period!.key, [...(byPeriod.get(g.period!.key) ?? []), g]);
    for (const [, list] of byPeriod) {
      expect(list.every((g) => g.lineageId === LINEAGE && g.group?.id === VID)).toBe(true);
      expect(new Set(list.map((g) => g.group?.part)).size).toBe(list.length);
      expect(list.every((g) => g.group?.size === list.length)).toBe(true);
    }
    expect(byPeriod.get("2026-04")).toHaveLength(2);
    expect(byPeriod.get("2026-05")).toHaveLength(2);
    expect(periodPlanSummary(repo.plan!)).toContain(
      "sheet “Bagian 1”, “Bagian 2”, “Bagian 3” digabung ke “Data”",
    );
  });
});

describe("T-jsmj review: sheet gabungan", () => {
  const xml = (rows: string[][]) =>
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}">${r.map((v, c) => `<c r="${colLetter(c + 1)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
      )
      .join("");
  async function setupXlsx(
    sheets: { name: string; rows: string[][] }[],
    active: (storage: FakeStorage) => PeriodActiveSheet[],
  ) {
    const file = t.file(
      `r-${Math.random().toString(36).slice(2)}.xlsx`,
      await buildXlsx(sheets.map((x) => ({ name: x.name, xml: xml(x.rows) }))),
    );
    const key = `raw/${DS}/${VID}/source.xlsx`;
    const storage = new FakeStorage(join(t.root, `store-r${Math.random().toString(36).slice(2)}`), {
      [key]: file,
    });
    const repo = new FakePeriodRepo({
      datasetId: DS,
      sourceKey: key,
      originalName: "gabung.xlsx",
      grain: "MONTH",
      label: null,
      baseVersionId: ACTIVE,
      active: { versionId: ACTIVE, grain: "MONTH", sheets: active(storage) },
      settings: { keepPeriods: null, onLimit: "REJECT" },
    });
    const run = () =>
      runPeriodIngest(
        VID,
        { repo, storage, limits: LIMITS },
        {
          tmpRoot: join(t.root, "tmp"),
          duckMemory: "256MB",
          // Fixture kecil: ambang sheet penuh (CONTINUATION_MIN_ROWS) diturunkan.
          continuationMinRows: 1,
        },
      );
    return { repo, run };
  }

  it("H1: 2 sheet dengan kolom baru yang sama → satu perubahan skema per sheet data, commit masuk", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const h = [...HEADER, "catatan"];
    const extra = (rows: string[][]) => rows.map((r) => [...r, "x"]);
    const s = await setupXlsx(
      [
        { name: "Data", rows: [h, ...extra(month(4, 10))] },
        { name: "Data 2", rows: [h, ...extra(month(4, 5, 100))] },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "Data" }],
    );
    const r = await s.run();
    expect(r.outcome).toBe("confirm");
    expect(s.repo.changes).toHaveLength(1);
    expect(s.repo.changes[0]!.added.map((c) => c.original)).toEqual(["catatan"]);
    expect(s.repo.plan!.entries.find((e) => e.key === "2026-04")!.afterRows).toBe(15);
  });

  it("verifikasi H1: sheet dengan judul kolom tambahan berbeda tidak digabung (diabaikan), bukan salah kolom", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = await setupXlsx(
      [
        { name: "Data", rows: [[...HEADER, "X"], ...month(4, 4).map((r) => [...r, "xval"])] },
        {
          name: "Data 2",
          rows: [[...HEADER, "X", "Y"], ...month(4, 3, 50).map((r) => [...r, "x", "y"])],
        },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "Data" }],
    );
    const r = await s.run();
    // Judul beda → "Data 2" tidak bersidik sama; tidak digabung, diabaikan.
    expect(r.outcome).toBe("confirm");
    expect(s.repo.plan!.ignoredSheets).toEqual(["Data 2"]);
  });

  it("H2: sheet berpasangan butuh pemetaan → sheet tambahan tidak digabung (diabaikan), menunggu pemetaan dengan satu sheet", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const h = ["kode", "tgl", "nilai"]; // 'tanggal' hilang → pemetaan
    const s = await setupXlsx(
      [
        { name: "Data", rows: [h, ...month(4, 10)] },
        { name: "Data 2", rows: [h, ...month(4, 5, 100)] },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "Data" }],
    );
    const r = await s.run();
    expect(r.outcome).toBe("awaiting");
    expect(s.repo.rawSheets).toEqual(["Data"]);
    expect(s.repo.ignored).toEqual(["Data 2"]);
    // Alasan tidak dobel.
    expect(s.repo.error!.split("tidak ada di file baru").length - 1).toBe(1);
  });

  it("M3: nilai sheet gabungan tidak lolos vonis → gagal dengan pesan sheet gabungan (bukan kelompok file)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const bad = (rows: string[][]) => rows.map((r) => [r[0]!, "bukan-tanggal", r[2]!]);
    const s = await setupXlsx(
      [
        { name: "Data", rows: [HEADER, ...bad(month(4, 10))] },
        { name: "Data 2", rows: [HEADER, ...month(4, 5, 100)] },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "Data" }],
    );
    const r = await s.run();
    expect(r.outcome).toBe("failed");
    expect((r as { message: string }).message).toMatch(
      /^Unggahan dengan sheet gabungan tidak diproses: /,
    );
    expect((r as { message: string }).message).not.toMatch(/Kelompok file/);
  });

  it("M4 (ragu): sheet berbeda nama cocok dengan dua sheet data → tidak ditebak, diabaikan", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = await setupXlsx(
      [
        { name: "Billing", rows: [HEADER, ...month(4, 10)] },
        { name: "Resi pending", rows: [HEADER, ...month(4, 3, 50)] },
      ],
      (st) => [
        { ...activeSheet(st, base, JAN_MAR), name: "Billing" },
        {
          ...activeSheet(st, base, {}),
          id: "sheet-resi",
          sheetId: "sheet-resi",
          lineageId: "lineage-resi",
          name: "Resi",
          index: 1,
        },
      ],
    );
    const r = await s.run();
    // Sheet data "Resi" belum berpasangan, "Resi pending" cocok persis dengan skemanya; "Billing" sudah
    // berpasangan dengan judul yang sama → kandidat ganda → tidak ditebak.
    expect(r.outcome).toBe("confirm");
    expect(s.repo.plan!.ignoredSheets).toEqual(["Resi pending"]);
  });

  it("M4: sheet data tanpa pasangan nama, satu sheet file cocok persis kolomnya → dipasangkan, tercatat, wajib ditinjau", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const RH = ["resi", "tanggal", "berat"];
    const resiBase = await schemaOf([RH, ...month(1, 30)]);
    const s = await setupXlsx(
      [
        { name: "Billing", rows: [HEADER, ...month(4, 10)] },
        { name: "Resi pending", rows: [RH, ...month(4, 3, 50)] },
      ],
      (st) => [
        { ...activeSheet(st, base, JAN_MAR), name: "Billing" },
        {
          ...activeSheet(st, resiBase, {}),
          id: "sheet-resi",
          sheetId: "sheet-resi",
          lineageId: "lineage-resi",
          name: "Resi",
          index: 1,
        },
      ],
    );
    const r = await s.run();
    expect(r.outcome).toBe("confirm");
    expect(s.repo.plan!.mergedSheets).toEqual([{ sheet: "Resi", from: ["Resi pending"] }]);
    expect(s.repo.plan!.confirm).toContain("MERGED_SHEETS");
    expect(periodPlanSummary(s.repo.plan!)).toContain(
      "sheet “Resi pending” dipasangkan ke “Resi” (kolom sama)",
    );
  });

  it("v1.19.1: sheet lanjutan tanpa judul (bulan bercampur) → digabung ke sheet data, baris pertamanya data", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = await setupXlsx(
      [
        { name: "os invoice", rows: [HEADER, ...month(4, 10)] },
        { name: "os invoice(2)", rows: [...month(4, 6, 100), ...month(5, 4, 200)] },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "os invoice" }],
    );
    const r = await s.run();
    expect(r.outcome).toBe("confirm");
    expect(s.repo.plan!.ignoredSheets).toEqual([]);
    expect(s.repo.plan!.mergedSheets).toEqual([
      { sheet: "os invoice", from: ["os invoice", "os invoice(2)"] },
    ]);
    const after = Object.fromEntries(s.repo.plan!.entries.map((e) => [e.key, e.afterRows]));
    expect(after["2026-04"]).toBe(16);
    expect(after["2026-05"]).toBe(4);
  });

  it("L5: sheet gabungan → sidik + nama asal per sheet (bukan sidik file yang sama untuk semua bagian)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = await setupXlsx(
      [
        { name: "Data", rows: [HEADER, ...month(4, 10)] },
        { name: "Data 2", rows: [HEADER, ...month(4, 5, 100)] },
      ],
      (st) => [{ ...activeSheet(st, base, JAN_MAR), name: "Data" }],
    );
    await s.run();
    const segs = [...s.repo.segments.values()].filter((g) => g.period);
    expect(new Set(segs.map((g) => g.sha256)).size).toBe(2);
    expect(segs.map((g) => g.originalName).sort()).toEqual([
      "gabung.xlsx (sheet Data 2)",
      "gabung.xlsx (sheet Data)",
    ]);
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
  copySources = (ids: string[]) => this.r.copySources(ids);
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

  it("review M1: file kelompok yang sama persis dua kali (salinan) → kelompok ditolak, kedua nama disebut, tanpa commit", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const files = await parts();
    const copy = t.file(
      `m2copy-${Math.random().toString(36).slice(2)}.csv`,
      readFileSync(files[1]!),
    );
    const s = groupSetup([files[0]!, files[1]!, copy], base);
    expect(await s.run()).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toBe(
      "Kelompok file tidak diproses: “maret-2.csv” dan “maret-3.xlsx” berisi sama persis, sehingga barisnya akan tergandakan. Hapus salah satunya, lalu unggah ulang kelompoknya. Data aktif tidak berubah.",
    );
    expect(s.repo.commits).toBe(0);
    expect(s.repo.segments.size).toBe(0);
  });

  it("review L4: kelompok multi-periode — identik dinilai per periode (Maret sama, Februari berubah)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const files = await parts();
    const feb = t.file(
      `feb-${Math.random().toString(36).slice(2)}.csv`,
      csv([HEADER, ...month(2, 5)]),
    );
    // Data aktif: Maret dari kelompok 3 file Maret yang sama (sidik gabungan file-file itu).
    const s0 = groupSetup(files, base);
    await s0.run();
    const marchSegs = s0.repo
      .incoming()
      .map((g) => ({ ...g, sha256: s0.repo.segments.get(g.segmentId)!.sha256 }));
    const active: PeriodActiveSheet = {
      ...s0.sheet,
      segments: [...s0.sheet.segments.filter((g) => g.periodKey !== "2026-03"), ...marchSegs],
      keys: [
        ...s0.sheet.keys,
        ...s0.repo
          .incoming()
          .flatMap((g) => [
            s0.repo.segments.get(g.segmentId)!.rawKey,
            s0.repo.typed.get(g.typedId)!.typedKey,
          ]),
      ],
    };
    // Kelompok baru: 3 file Maret yang sama + 1 file Februari baru (4 file → keys/sources disesuaikan).
    const s = groupSetup(files, base, active);
    const febKey = `raw/${DS}/${VID}/part-4.csv`;
    s.storage.sources[febKey] = feb;
    s.repo.load0.sources = [...s.repo.load0.sources!, { key: febKey, name: "februari.csv" }];
    expect(await s.run()).toMatchObject({ outcome: "confirm" });
    const by = Object.fromEntries(s.repo.plan!.entries.map((e) => [e.key, e]));
    expect(by["2026-03"]).toMatchObject({ action: "REPLACED", identical: true });
    expect(by["2026-02"]).toMatchObject({ action: "REPLACED", identical: false });
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

  it("verifikasi v1.19: hanya sebagian file kelompok punya kolom tambahan → tetap diterima (seperti v1.18)", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = month(3, 30);
    const files = await parts();
    files[1] = t.file(
      `gc-${Math.random().toString(36).slice(2)}.csv`,
      csv([[...HEADER, "catatan"], ...rows.slice(15).map((r) => [...r, "c"])]),
    );
    const s = groupSetup(files, base);
    const r = await s.run();
    expect(r.outcome).not.toBe("failed");
    expect(s.repo.changes).toHaveLength(1);
    expect(s.repo.changes[0]!.added.map((c) => c.original)).toEqual(["catatan"]);
  });

  it("verifikasi v1.19: file kelompok dengan kolom tambahan berbeda (X vs Y) → kelompok ditolak, tidak salah kolom", async () => {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const rows = month(3, 30);
    const files = await parts();
    files[0] = t.file(
      `gx-${Math.random().toString(36).slice(2)}.csv`,
      csv([[...HEADER, "X"], ...rows.slice(0, 15).map((r) => [...r, "xval"])]),
    );
    files[1] = t.file(
      `gy-${Math.random().toString(36).slice(2)}.csv`,
      csv([[...HEADER, "Y"], ...rows.slice(15).map((r) => [...r, "yval"])]),
    );
    const s = groupSetup(files, base);
    const r = await s.run();
    expect(r.outcome).toBe("failed");
    expect(s.repo.error).toMatch(
      /^Kelompok file tidak diproses: kolom tambahan berbeda antar file/,
    );
    expect(s.repo.commits).toBe(0);
    expect(s.repo.segments.size).toBe(0);
  });
});

describe("v1.20 Tambah / Perbarui berdasarkan kunci (T-rbrb)", () => {
  /** Unggahan pertama (Ganti) → data aktif sungguhan (segmen parquet) untuk unggahan kedua. */
  async function seeded(first: string[][]) {
    const base = await schemaOf([HEADER, ...month(1, 30)]);
    const s = setup([HEADER, ...first], base, {});
    expect(await s.run()).toEqual({ outcome: "done", sheets: 1 });
    const refs = s.repo.manifest!.get(LINEAGE)!;
    const inc = s.repo.incoming();
    const segments: ActiveSegmentRef[] = refs.map((r) => {
      const g = inc.find((x) => x.typedId === r.typedId)!;
      return {
        typedId: g.typedId,
        segmentId: g.segmentId,
        periodKey: g.periodKey,
        periodStart: g.periodStart,
        rows: g.rows,
        bytes: g.bytes,
        sha256: g.sha256 ?? null,
        groupId: g.groupId ?? null,
        groupPart: g.groupPart ?? null,
        groupSize: g.groupSize ?? null,
      };
    });
    const kode = base.schema.find((c) => /kode/i.test(c.original))!.pos;
    let sheet: PeriodActiveSheet = {
      ...s.sheet,
      segments,
      keys: s.storage.parquetKeys(),
      keyColumns: [kode],
    };
    /** Versi unggahan berikutnya yang aktif menjadi data aktif (rantai unggahan). */
    const adopt = (repo: FakePeriodRepo) => {
      const inc = repo.incoming();
      sheet = {
        ...sheet,
        segments: repo.manifest!.get(LINEAGE)!.map((r) => {
          const g = inc.find((x) => x.typedId === r.typedId);
          const prev = sheet.segments.find((x) => x.typedId === r.typedId);
          return g
            ? {
                typedId: g.typedId,
                segmentId: g.segmentId,
                periodKey: g.periodKey,
                periodStart: g.periodStart,
                rows: g.rows,
                bytes: g.bytes,
                sha256: g.sha256 ?? null,
                groupId: g.groupId ?? null,
                groupPart: g.groupPart ?? null,
                groupSize: g.groupSize ?? null,
              }
            : prev!;
        }),
        keys: s.storage.parquetKeys(),
      };
      s.repo.highWater = repo.highWater;
    };
    /** Unggahan berikutnya ke data aktif hasil unggahan pertama. */
    const next = (rows: string[][], mode: "APPEND" | "UPSERT", keyColumns = [kode]) => {
      const file = t.file(`n-${Math.random().toString(36).slice(2)}.csv`, csv(rows));
      s.storage.sources[SOURCE] = file;
      const load: PeriodIngestLoad = {
        ...s.repo.load0,
        uploadMode: mode,
        active: {
          versionId: ACTIVE,
          grain: "MONTH",
          sheets: [{ ...structuredClone(sheet), keyColumns }],
        },
      };
      const repo = new FakePeriodRepo(load, LIMITS);
      repo.archive = s.repo.archive;
      // allocateRows per lineage monoton lintas unggahan (seperti SheetLineage.rowHighWater).
      repo.highWater = s.repo.highWater;
      const run = () =>
        runPeriodIngest(
          VID,
          { repo, storage: s.storage, limits: LIMITS },
          { tmpRoot: join(t.root, "tmp"), duckMemory: "256MB" },
        );
      return { repo, run };
    };
    const typedOf = async (repo: FakePeriodRepo, key: string) => {
      const refs = repo.manifest!.get(LINEAGE)!.filter((r) => r.periodKey === key);
      const out: unknown[][] = [];
      for (const r of refs) {
        const tr = repo.typed.get(r.typedId) ?? s.repo.archive.get(r.typedId)!.typed;
        out.push(...(await readParquet(join(s.storage.dir, tr.typedKey))));
      }
      return out;
    };
    return { s, next, typedOf, adopt };
  }

  it("Perbarui: kunci sama dikoreksi, kunci baru ditambah, kunci pindah bulan → aktif otomatis", async () => {
    const { next, typedOf } = await seeded([...month(1, 10), ...month(2, 10)]);
    const fix = month(1, 5).map(([k, d]) => [k!, d!, "99"]);
    const fresh = [["K1-100", "2026-01-20", "7"]];
    const moved = [["K2-3", "2026-01-15", "5"]];
    const u = next([HEADER, ...fix, ...fresh, ...moved], "UPSERT");
    expect(await u.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(u.repo.status).toBe("READY");
    const plan = u.repo.plan!;
    expect(plan.mode).toBe("UPSERT");
    expect(plan.confirm).toEqual([]);
    const jan = plan.entries.find((e) => e.key === "2026-01")!;
    const feb = plan.entries.find((e) => e.key === "2026-02")!;
    expect([jan.action, jan.beforeRows, jan.afterRows]).toEqual(["UPDATED", 10, 12]);
    expect(jan.keyed).toEqual({ fileRows: 7, updated: 6, kept: 5, removed: 5, movedOut: 0 });
    expect([feb.action, feb.beforeRows, feb.afterRows]).toEqual(["UPDATED", 10, 9]);
    expect(feb.keyed).toEqual({ fileRows: 0, updated: 0, kept: 9, removed: 1, movedOut: 1 });
    expect(feb.shrink).toBe(false);
    expect(periodPlanSummary(plan)).toContain("Januari 2026 diperbarui");

    const janRows = await typedOf(u.repo, "2026-01");
    const byKode = new Map(janRows.map((r) => [r[2], r[4]]));
    expect(janRows).toHaveLength(12);
    expect(byKode.get("K1-0")).toBe(99n);
    expect(byKode.get("K1-7")).toBe(17n);
    expect(byKode.get("K1-100")).toBe(7n);
    expect(byKode.get("K2-3")).toBe(5n);
    const febRows = await typedOf(u.repo, "2026-02");
    expect(febRows.map((r) => r[2])).not.toContain("K2-3");
    expect(febRows).toHaveLength(9);
    // `_row` unik di seluruh sheet data (salinan memakai `_row` lama).
    const all = [...janRows, ...febRows].map((r) => r[0]);
    expect(new Set(all).size).toBe(all.length);
    // Periode yang ditulis ulang = kelompok (bagian file + salinan lama).
    const janSegs = u.repo.manifest!.get(LINEAGE)!.filter((r) => r.periodKey === "2026-01");
    expect(janSegs).toHaveLength(2);
  });

  it("Perbarui: file yang sama diunggah ulang → tidak ada perubahan baris, tetap aktif otomatis", async () => {
    const rows = [...month(1, 10)];
    const { next } = await seeded(rows);
    const u = next([HEADER, ...rows], "UPSERT");
    expect((await u.run()).outcome).toBe("done");
    const jan = u.repo.plan!.entries.find((e) => e.key === "2026-01")!;
    expect([jan.beforeRows, jan.afterRows]).toEqual([10, 10]);
    expect(jan.keyed).toMatchObject({ updated: 10, kept: 0, removed: 10 });
    expect(u.repo.plan!.confirm).toEqual([]);
  });

  it("Perbarui: kunci dobel di file → ditolak dengan daftar kunci, data aktif tetap", async () => {
    const { next } = await seeded([...month(1, 10)]);
    const dup = [
      ["K1-0", "2026-01-02", "1"],
      ["K1-0", "2026-01-03", "2"],
      ["K1-9", "2026-01-04", "3"],
      ["K1-9", "2026-01-05", "4"],
      ["K1-9", "2026-01-06", "5"],
    ];
    const u = next([HEADER, ...dup], "UPSERT");
    const r = await u.run();
    expect(r.outcome).toBe("failed");
    expect(u.repo.status).toBe("FAILED");
    expect(u.repo.error).toContain("2 kunci “kode” muncul lebih dari sekali");
    expect(u.repo.error).toContain("K1-9 (3×), K1-0 (2×)");
    expect(u.repo.error).toContain("Data aktif tidak berubah");
    expect(u.repo.commits).toBe(0);
  });

  it("Perbarui: kunci kosong → ditolak dengan nomor baris", async () => {
    const { next } = await seeded([...month(1, 10)]);
    const u = next([HEADER, ["", "2026-01-02", "1"], ["K1-1", "2026-01-03", "2"]], "UPSERT");
    expect((await u.run()).outcome).toBe("failed");
    expect(u.repo.error).toContain("Kolom kunci “kode” kosong di 1 baris: sheet “CSV” baris 2");
  });

  it("Perbarui tanpa kolom kunci → ditolak; Tambah menambah baris tanpa membuang", async () => {
    const { next, typedOf } = await seeded([...month(1, 10)]);
    const none = next([HEADER, ...month(1, 2)], "UPSERT", []);
    expect((await none.run()).outcome).toBe("failed");
    expect(none.repo.error).toContain("belum punya kolom kunci");

    const add = next([HEADER, ["K1-0", "2026-01-09", "1"], ["X-1", "2026-03-01", "2"]], "APPEND");
    expect((await add.run()).outcome).toBe("done");
    const plan = add.repo.plan!;
    expect(plan.mode).toBe("APPEND");
    const jan = plan.entries.find((e) => e.key === "2026-01")!;
    expect([jan.action, jan.afterRows]).toEqual(["UPDATED", 11]);
    expect(plan.entries.find((e) => e.key === "2026-03")!.action).toBe("ADDED");
    expect((await typedOf(add.repo, "2026-01")).filter((r) => r[2] === "K1-0")).toHaveLength(2);
  });

  it("rantai Perbarui: salinan lama dipadatkan jadi satu segmen per periode; nilai dan `_row` tetap benar", async () => {
    const { next, typedOf, adopt } = await seeded([...month(1, 10)]);
    let last: FakePeriodRepo | null = null;
    for (const [i, rows] of [
      [
        ["K1-0", "2026-01-02", "100"],
        ["N-1", "2026-01-03", "1"],
      ],
      [
        ["K1-1", "2026-01-02", "101"],
        ["N-2", "2026-01-04", "2"],
      ],
      [
        ["N-1", "2026-01-05", "11"],
        ["N-3", "2026-01-06", "3"],
      ],
    ].entries()) {
      const u = next([HEADER, ...rows], "UPSERT");
      expect((await u.run()).outcome, `unggahan ${i + 1}`).toBe("done");
      adopt(u.repo);
      last = u.repo;
    }
    const jan = last!.manifest!.get(LINEAGE)!.filter((r) => r.periodKey === "2026-01");
    // Bagian file unggahan terakhir + SATU salinan padat (bukan menumpuk setiap unggahan).
    expect(jan).toHaveLength(2);
    const rows = await typedOf(last!, "2026-01");
    expect(rows).toHaveLength(13);
    const by = new Map(rows.map((r) => [r[2], r[4]]));
    expect([
      by.get("K1-0"),
      by.get("K1-1"),
      by.get("K1-2"),
      by.get("N-1"),
      by.get("N-2"),
      by.get("N-3"),
    ]).toEqual([100n, 101n, 12n, 11n, 2n, 3n]);
    const ids = rows.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(rows.map((r) => r[2])).size).toBe(13);
    // Salinan padat: tanpa baris judul, peta kolom identitas, `_row` baru.
    const seg = [...last!.segments.values()].find((g) => g.headerRow === 0)!;
    expect(seg.colMap).toEqual([]);
    expect(seg.rawRows).toBe(11);
  });

  it("Tambah file yang sama dua kali → ditinjau (baris akan tergandakan)", async () => {
    const { next, adopt } = await seeded([...month(1, 10)]);
    const extra = [HEADER, ["X-1", "2026-01-09", "1"]];
    const a = next(extra, "APPEND");
    expect((await a.run()).outcome).toBe("done");
    adopt(a.repo);
    const b = next(extra, "APPEND");
    expect((await b.run()).outcome).toBe("confirm");
    expect(b.repo.plan!.confirm).toContain("IDENTICAL");
    expect(b.repo.plan!.entries.find((e) => e.key === "2026-01")!.identical).toBe(true);
  });
});
