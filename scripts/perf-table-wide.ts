/*
 * Perf halaman widget tabel LEBAR (T-011, review keamanan M1): 1 juta baris × 20 kolom teks ± 192
 * karakter (parquet dibuat langsung, row group seukuran ingest), SQL halaman yang sama dengan aplikasi
 * (buildTablePage: urut + OFFSET hanya kolom urut dan _row, isi diambil lewat _row). Bukan bagian check.
 *   npx tsx --conditions=react-server scripts/perf-table-wide.ts [jumlahBaris]
 * Keluaran: satu baris per kasus — waktu (ms), jumlah baris hasil, RSS.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { Plan } from "../src/features/query/spec";
import { buildTableCount, buildTablePage } from "../src/features/query/table";
import { QueryEngine } from "../src/lib/duckdb/engine";

const ROWS = Number(process.argv[2] ?? 1_000_000);

async function main() {
  const root = mkdtempSync(join(tmpdir(), "dd-perf-wide-"));
  const data = join(root, "data");
  mkdirSync(data);
  const file = join(data, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const cols = Array.from(
    { length: 20 },
    (_, i) => `repeat(md5((range * ${i + 7})::varchar), 6) AS c${i + 1}`,
  ).join(", ");
  await c.run(
    `COPY (SELECT range AS _row, ${cols} FROM range(${ROWS})) TO '${file}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 8738)`,
  );
  c.closeSync();
  db.closeSync();
  console.log(`parquet ${Math.round(statSync(file).size / 1e6)} MB, ${ROWS} baris`);

  const engine = await QueryEngine.create({
    dataDir: data,
    tmpDir: join(root, "tmp"),
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });
  const plan: Plan = {
    dimensions: Array.from({ length: 20 }, (_, i) => ({
      key: `d${i}`,
      col: `c${i + 1}`,
      type: "text" as const,
    })),
    measures: [],
    filters: [],
    sort: [],
    limit: 100,
    columns: [],
  };
  const last = Math.ceil(ROWS / 100) - 1;
  const count = buildTableCount(plan, file);
  let t = performance.now();
  await engine.run("u", count.sql, count.params, 30_000);
  console.log(`count(*)`.padEnd(36), Math.round(performance.now() - t), "ms");
  for (const [label, sort, page] of [
    ["tanpa urut, hal 1", null, 0],
    ["tanpa urut, hal terakhir", null, last],
    ["urut c3 turun, hal 1", { index: 2, dir: "desc" as const }, 0],
    ["urut c3 turun, hal tengah", { index: 2, dir: "desc" as const }, Math.floor(last / 2)],
    ["urut c3 turun, hal terakhir", { index: 2, dir: "desc" as const }, last],
  ] as const) {
    const b = buildTablePage(plan, sort, page, file);
    t = performance.now();
    const r = await engine.run("u", b.sql, b.params, 30_000);
    console.log(
      label.padEnd(36),
      Math.round(performance.now() - t),
      "ms",
      `baris ${r.rows.length}`,
      `rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`,
    );
  }
  engine.close();
  rmSync(root, { recursive: true, force: true });
}
void main();
