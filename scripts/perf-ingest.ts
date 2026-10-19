/*
 * Perf ingest tahap raw (T-006, D9): file fixture → runIngest (parser + DuckDB sungguhan) dengan
 * database palsu in-memory dan storage lokal (hard link, tanpa salinan 1 GB). Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-ingest.ts tests/fixtures/perf/teks-berat-1gb.xlsx
 * Keluaran: satu baris JSON (waktu dinding, waktu baca, waktu CPU, puncak RSS kernel, baris/kolom per
 * sheet, ukuran raw.parquet, sisa disk minimum selama proses, digest hasil).
 * INGEST_XLSX_SHEET_THREADS (bawaan 2 seperti worker) = worker thread pembaca sheet; `digest` (SHA-256
 * metadata sheet + skema typed + isi raw/typed parquet) harus sama untuk setiap nilai (T-de1b).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  runIngest,
  type IngestRepo,
  type IngestStorage,
  type SheetRecord,
} from "../src/features/ingest/ingest";

const file = process.argv[2];
if (!file) {
  console.error("pakai: scripts/perf-ingest.ts <fixture.xlsx|csv>");
  process.exit(1);
}

const freeGB = () => {
  const out = execFileSync("df", ["-k", tmpdir()])
    .toString()
    .trim()
    .split("\n")
    .pop()!
    .split(/\s+/);
  return Number(out[3]) / 1024 / 1024;
};

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-ingest-"));
  const store = join(root, "store");
  const sheets: SheetRecord[] = [];
  const typedStart = new Map<string, number>();
  const types: Record<string, number>[] = [];
  const schemas: unknown[] = [];
  let typedSeconds = 0;
  // Tahap baca = selesai unduh (hard link + hash) → createSheet pertama (semua sheet sudah dibaca).
  let readStart = 0;
  let readSeconds = 0;
  let minFree = freeGB();
  const disk = setInterval(() => {
    const f = freeGB();
    minFree = Math.min(minFree, f);
    if (f < 1.5) {
      console.error(`berhenti: sisa disk ${f.toFixed(1)} GB`);
      rmSync(root, { recursive: true, force: true });
      process.exit(3);
    }
  }, 2_000);

  const repo: IngestRepo = {
    load: async () => ({
      datasetId: "cperfdataset0000000000000",
      sourceKey: `raw/perf/v/source.${file!.endsWith(".csv") ? "csv" : "xlsx"}`,
      active: null,
    }),
    begin: async () => true,
    exists: async () => true,
    progress: async () => {},
    deleteSheets: async () => [],
    // Gerbang integritas T-038: tanpa manifest (sheet palsu) → tidak ada yang diperiksa.
    manifest: async () => [],
    createLineage: async () => "lineage",
    allocateRows: async () => 0n,
    createSegment: async () => "segment",
    createSheet: async (_v, s) => {
      if (!sheets.length) readSeconds = (performance.now() - readStart) / 1000;
      sheets.push(s);
      typedStart.set(`s${s.index}`, performance.now());
      return `s${s.index}`;
    },
    setSheetKey: async () => {},
    // Unggah di sini hanya rename (instan): createSheet → setTyped ≈ waktu tahap typed sheet itu.
    setTyped: async (id, d) => {
      typedSeconds += (performance.now() - typedStart.get(id)!) / 1000;
      schemas.push(d.schema);
      const counts: Record<string, number> = {};
      for (const c of d.schema) counts[c.type] = (counts[c.type] ?? 0) + 1;
      types.push(counts);
    },
    finish: async () => "activated",
    recordCleanup: async () => {},
    fail: async (_v, m) => {
      console.error("FAILED:", m);
    },
  };
  const storage: IngestStorage = {
    exists: async () => true,
    download: async (_k, dest) => {
      linkSync(file!, dest);
      const hash = createHash("sha256");
      for await (const c of createReadStream(dest)) hash.update(c as Buffer);
      const sha256 = hash.digest("hex");
      readStart = performance.now();
      return { sha256, bytes: statSync(dest).size };
    },
    upload: async (key, path) => {
      const dest = join(store, key);
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(path, dest);
    },
    deletePrefix: async () => 0,
  };

  const tmp = join(root, "work");
  mkdirSync(tmp);
  const t0 = performance.now();
  const c0 = process.cpuUsage();
  const sheetThreads = Number(process.env.INGEST_XLSX_SHEET_THREADS ?? 2);
  const r = await runIngest("v", repo, storage, { tmpRoot: tmp, sheetThreads });
  const cpu = process.cpuUsage(c0);
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  // Sebelum digest: membaca parquet untuk hash menambah buffer eksternal yang belum di-GC.
  const maxRssMB = Math.round(process.resourceUsage().maxRSS / 1024);
  clearInterval(disk);
  const sizeMB = (name: string) =>
    sheets.reduce(
      (n, s) => n + statSync(join(store, `parquet/perf/v/s${s.index}/${name}`)).size,
      0,
    ) / 1048576;
  const parquetMB = sizeMB("raw.parquet");
  const typedMB = r.outcome === "done" ? sizeMB("typed-1.parquet") : 0;
  const digest = createHash("sha256").update(JSON.stringify({ sheets, schemas }));
  for (const s of sheets) {
    for (const name of ["raw.parquet", "typed-1.parquet"]) {
      const path = join(store, `parquet/perf/v/s${s.index}/${name}`);
      if (r.outcome === "done")
        for await (const c of createReadStream(path)) digest.update(c as Buffer);
    }
  }
  console.log(
    JSON.stringify({
      file: file!.split("/").pop(),
      fileMB: Math.round(statSync(file!).size / 1048576),
      outcome: r,
      sheetThreads,
      seconds,
      readSeconds: Math.round(readSeconds * 10) / 10,
      cpuSeconds: Math.round((cpu.user + cpu.system) / 1e5) / 10,
      maxRssMB,
      sheets: sheets.map((s) => ({
        name: s.name,
        rawRows: s.rawRows,
        colCount: s.colCount,
        headerRow: s.headerRow,
        truncated: s.truncatedCells,
      })),
      parquetMB: Math.round(parquetMB),
      typedMB: Math.round(typedMB),
      typedSeconds: Math.round(typedSeconds * 10) / 10,
      types,
      minFreeDiskGB: Math.round(minFree * 10) / 10,
      digest: digest.digest("hex"),
    }),
  );
  rmSync(root, { recursive: true, force: true });
}

void main();
