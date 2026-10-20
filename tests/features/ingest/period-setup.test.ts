import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest } from "@/features/ingest/ingest";
import {
  runPeriodSetup,
  SETUP_STALE_MESSAGE,
  type NewSetupSegment,
  type NewSetupSheet,
  type PeriodSetupJobData,
  type PeriodSetupRepo,
  type SetupLoad,
  type SetupSourceSheet,
} from "@/features/ingest/period-setup";
import type { PeriodGrain } from "@/features/ingest/period";
import type { IngestProgress } from "@/features/ingest/ingest";
import type { ManifestSheet } from "@/features/versions/integrity-check";
import type { SourceKind } from "@/features/ingest/infer";
import { copyTyped } from "@/features/ingest/typed";
import { lit, openDuck } from "@/lib/duckdb";
import { DS, testRoot, VID, type FakeRepo, type FakeStorage } from "./fakes";

/*
 * Job "Atur periode" (T-051 AC 3) dengan DuckDB sungguhan: data hasil ingest dipecah menjadi satu
 * segmen per periode (raw + typed `_period`), total sama dikurangi baris yang dibuang eksplisit, `_row`
 * unik, rencana yang ditinjau harus sama persis, acuan basi → gagal tanpa sisa. Atur ulang (T-qqyx):
 * dasar = hasil atur periode sebelumnya (banyak segmen) → satuan/kolom baru sebagai kelompok bagian.
 */
const t = testRoot("period-setup");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const SETUP = "cmv4kljx40009oczvsetup0001";
const CSV = [
  "tanggal;nilai;kode",
  "2026-01-05;10;A",
  "2026-01-20;20;B",
  "2026-02-03;30;C",
  ";40;D",
  "2026-03-15;50;E",
  ";60;F",
  "2026-02-28;70;G",
].join("\n");

class FakeSetupRepo implements PeriodSetupRepo {
  status = "INGESTING";
  error: string | null = null;
  current = { activeVersionId: VID, revision: 1 };
  segments = new Map<string, NewSetupSegment>();
  sheets: (NewSetupSheet & { id: string })[] = [];
  audit: Record<string, unknown> | null = null;
  sheetMap: Record<string, string> | null = null;
  progressLog: IngestProgress[] = [];
  lineage = new Map<string, bigint>();
  /** Satuan versi yang ditulis (manifest gerbang integritas). */
  grain: PeriodGrain = "MONTH";
  /** Dasar lain (atur ulang): sheet hasil atur periode sebelumnya. */
  baseSheets: SetupSourceSheet[] | null = null;
  constructor(private readonly ingest: FakeRepo) {
    for (const s of ingest.sheets.values()) {
      const g = ingest.segments.get(s.segmentId!)!;
      this.lineage.set(s.lineageId!, g.rowBase + BigInt(g.maxSrcRow));
    }
  }
  async load(): Promise<SetupLoad> {
    if (this.baseSheets) {
      return {
        datasetId: DS,
        status: this.status,
        mode: "PERIOD_SETUP",
        base: { id: VID, sheets: this.baseSheets },
      };
    }
    const sheets = [...this.ingest.sheets.entries()].map(([id, s]) => {
      const g = this.ingest.segments.get(s.segmentId!)!;
      return {
        id,
        index: s.index,
        name: s.name,
        aliasName: null,
        lineageId: s.lineageId!,
        rawKey: g.rawKey,
        headerRow: s.headerRow,
        colCount: s.colCount,
        columns: s.columns,
        truncatedCells: 0,
        preview: null,
        rawRows: s.rawRows,
        schemaRevision: this.current.revision,
        schema: s.schema ?? null,
        typedKey: s.typedKey ?? null,
        segments: [
          {
            segmentId: g.id,
            rawKey: g.rawKey,
            typedKey: s.typedKey!,
            legacyRow: false,
            headerRow: g.headerRow,
            colCount: g.colCount,
            colMap: [],
            sourceKind: "csv" as const,
            sha256: "abc",
            originalName: "data.csv",
            dataRows: null,
          },
        ],
      };
    });
    return {
      datasetId: DS,
      status: this.status,
      mode: "PERIOD_SETUP",
      base: this.current.activeVersionId === VID ? { id: VID, sheets } : null,
    };
  }
  async begin() {
    return this.status === "INGESTING";
  }
  async alive() {
    return this.status === "INGESTING";
  }
  async progress(_v: string, p: IngestProgress) {
    this.progressLog.push(p);
  }
  async deleteAttempt() {
    const ids = [...this.segments.keys()];
    this.segments.clear();
    this.sheets = [];
    return ids;
  }
  async allocateRows(lineageId: string, span: number) {
    const base = this.lineage.get(lineageId) ?? 0n;
    this.lineage.set(lineageId, base + BigInt(span));
    return base;
  }
  async createSegment(_v: string, d: NewSetupSegment) {
    this.segments.set(d.id, d);
  }
  async writeSheets(_v: string, sheets: NewSetupSheet[]) {
    const map: Record<string, string> = {};
    this.sheets = sheets.map((s, i) => {
      map[s.from.id] = `new${i}`;
      return { ...s, id: `new${i}` };
    });
    return map;
  }
  async manifest(): Promise<ManifestSheet[]> {
    return this.sheets.map((s) => ({
      id: s.id,
      name: s.from.name,
      typedKey: s.segments[0]?.typedKey ?? null,
      periodGrain: this.grain,
      periodSource: s.periodSource,
      segments: s.segments.map((m, ordinal) => {
        const g = this.segments.get(m.segmentId)!;
        return {
          ordinal,
          rawKey: g.rawKey,
          typedKey: m.typedKey,
          rowBase: g.rowBase,
          maxSrcRow: g.maxSrcRow,
          periodKey: g.periodKey,
          periodStart: g.periodStart,
          dataRows: m.dataRows,
          groupId: g.groupId ?? null,
          groupPart: g.groupPart ?? null,
          groupSize: g.groupSize ?? null,
        };
      }),
    }));
  }
  async finish(
    _v: string,
    d: { base: { activeVersionId: string | null; sheets: { schemaRevision: number }[] } } & {
      sheetMap: Record<string, string>;
      meta: Record<string, unknown>;
    },
  ) {
    if (
      d.base.activeVersionId !== this.current.activeVersionId ||
      d.base.sheets.some((s) => s.schemaRevision !== this.current.revision)
    ) {
      return "stale" as const;
    }
    if (this.status !== "INGESTING") return "gone" as const;
    this.status = "READY";
    this.sheetMap = d.sheetMap;
    this.audit = d.meta;
    return "activated" as const;
  }
  async fail(_v: string, message: string) {
    if (this.status !== "INGESTING") return false;
    this.status = "FAILED";
    this.error = message;
    return true;
  }
  async recordCleanup() {}
}

async function setup(content = CSV) {
  const s = t.setup(t.file(`p-${Math.random().toString(36).slice(2)}.csv`, content));
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  const [sheetId] = [...s.repo.sheets.keys()];
  const sheet = s.repo.sheets.get(sheetId!)!;
  if (content === CSV) expect(sheet.schema!.find((c) => c.pos === 1)?.type).toBe("date");
  const repo = new FakeSetupRepo(s.repo);
  const job = (over: Partial<PeriodSetupJobData> = {}): PeriodSetupJobData => ({
    versionId: SETUP,
    datasetId: DS,
    baseVersionId: VID,
    grain: "MONTH",
    base: { activeVersionId: VID, sheets: [{ id: sheetId!, schemaRevision: 1 }] },
    sheets: [
      {
        sheetId: sheetId!,
        source: "COLUMN",
        column: 1,
        label: null,
        expected: {
          periods: { "2026-01-01": 2, "2026-02-01": 2, "2026-03-01": 1 },
          missing: 2,
        },
      },
    ],
    dropMissing: 2,
    actorId: "owner1",
    ip: "10.0.0.1",
    ...over,
  });
  const deps = { repo, storage: s.storage, tmpRoot: join(t.root, "tmp"), duckMemory: "256MB" };
  return { ...s, ingest: s.repo, sheetId: sheetId!, sheet, repo, job, deps };
}

async function query(sql: string): Promise<unknown[][]> {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    return (await c.runAndReadAll(sql)).getRowsJS() as unknown[][];
  } finally {
    c.closeSync();
    db.closeSync();
  }
}

const files = (storage: FakeStorage, keys: string[]) =>
  `[${keys.map((k) => `'${join(storage.dir, k).replace(/'/g, "''")}'`).join(", ")}]`;

describe("runPeriodSetup", () => {
  it("memecah data aktif menjadi satu segmen per periode; total sama dikurangi baris yang dibuang", async () => {
    const r = await setup();
    const out = await runPeriodSetup(r.job(), r.deps);
    expect(out).toEqual({ outcome: "done", sheets: 1, periods: 3 });
    expect(r.repo.status).toBe("READY");

    const segs = [...r.repo.segments.values()];
    expect(segs.map((g) => [g.periodKey, g.periodStart])).toEqual([
      ["2026-01", "2026-01-01"],
      ["2026-02", "2026-02-01"],
      ["2026-03", "2026-03-01"],
    ]);
    expect(segs.map((g) => [g.minDate, g.maxDate])).toEqual([
      ["2026-01-05 00:00:00", "2026-01-20 00:00:00"],
      ["2026-02-03 00:00:00", "2026-02-28 00:00:00"],
      ["2026-03-15 00:00:00", "2026-03-15 00:00:00"],
    ]);
    // Asal file dibawa (file identik, kartu Periode) dan rentang `_row` baru tidak bertumpuk.
    expect(segs.every((g) => g.sha256 === "abc" && g.sourceKind === "csv")).toBe(true);
    const [sheet] = r.repo.sheets;
    expect(sheet!.periodSource).toBe("COLUMN");
    expect(sheet!.periodColumn).toBe(1);
    expect(sheet!.segments.map((m) => m.dataRows)).toEqual([2, 2, 1]);
    expect(r.repo.sheetMap).toEqual({ [r.sheetId]: "new0" });

    // Isi: skema sama (tipe fisik), `_period` = awal periode, nilai sama dengan data lama minus dibuang.
    const typed = files(
      r.storage,
      sheet!.segments.map((m) => m.typedKey),
    );
    const [[n, distinct, sum, nullPeriod]] = (await query(
      `SELECT count(*), count(DISTINCT _row), sum(c2), count(*) FILTER (WHERE _period IS NULL)
       FROM read_parquet(${typed})`,
    )) as [[bigint, bigint, unknown, bigint]];
    expect([Number(n), Number(distinct), Number(sum), Number(nullPeriod)]).toEqual([5, 5, 180, 0]);
    const old = files(r.storage, [r.sheet.typedKey!]);
    const [[oldSum]] = (await query(
      `SELECT sum(c2) FROM read_parquet(${old}) WHERE c1 IS NOT NULL`,
    )) as [[unknown]];
    expect(Number(oldSum)).toBe(180);
    const byPeriod = await query(
      `SELECT strftime(_period, '%Y-%m-%d'), list(c3 ORDER BY _src_row) FROM read_parquet(${typed})
       GROUP BY 1 ORDER BY 1`,
    );
    expect(byPeriod).toEqual([
      ["2026-01-01", ["A", "B"]],
      ["2026-02-01", ["C", "G"]],
      ["2026-03-01", ["E"]],
    ]);
    // Raw segmen membawa baris judul (pilih ulang header/recast tetap bisa) + nomor baris fisik asli.
    const raws = await query(
      `SELECT _row, c1 FROM read_parquet(${files(r.storage, [segs[1]!.rawKey])}) ORDER BY _row`,
    );
    expect(raws).toEqual([
      [1, "tanggal"],
      [4, "2026-02-03"],
      [8, "2026-02-28"],
    ]);
    expect(r.repo.audit).toMatchObject({ grain: "MONTH", periods: 3, droppedRows: 2 });
  });

  it("baris tanpa tanggal valid tidak dipilih untuk dibuang → gagal, data aktif tidak berubah", async () => {
    const r = await setup();
    const out = await runPeriodSetup(r.job({ dropMissing: 0 }), r.deps);
    expect(out).toMatchObject({ outcome: "failed" });
    expect(r.repo.status).toBe("FAILED");
    expect(r.repo.error).toMatch(/belum dipilih untuk dibuang/);
    expect(r.repo.segments.size).toBe(0);
  });

  it("sebaran berbeda dengan yang ditinjau → gagal tanpa sisa objek segmen", async () => {
    const r = await setup();
    const before = r.storage.parquetKeys();
    const job = r.job();
    job.sheets[0]!.expected.periods["2026-03-01"] = 2;
    const out = await runPeriodSetup(job, r.deps);
    expect(out).toMatchObject({ outcome: "failed" });
    expect(r.repo.error).toMatch(/berbeda dengan yang ditinjau/);
    expect(r.storage.parquetKeys()).toEqual(before);
  });

  it("skema diubah sebelum aktivasi (acuan basi) → gagal dengan ajakan meninjau ulang; segmen dibersihkan", async () => {
    const r = await setup();
    const before = r.storage.parquetKeys();
    r.repo.current.revision = 2; // recast selesai setelah ditinjau
    const out = await runPeriodSetup(r.job(), r.deps);
    expect(out).toEqual({ outcome: "failed", message: SETUP_STALE_MESSAGE });
    expect(r.storage.parquetKeys()).toEqual(before);
  });

  it("versi lain aktif saat segmen sudah ditulis → finish basi, gagal, segmen percobaan dihapus", async () => {
    const r = await setup();
    const before = r.storage.parquetKeys();
    const write = r.repo.writeSheets.bind(r.repo);
    r.repo.writeSheets = async (v, sheets) => {
      const m = await write(v, sheets);
      r.repo.current.revision = 2; // koreksi skema commit di tengah job
      return m;
    };
    const out = await runPeriodSetup(r.job(), r.deps);
    expect(out).toEqual({ outcome: "failed", message: SETUP_STALE_MESSAGE });
    expect(r.repo.segments.size).toBe(0);
    expect(r.storage.parquetKeys()).toEqual(before);
  });

  it("koneksi putus setelah commit aktivasi → objek segmen versi aktif tidak dihapus", async () => {
    const r = await setup();
    const finish = r.repo.finish.bind(r.repo);
    r.repo.finish = async (v, d) => {
      await finish(v, d); // commit masuk…
      throw new Error("Connection terminated unexpectedly"); // …jawabannya hilang
    };
    const out = await runPeriodSetup(r.job(), r.deps);
    expect(out).toEqual({ outcome: "gone" });
    expect(r.repo.status).toBe("READY");
    for (const g of r.repo.segments.values()) {
      expect(await r.storage.exists(g.rawKey)).toBe(true);
    }
    for (const m of r.repo.sheets[0]!.segments) {
      expect(await r.storage.exists(m.typedKey)).toBe(true);
    }
  });

  it("periode dari typed lama tidak cocok dengan cast ulang dari raw → FAILED, segmen dibersihkan", async () => {
    const r = await setup();
    const before = r.storage.parquetKeys();
    // Typed dasar "basi": tanggal bergeser satu bulan dari isi raw (mis. cast pernah berbeda).
    const path = join(r.storage.dir, r.sheet.typedKey!);
    const shifted = `${path}.shifted`;
    await query(
      `COPY (SELECT * REPLACE (CAST(c1 + INTERVAL 1 MONTH AS DATE) AS c1) FROM read_parquet('${path}'))
       TO '${shifted}' (FORMAT parquet)`,
    );
    renameSync(shifted, path);
    const job = r.job();
    job.sheets[0]!.expected.periods = { "2026-02-01": 2, "2026-03-01": 2, "2026-04-01": 1 };
    const out = await runPeriodSetup(job, r.deps);
    expect(out).toMatchObject({ outcome: "failed" });
    expect(r.repo.error).toMatch(/2 baris tanggalnya tidak masuk periode ini/);
    expect(r.repo.status).toBe("FAILED");
    expect(r.repo.segments.size).toBe(0);
    expect(r.storage.parquetKeys()).toEqual(before);
  });

  it("sheet tanpa baris data → gagal dengan pesan, tidak ada sheet kosong yang ditulis", async () => {
    const r = await setup("tanggal;nilai;kode\n");
    const out = await runPeriodSetup(
      r.job({
        sheets: [
          {
            sheetId: r.sheetId,
            source: "LABEL",
            column: null,
            label: "2026-04-01",
            expected: { periods: {}, missing: 0 },
          },
        ],
        dropMissing: 0,
      }),
      r.deps,
    );
    expect(out).toMatchObject({ outcome: "failed" });
    expect(r.repo.error).toMatch(/tidak punya baris data/);
    expect(r.repo.sheets).toEqual([]);
  });

  it("sumber label: semua baris (termasuk tanggal kosong) masuk satu periode pilihan pemilik", async () => {
    const r = await setup();
    const out = await runPeriodSetup(
      r.job({
        sheets: [
          {
            sheetId: r.sheetId,
            source: "LABEL",
            column: null,
            label: "2026-04-01",
            expected: { periods: { "2026-04-01": 7 }, missing: 0 },
          },
        ],
        dropMissing: 0,
      }),
      r.deps,
    );
    expect(out).toEqual({ outcome: "done", sheets: 1, periods: 1 });
    const [g] = [...r.repo.segments.values()];
    expect(g).toMatchObject({ periodKey: "2026-04", minDate: null, maxDate: null });
    expect(r.repo.sheets[0]!.periodSource).toBe("LABEL");
    expect(r.repo.sheets[0]!.periodColumn).toBeNull();
  });
});

/** Hasil atur periode pertama (per bulan, 3 segmen) sebagai versi dasar atur ulang. */
async function periodSetup() {
  const r = await setup();
  expect(await runPeriodSetup(r.job(), r.deps)).toMatchObject({ outcome: "done", periods: 3 });
  const [done] = r.repo.sheets;
  const base: SetupSourceSheet = {
    ...done!.from,
    typedKey: done!.segments[0]!.typedKey,
    rawRows: done!.rawRows,
    segments: done!.segments.map((m) => {
      const g = r.repo.segments.get(m.segmentId)!;
      return {
        segmentId: g.id,
        rawKey: g.rawKey,
        typedKey: m.typedKey,
        legacyRow: false,
        headerRow: m.headerRow,
        colCount: g.colCount,
        colMap: g.colMap,
        sourceKind: g.sourceKind,
        sha256: g.sha256,
        originalName: g.originalName,
        dataRows: m.dataRows,
      };
    }),
  };
  const repo = new FakeSetupRepo(r.ingest);
  repo.lineage = new Map(r.repo.lineage);
  repo.baseSheets = [base];
  const before = r.storage.parquetKeys();
  const job = (over: Partial<PeriodSetupJobData> = {}): PeriodSetupJobData =>
    r.job({ versionId: SETUP2, baseGrain: "MONTH", grain: "QUARTER", dropMissing: 0, ...over });
  return { ...r, first: r.repo, repo, base, before, job, deps: { ...r.deps, repo } };
}

const SETUP2 = "cmv4kljx40009oczvsetup0002";

describe("runPeriodSetup — atur ulang dataset yang sudah per periode (T-qqyx)", () => {
  it("per bulan → per kuartal dari kolom: tiga segmen sumber menjadi satu kelompok lengkap; segmen lama utuh", async () => {
    const r = await periodSetup();
    r.repo.grain = "QUARTER";
    const job = r.job();
    job.sheets[0]!.expected = {
      periods: { "2026-01-01": 5 },
      missing: 0,
      parts: { "2026-01-01": 3 },
    };
    expect(await runPeriodSetup(job, r.deps)).toEqual({ outcome: "done", sheets: 1, periods: 1 });
    expect(r.repo.status).toBe("READY");
    const segs = [...r.repo.segments.values()];
    expect(segs.map((g) => [g.periodKey, g.groupId, g.groupPart, g.groupSize])).toEqual([
      ["2026-Q1", SETUP2, 1, 3],
      ["2026-Q1", SETUP2, 2, 3],
      ["2026-Q1", SETUP2, 3, 3],
    ]);
    // Rentang tanggal per bagian (pemangkasan filter) + asal file dibawa.
    expect(segs.map((g) => [g.minDate, g.maxDate])).toEqual([
      ["2026-01-05 00:00:00", "2026-01-20 00:00:00"],
      ["2026-02-03 00:00:00", "2026-02-28 00:00:00"],
      ["2026-03-15 00:00:00", "2026-03-15 00:00:00"],
    ]);
    const [sheet] = r.repo.sheets;
    expect(sheet!.periodSource).toBe("COLUMN");
    const typed = files(
      r.storage,
      sheet!.segments.map((m) => m.typedKey),
    );
    const [[n, distinct, sum, periods]] = (await query(
      `SELECT count(*), count(DISTINCT _row), sum(c2), list(DISTINCT strftime(_period, '%Y-%m-%d'))
       FROM read_parquet(${typed})`,
    )) as [[bigint, bigint, unknown, string[]]];
    expect([Number(n), Number(distinct), Number(sum), periods]).toEqual([
      5,
      5,
      180,
      ["2026-01-01"],
    ]);
    // Versi dasar tidak disentuh: semua objeknya masih ada, segmen baru di prefix baru.
    for (const k of r.before) expect(r.storage.parquetKeys()).toContain(k);
    expect(segs.every((g) => !r.base.segments.some((b) => b.rawKey === g.rawKey))).toBe(true);
  });

  it("ikuti periode sekarang ke satuan lebih besar: `_period` dibawa, sheet menjadi bersumber label", async () => {
    const r = await periodSetup();
    r.repo.grain = "YEAR";
    const job = r.job({ grain: "YEAR" });
    job.sheets[0] = {
      sheetId: r.sheetId,
      source: "LABEL",
      column: null,
      label: null,
      keep: true,
      expected: { periods: { "2026-01-01": 5 }, missing: 0, parts: { "2026-01-01": 3 } },
    };
    expect(await runPeriodSetup(job, r.deps)).toEqual({ outcome: "done", sheets: 1, periods: 1 });
    expect(r.repo.sheets[0]!.periodSource).toBe("LABEL");
    expect(r.repo.sheets[0]!.periodColumn).toBeNull();
    expect([...r.repo.segments.values()].map((g) => [g.periodKey, g.groupSize])).toEqual([
      ["2026", 3],
      ["2026", 3],
      ["2026", 3],
    ]);
  });

  it("ikuti periode sekarang ke satuan lebih kecil → gagal, data aktif tidak berubah", async () => {
    const r = await periodSetup();
    const job = r.job({ grain: "MONTH", baseGrain: "QUARTER" });
    job.sheets[0] = {
      sheetId: r.sheetId,
      source: "LABEL",
      column: null,
      label: null,
      keep: true,
      expected: { periods: { "2026-01-01": 2 }, missing: 0 },
    };
    expect(await runPeriodSetup(job, r.deps)).toMatchObject({ outcome: "failed" });
    expect(r.repo.error).toMatch(/satuan yang lebih kecil/);
    expect(r.repo.segments.size).toBe(0);
    expect(r.storage.parquetKeys()).toEqual(r.before);
  });

  it("jumlah bagian per periode berbeda dengan yang ditinjau → gagal tanpa sisa objek", async () => {
    const r = await periodSetup();
    const job = r.job();
    job.sheets[0]!.expected = {
      periods: { "2026-01-01": 5 },
      missing: 0,
      parts: { "2026-01-01": 2 },
    };
    expect(await runPeriodSetup(job, r.deps)).toMatchObject({ outcome: "failed" });
    expect(r.repo.error).toMatch(/berbeda dengan yang ditinjau/);
    expect(r.storage.parquetKeys()).toEqual(r.before);
  });
});

/* Review T-qqyx L4: segmen sumber beragam (header/peta kolom/jenis file), sumber yang sudah kelompok
 * T-060, dan satu segmen sumber yang tersebar ke beberapa periode baru (setiap periode = kelompok). */

interface SegSpec {
  kind: SourceKind;
  /** Baris raw mulai nomor 1 (judul/keterangan di atas header ikut). */
  lines: (string | null)[][];
  headerRow: number;
  /** colMap[pos-1] = kolom raw posisi kanonik pos; [] = identitas. */
  colMap: number[];
  rowBase: bigint;
  period: string;
  name: string;
}

/** Dasar atur ulang dengan segmen buatan tangan (raw + typed lewat copyTyped, seperti ingest/recast). */
async function customBase(csv: string, specs: SegSpec[]) {
  const r = await setup(csv);
  const schema = r.sheet.schema!;
  const work = mkdtempSync(join(t.root, "tmp", "seg-"));
  const duck = await openDuck({ path: join(work, "w.duckdb"), tmpDir: work, memoryLimit: "256MB" });
  const segments: SetupSourceSheet["segments"] = [];
  try {
    for (const [i, g] of specs.entries()) {
      const width = Math.max(...g.lines.map((l) => l.length));
      const values = g.lines
        .map(
          (l, k) =>
            `(${k + 1}, ${Array.from({ length: width }, (_, c) => (l[c] == null ? "NULL" : lit(l[c]!))).join(", ")})`,
        )
        .join(", ");
      const cols = Array.from({ length: width }, (_, c) => `c${c + 1}`);
      const raw = join(work, `raw-${i}.parquet`);
      const typed = join(work, `typed-${i}.parquet`);
      await duck.conn.run(
        `COPY (SELECT CAST(_row AS INTEGER) AS _row, ${cols.map((c) => `CAST(${c} AS VARCHAR) AS ${c}`).join(", ")}
               FROM (VALUES ${values}) v(_row, ${cols.join(", ")}) ORDER BY _row)
         TO ${lit(raw)} (FORMAT parquet)`,
      );
      await copyTyped(duck, {
        rawPath: raw,
        outPath: typed,
        source: g.kind,
        headerRow: g.headerRow,
        watch: async () => {},
        rowBase: g.rowBase,
        rawCols: width,
        colMap: g.colMap,
        schema,
        charsPerRow: 10,
        period: g.period,
      });
      const id = `seg${i}`;
      const rawKey = `parquet/${DS}/seg/${id}/raw.parquet`;
      const typedKey = `parquet/${DS}/seg/${id}/typed-1.parquet`;
      await r.storage.upload(rawKey, raw);
      await r.storage.upload(typedKey, typed);
      segments.push({
        segmentId: id,
        rawKey,
        typedKey,
        legacyRow: false,
        headerRow: g.headerRow,
        colCount: width,
        colMap: g.colMap,
        sourceKind: g.kind,
        sha256: `sha-${i}`,
        originalName: g.name,
        dataRows: g.lines.length - g.headerRow,
      });
    }
  } finally {
    duck.close();
    rmSync(work, { recursive: true, force: true });
  }
  const base: SetupSourceSheet = {
    id: r.sheetId,
    index: 0,
    name: r.sheet.name,
    aliasName: null,
    lineageId: r.sheet.lineageId!,
    rawKey: segments[0]!.rawKey,
    headerRow: 1,
    colCount: r.sheet.colCount,
    columns: r.sheet.columns,
    truncatedCells: 0,
    preview: null,
    rawRows: 0,
    schemaRevision: 1,
    schema,
    typedKey: segments[0]!.typedKey,
    segments,
  };
  const repo = new FakeSetupRepo(r.ingest);
  repo.lineage.set(base.lineageId, 1_000_000n);
  repo.baseSheets = [base];
  const before = r.storage.parquetKeys();
  const job = (over: Partial<PeriodSetupJobData> = {}): PeriodSetupJobData =>
    r.job({ versionId: SETUP2, baseGrain: "MONTH", dropMissing: 0, ...over });
  return { ...r, repo, base, before, job, deps: { ...r.deps, repo } };
}

/** Isi typed baru per periode: [awal, baris, sum(c2), kode urut]; plus total + `_row` unik. */
async function contents(storage: FakeStorage, keys: string[]) {
  const f = files(storage, keys);
  const per = (await query(
    `SELECT strftime(_period, '%Y-%m-%d'), count(*), sum(c2), list(c3 ORDER BY c3)
     FROM read_parquet(${f}) GROUP BY 1 ORDER BY 1`,
  )) as [string, bigint, unknown, string[]][];
  const [[n, distinct]] = (await query(
    `SELECT count(*), count(DISTINCT _row) FROM read_parquet(${f})`,
  )) as [[bigint, bigint]];
  return {
    periods: per.map(([p, c, sum, codes]) => [p, Number(c), Number(sum), codes]),
    rows: Number(n),
    unique: Number(distinct),
  };
}

const H = ["tanggal", "nilai", "kode"];

describe("runPeriodSetup — atur ulang dari segmen sumber beragam (review T-qqyx L4)", () => {
  it("csv + xlsx dengan baris judul dan peta kolom berbeda → setiap bagian memakai header/peta/jenis segmennya", async () => {
    // Segmen xlsx (parser menulis tanggal sel sebagai teks ISO): judul di baris 1, header di baris 2,
    // kolom raw berurutan kode;tanggal;nilai (colMap kanonik → raw [2, 3, 1]).
    const r = await customBase(CSV, [
      {
        kind: "csv",
        lines: [H, ["2026-01-05", "10", "A"], ["2026-01-20", "20", "B"]],
        headerRow: 1,
        colMap: [],
        rowBase: 0n,
        period: "2026-01-01",
        name: "jan.csv",
      },
      {
        kind: "xlsx",
        lines: [
          ["Laporan Februari"],
          ["kode", "tanggal", "nilai"],
          ["C", "2026-02-03", "30"],
          ["G", "2026-02-28", "70"],
        ],
        headerRow: 2,
        colMap: [2, 3, 1],
        rowBase: 100n,
        period: "2026-02-01",
        name: "feb.xlsx",
      },
      {
        kind: "csv",
        lines: [H, ["2026-03-15", "50", "E"]],
        headerRow: 1,
        colMap: [],
        rowBase: 200n,
        period: "2026-03-01",
        name: "mar.csv",
      },
    ]);
    r.repo.grain = "QUARTER";
    const job = r.job({ grain: "QUARTER" });
    job.sheets[0]!.expected = {
      periods: { "2026-01-01": 5 },
      missing: 0,
      parts: { "2026-01-01": 3 },
    };
    expect(await runPeriodSetup(job, r.deps)).toEqual({ outcome: "done", sheets: 1, periods: 1 });
    const segs = [...r.repo.segments.values()];
    expect(
      segs.map((g) => [g.headerRow, g.colMap, g.sourceKind, g.originalName, g.groupPart]),
    ).toEqual([
      [1, [], "csv", "jan.csv", 1],
      [2, [2, 3, 1], "xlsx", "feb.xlsx", 2],
      [1, [], "csv", "mar.csv", 3],
    ]);
    expect(segs[1]).toMatchObject({
      minDate: "2026-02-03 00:00:00",
      maxDate: "2026-02-28 00:00:00",
    });
    expect(r.repo.sheets[0]!.segments.map((m) => [m.headerRow, m.dataRows])).toEqual([
      [1, 2],
      [2, 2],
      [1, 1],
    ]);
    // Raw bagian xlsx membawa judul + header apa adanya, nomor baris fisik tetap.
    const raw = await query(
      `SELECT _row, c1 FROM read_parquet(${files(r.storage, [segs[1]!.rawKey])}) ORDER BY _row`,
    );
    expect(raw).toEqual([
      [1, "Laporan Februari"],
      [2, "kode"],
      [3, "C"],
      [4, "G"],
    ]);
    expect(
      await contents(
        r.storage,
        r.repo.sheets[0]!.segments.map((m) => m.typedKey),
      ),
    ).toEqual({
      periods: [["2026-01-01", 5, 180, ["A", "B", "C", "E", "G"]]],
      rows: 5,
      unique: 5,
    });
  });

  it("sumber yang sudah kelompok file T-060 (Februari = 2 file) → per kuartal: satu kelompok baru 4 bagian, tanpa baris hilang/ganda", async () => {
    const r = await customBase(CSV, [
      {
        kind: "csv",
        lines: [H, ["2026-01-05", "10", "A"]],
        headerRow: 1,
        colMap: [],
        rowBase: 0n,
        period: "2026-01-01",
        name: "jan.csv",
      },
      {
        kind: "csv",
        lines: [H, ["2026-02-03", "30", "C"]],
        headerRow: 1,
        colMap: [],
        rowBase: 100n,
        period: "2026-02-01",
        name: "feb-1.csv",
      },
      {
        kind: "csv",
        lines: [H, ["2026-02-28", "70", "G"], ["2026-02-10", "5", "K"]],
        headerRow: 1,
        colMap: [],
        rowBase: 200n,
        period: "2026-02-01",
        name: "feb-2.csv",
      },
      {
        kind: "csv",
        lines: [H, ["2026-03-15", "50", "E"]],
        headerRow: 1,
        colMap: [],
        rowBase: 300n,
        period: "2026-03-01",
        name: "mar.csv",
      },
    ]);
    r.repo.grain = "QUARTER";
    const job = r.job({ grain: "QUARTER" });
    job.sheets[0]!.expected = {
      periods: { "2026-01-01": 5 },
      missing: 0,
      parts: { "2026-01-01": 4 },
    };
    expect(await runPeriodSetup(job, r.deps)).toEqual({ outcome: "done", sheets: 1, periods: 1 });
    expect(
      [...r.repo.segments.values()].map((g) => [
        g.originalName,
        g.groupId,
        g.groupPart,
        g.groupSize,
      ]),
    ).toEqual([
      ["jan.csv", SETUP2, 1, 4],
      ["feb-1.csv", SETUP2, 2, 4],
      ["feb-2.csv", SETUP2, 3, 4],
      ["mar.csv", SETUP2, 4, 4],
    ]);
    expect(
      await contents(
        r.storage,
        r.repo.sheets[0]!.segments.map((m) => m.typedKey),
      ),
    ).toEqual({
      periods: [["2026-01-01", 5, 165, ["A", "C", "E", "G", "K"]]],
      rows: 5,
      unique: 5,
    });
    for (const k of r.before) expect(r.storage.parquetKeys()).toContain(k);
  });

  it("kolom lain: satu segmen sumber tersebar ke beberapa periode baru, setiap periode menjadi kelompok", async () => {
    // Periode sekarang dari "tanggal" (Jan / Feb); diatur ulang dari "bayar" (kolom 4) per bulan.
    const csv4 = ["tanggal;nilai;kode;bayar", "2026-01-05;10;A;2026-02-01"].join("\n");
    const H4 = ["tanggal", "nilai", "kode", "bayar"];
    const r = await customBase(csv4, [
      {
        kind: "csv",
        lines: [
          H4,
          ["2026-01-05", "10", "A", "2026-01-30"],
          ["2026-01-20", "20", "B", "2026-02-02"],
          ["2026-01-25", "1", "Z", "2026-03-01"],
        ],
        headerRow: 1,
        colMap: [],
        rowBase: 0n,
        period: "2026-01-01",
        name: "jan.csv",
      },
      {
        kind: "csv",
        lines: [
          H4,
          ["2026-02-03", "30", "C", "2026-01-31"],
          ["2026-02-28", "70", "G", "2026-02-27"],
        ],
        headerRow: 1,
        colMap: [],
        rowBase: 100n,
        period: "2026-02-01",
        name: "feb.csv",
      },
    ]);
    expect(r.base.schema!.find((c) => c.pos === 4)?.type).toBe("date");
    const job = r.job({ grain: "MONTH" });
    job.sheets[0] = {
      sheetId: r.sheetId,
      source: "COLUMN",
      column: 4,
      label: null,
      expected: {
        periods: { "2026-01-01": 2, "2026-02-01": 2, "2026-03-01": 1 },
        missing: 0,
        parts: { "2026-01-01": 2, "2026-02-01": 2, "2026-03-01": 1 },
      },
    };
    expect(await runPeriodSetup(job, r.deps)).toEqual({ outcome: "done", sheets: 1, periods: 3 });
    const sheet = r.repo.sheets[0]!;
    expect(sheet.periodColumn).toBe(4);
    // Manifest kronologis: Jan(jan, feb) · Feb(jan, feb) · Mar(jan, satu bagian tanpa kelompok).
    expect(
      sheet.segments.map((m) => {
        const g = r.repo.segments.get(m.segmentId)!;
        return [g.periodKey, g.originalName, g.groupPart ?? null, g.groupSize ?? null, m.dataRows];
      }),
    ).toEqual([
      ["2026-01", "jan.csv", 1, 2, 1],
      ["2026-01", "feb.csv", 2, 2, 1],
      ["2026-02", "jan.csv", 1, 2, 1],
      ["2026-02", "feb.csv", 2, 2, 1],
      ["2026-03", "jan.csv", null, null, 1],
    ]);
    expect(
      await contents(
        r.storage,
        sheet.segments.map((m) => m.typedKey),
      ),
    ).toEqual({
      periods: [
        ["2026-01-01", 2, 40, ["A", "C"]],
        ["2026-02-01", 2, 90, ["B", "G"]],
        ["2026-03-01", 1, 1, ["Z"]],
      ],
      rows: 5,
      unique: 5,
    });
    expect(r.repo.status).toBe("READY");
  });
});
