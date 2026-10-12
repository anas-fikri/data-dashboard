// SEMENTARA (dihapus setelah dipakai): pola pelebaran tabel + row group vs memori COPY (1 GB).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

async function attempt(mode: "alter" | "create", cols: number, rows: number, rg: number) {
  const dir = mkdtempSync(join(tmpdir(), "dd-wide-"));
  const db = await DuckDBInstance.create(join(dir, "w.duckdb"), {
    memory_limit: "1GB",
    threads: "2",
    temp_directory: join(dir, "t"),
  });
  const c = await db.connect();
  const t0 = performance.now();
  try {
    if (mode === "alter") {
      await c.run("CREATE TABLE s (_row INTEGER)");
      for (let i = 1; i <= cols; i++) await c.run(`ALTER TABLE s ADD COLUMN c${i} VARCHAR`);
    } else {
      await c.run(`CREATE TABLE s (_row INTEGER, ${Array.from({ length: cols }, (_, i) => `c${i + 1} VARCHAR`).join(", ")})`);
    }
    const a = await c.createAppender("s");
    for (let r = 1; r <= rows; r++) {
      a.appendInteger(r);
      for (let k = 0; k < cols; k++) a.appendVarchar(`nilai ${r}-${k}`);
      a.endRow();
    }
    a.flushSync();
    a.closeSync();
    await c.run("SET threads=1");
    await c.run(`COPY (SELECT * FROM s ORDER BY _row) TO '${join(dir, "o.parquet")}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${rg})`);
    return `ok ${Math.round(performance.now() - t0)} ms maxRSS ${Math.round(process.resourceUsage().maxRSS / 1024)}`;
  } catch (e) {
    return `ERR ${String(e).slice(0, 80)}`;
  } finally {
    c.closeSync();
    db.closeSync();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, cols, rows, rg] = process.argv.slice(2);
  console.log(mode, cols, rows, rg, await attempt(mode as "alter" | "create", Number(cols), Number(rows), Number(rg)));
}
void main();
