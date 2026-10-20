import { renameSync } from "node:fs";
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
} from "@/features/ingest/period-setup";
import type { IngestProgress } from "@/features/ingest/ingest";
import type { ManifestSheet } from "@/features/versions/integrity-check";
import { DS, testRoot, VID, type FakeRepo, type FakeStorage } from "./fakes";

/*
 * Job "Atur periode" (T-051 AC 3) dengan DuckDB sungguhan: data hasil ingest dipecah menjadi satu
 * segmen per periode (raw + typed `_period`), total sama dikurangi baris yang dibuang eksplisit, `_row`
 * unik, rencana yang ditinjau harus sama persis, acuan basi → gagal tanpa sisa.
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
  constructor(private readonly ingest: FakeRepo) {
    for (const s of ingest.sheets.values()) {
      const g = ingest.segments.get(s.segmentId!)!;
      this.lineage.set(s.lineageId!, g.rowBase + BigInt(g.maxSrcRow));
    }
  }
  async load(): Promise<SetupLoad> {
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
      periodGrain: "MONTH",
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
  return { ...s, sheetId: sheetId!, sheet, repo, job, deps };
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
