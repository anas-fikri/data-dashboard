/*
 * Perf ingest tahap raw (T-006, D9): file fixture → runIngest (parser + DuckDB sungguhan) dengan
 * database palsu in-memory dan storage lokal (hard link, tanpa salinan 1 GB). Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-ingest.ts tests/fixtures/perf/teks-berat-1gb.xlsx
 * Keluaran: satu baris JSON (waktu dinding, waktu CPU, puncak RSS kernel, baris/kolom per sheet,
 * ukuran raw.parquet, sisa disk minimum selama proses).
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
      datasetId: "perf",
      sourceKey: `raw/perf/v/source.${file!.endsWith(".csv") ? "csv" : "xlsx"}`,
    }),
    begin: async () => true,
    exists: async () => true,
    progress: async () => {},
    deleteSheets: async () => {},
    createSheet: async (_v, s) => {
      sheets.push(s);
      return `s${s.index}`;
    },
    setSheetKey: async () => {},
    finishRaw: async () => true,
    fail: async (_v, m) => {
      console.error("FAILED:", m);
    },
  };
  const storage: IngestStorage = {
    download: async (_k, dest) => {
      linkSync(file!, dest);
      const hash = createHash("sha256");
      for await (const c of createReadStream(dest)) hash.update(c as Buffer);
      return { sha256: hash.digest("hex"), bytes: statSync(dest).size };
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
  const r = await runIngest("v", repo, storage, { tmpRoot: tmp });
  const cpu = process.cpuUsage(c0);
  clearInterval(disk);
  const parquetMB =
    sheets.reduce(
      (n, s) => n + statSync(join(store, `parquet/perf/v/s${s.index}/raw.parquet`)).size,
      0,
    ) / 1048576;
  console.log(
    JSON.stringify({
      file: file!.split("/").pop(),
      fileMB: Math.round(statSync(file!).size / 1048576),
      outcome: r,
      seconds: Math.round((performance.now() - t0) / 100) / 10,
      cpuSeconds: Math.round((cpu.user + cpu.system) / 1e5) / 10,
      maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
      sheets: sheets.map((s) => ({
        name: s.name,
        rawRows: s.rawRows,
        colCount: s.colCount,
        headerRow: s.headerRow,
        truncated: s.truncatedCells,
      })),
      parquetMB: Math.round(parquetMB),
      minFreeDiskGB: Math.round(minFree * 10) / 10,
    }),
  );
  rmSync(root, { recursive: true, force: true });
}

void main();
