/*
 * Perf unggahan periode (T-052 AC1): file April yang sama diproses (a) sebagai unggahan pertama ke
 * dataset kosong (runIngest, inferensi) dan (b) sebagai unggahan periode ke dataset Jan–Mar
 * (runPeriodIngest: cast skema aktif, hitung per periode, segmen, rencana). Syarat: (b) ≤ 1,2 × (a).
 * Database palsu in-memory + storage lokal (rename, tanpa jaringan) — mengukur kerja worker saja.
 *   npx tsx --conditions=react-server scripts/perf-period-ingest.ts [baris=300000] [ulang=3]
 * Keluaran: satu baris JSON (median detik per jalur, rasio, baris, ukuran file).
 */
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ColumnSchema } from "../src/features/ingest/infer";
import {
  runIngest,
  type IngestRepo,
  type SheetRecord,
  type TypedStorage,
} from "../src/features/ingest/ingest";
import { runPeriodIngest, type PeriodIngestRepo } from "../src/features/ingest/period-ingest";
import { decidePeriodCommit } from "../src/features/ingest/period-upload-plan";

const DS = "cperfdataset0000000000000";
const ROWS = Number(process.argv[2] ?? 300_000);
const REPEAT = Number(process.argv[3] ?? 3);
const LIMITS = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * 1024 ** 3,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};

/** CSV April deterministik: 12 kolom campuran (teks, angka id-ID, tanggal, desimal). */
function makeCsv(path: string) {
  const head = "kode;tanggal;cabang;layanan;berat;koli;tarif;diskon;status;kota;catatan;nilai";
  const lines = [head];
  for (let i = 0; i < ROWS; i++) {
    const d = String((i % 30) + 1).padStart(2, "0");
    lines.push(
      [
        `AWB${String(i).padStart(9, "0")}`,
        `2026-04-${d}`,
        `CAB${i % 37}`,
        ["REG", "YES", "ONS"][i % 3],
        `${(i % 50) + 1},${i % 10}`,
        String((i % 7) + 1),
        String(10_000 + (i % 900) * 25),
        String(i % 5),
        ["Terkirim", "Proses", "Retur"][i % 3],
        `Kota ${i % 91}`,
        i % 11 === 0 ? `catatan ${i}` : "",
        String((i * 37) % 100_000),
      ].join(";"),
    );
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function localStorage(store: string, source: string): TypedStorage {
  return {
    exists: async () => true,
    download: async (_k, dest) => {
      copyFileSync(source, dest);
      return {
        sha256: createHash("sha256").update(readFileSync(dest)).digest("hex"),
        bytes: statSync(dest).size,
      };
    },
    upload: async (key, path) => {
      const dest = join(store, key);
      mkdirSync(dirname(dest), { recursive: true });
      // Hard link (instan): pemanggil masih membaca ukuran file lokal setelah unggah.
      linkSync(path, dest);
    },
    deletePrefix: async () => 0,
    deleteObject: async () => {},
  };
}

async function baseline(root: string, file: string) {
  let schema: ColumnSchema[] = [];
  let rec: SheetRecord | null = null;
  const repo: IngestRepo = {
    load: async () => ({ datasetId: DS, sourceKey: "raw/ds/v/source.csv", active: null }),
    begin: async () => true,
    exists: async () => true,
    progress: async () => {},
    deleteSheets: async () => [],
    manifest: async () => [],
    createLineage: async () => "lineage",
    allocateRows: async () => 0n,
    createSegment: async () => "segment",
    createSheet: async (_v, s) => {
      rec = s;
      return "s0";
    },
    setSheetKey: async () => {},
    setTyped: async (_id, d) => {
      schema = d.schema;
    },
    finish: async () => "activated",
    recordCleanup: async () => {},
    fail: async (_v, m) => {
      throw new Error(m);
    },
  };
  const work = mkdtempSync(join(root, "a-"));
  const t0 = performance.now();
  const r = await runIngest("v", repo, localStorage(join(work, "store"), file), {
    tmpRoot: work,
  });
  const s = (performance.now() - t0) / 1000;
  rmSync(work, { recursive: true, force: true });
  if (r.outcome !== "done") throw new Error(JSON.stringify(r));
  return { seconds: s, schema, rec: rec! };
}

async function period(
  root: string,
  file: string,
  base: { schema: ColumnSchema[]; rec: SheetRecord },
) {
  const pos = base.schema.find((c) => c.original === "tanggal")!.pos;
  const segments = ["2026-01-01", "2026-02-01", "2026-03-01"].map((start, i) => ({
    typedId: `t${i}`,
    segmentId: `g${i}`,
    periodKey: start.slice(0, 7),
    periodStart: start,
    rows: ROWS,
    bytes: 1_000_000,
    sha256: null,
  }));
  const sheet = {
    id: "sheet",
    sheetId: "sheet",
    name: "CSV",
    aliasName: null,
    index: 0,
    headerRow: base.rec.headerRow,
    schemaRevision: 1,
    schema: base.schema,
    lineageId: "lineage",
    colCount: base.rec.colCount,
    periodSource: "COLUMN" as const,
    periodColumn: pos,
    segments,
    keys: [],
  };
  const incoming: Parameters<typeof decidePeriodCommit>[0]["incoming"] = [];
  let outcome = "";
  const repo: PeriodIngestRepo = {
    load: async () => ({
      datasetId: DS,
      sourceKey: "raw/ds/v/source.csv",
      originalName: "april.csv",
      grain: "MONTH",
      label: null,
      baseVersionId: "aktif",
      active: { versionId: "aktif", grain: "MONTH", sheets: [sheet] },
      settings: { keepPeriods: null, onLimit: "REJECT" },
    }),
    begin: async () => true,
    exists: async () => true,
    progress: async () => {},
    deleteSheets: async () => [],
    allocateRows: async () => 1_000_000n,
    createSegment: async (_v, d) => {
      incoming.push({
        typedId: `n${incoming.length}`,
        segmentId: d.id,
        lineageId: d.lineageId,
        periodKey: d.period!.key,
        periodStart: d.period!.start,
        rows: 0,
        bytes: d.rawBytes,
      });
    },
    addTyped: async (_s, t) => {
      incoming.at(-1)!.rows = t.dataRows;
      return incoming.at(-1)!.typedId;
    },
    createRawSheet: async () => {},
    awaitMapping: async (_v, d) => {
      throw new Error(d.reason);
    },
    commit: async (_v, d) => {
      const r = decidePeriodCommit({
        facts: d.facts,
        activeVersionId: "aktif",
        active: [sheet],
        incoming,
        settings: { keepPeriods: null, onLimit: "REJECT" },
        limits: LIMITS,
        include: [],
        mode: { kind: "auto", allowAuto: d.allowAuto },
      });
      outcome = r.decision;
      return r.decision === "activate"
        ? { outcome: "activated", plan: r.plan }
        : { outcome: "awaiting", plan: r.plan };
    },
    fail: async (_v, m) => {
      throw new Error(m);
    },
    recordCleanup: async () => {},
  };
  const work = mkdtempSync(join(root, "b-"));
  const t0 = performance.now();
  const r = await runPeriodIngest(
    "v",
    { repo, storage: localStorage(join(work, "store"), file), limits: LIMITS },
    { tmpRoot: work },
  );
  const s = (performance.now() - t0) / 1000;
  rmSync(work, { recursive: true, force: true });
  if (r.outcome !== "done" || outcome !== "activate") throw new Error(JSON.stringify(r));
  return s;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-period-"));
  try {
    const file = join(root, "april.csv");
    makeCsv(file);
    const a: number[] = [];
    const b: number[] = [];
    let base: Awaited<ReturnType<typeof baseline>> | null = null;
    // Bergantian (a, b, a, b, …) supaya cache disk/OS tidak menguntungkan salah satu jalur.
    for (let i = 0; i < REPEAT; i++) {
      base = await baseline(root, file);
      a.push(base.seconds);
      b.push(await period(root, file, base));
    }
    const ma = median(a);
    const mb = median(b);
    console.log(
      JSON.stringify({
        rows: ROWS,
        fileMB: Math.round((statSync(file).size / 1048576) * 10) / 10,
        emptyDatasetSeconds: a.map((x) => Math.round(x * 100) / 100),
        periodUploadSeconds: b.map((x) => Math.round(x * 100) / 100),
        medianEmpty: Math.round(ma * 100) / 100,
        medianPeriod: Math.round(mb * 100) / 100,
        ratio: Math.round((mb / ma) * 100) / 100,
        pass: mb <= ma * 1.2,
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
