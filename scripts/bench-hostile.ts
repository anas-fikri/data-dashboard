/*
 * Uji ketahanan parser xlsx terhadap fixture berbahaya (T-005):
 *   npx tsx scripts/bench-hostile.ts <direktori berisi doctype.xlsx & zipbomb.xlsx>
 * Setiap (parser × file) dijalankan di proses anak dengan batas waktu 120 s.
 * Hasil: ditolak (error), selesai (berapa sel + puncak RSS), atau timeout.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { duckdbParser } from "./bench/parser-duckdb";
import { exceljsParser } from "./bench/parser-exceljs";
import { createSaxParser } from "./bench/parser-sax";
import type { Parser } from "./bench/types";

const parsers: Record<string, Parser> = {
  exceljs: exceljsParser,
  duckdb: duckdbParser,
  sax: createSaxParser(),
};

async function child(parserName: string, file: string) {
  let peak = process.memoryUsage().rss;
  const t = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 50);
  const tmp = mkdtempSync(join(tmpdir(), "dd-hostile-"));
  const t0 = performance.now();
  let cells = 0;
  let longest = 0;
  let outcome = "selesai";
  let detail = "";
  try {
    await parsers[parserName]!.parse(
      file,
      { sheetNames: ["Sheet1"], tmpDir: tmp },
      (_s, _r, vals) => {
        for (const v of vals) {
          if (v !== null && v !== undefined) {
            cells++;
            longest = Math.max(longest, String(v).length);
          }
        }
      },
    );
  } catch (e) {
    outcome = "ditolak";
    detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 160) : String(e);
  }
  clearInterval(t);
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      outcome,
      detail,
      cells,
      longestValue: longest,
      seconds: Math.round((performance.now() - t0) / 100) / 10,
      peakRssMB: Math.round(Math.max(peak, process.memoryUsage().rss) / 1048576),
    }),
  );
  process.exit(0);
}

function parent(dir: string) {
  const rows: Record<string, unknown>[] = [];
  for (const file of ["doctype.xlsx", "zipbomb.xlsx"]) {
    for (const p of Object.keys(parsers)) {
      const r = spawnSync(
        process.execPath,
        [...process.execArgv, __filename, "--child", p, join(dir, file)],
        { encoding: "utf8", timeout: 120_000 },
      );
      const line = r.stdout.trim().split("\n").pop() ?? "";
      let res: Record<string, unknown>;
      try {
        res = JSON.parse(line) as Record<string, unknown>;
      } catch {
        res = {
          outcome: r.error ? "timeout/crash" : "crash",
          detail: (r.error?.message ?? r.stderr).slice(0, 160),
        };
      }
      rows.push({ file, parser: p, ...res });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  }
}

const i = process.argv.indexOf("--child");
if (i >= 0) void child(process.argv[i + 1]!, process.argv[i + 2]!);
else parent(process.argv[2] ?? "tests/fixtures/hostile");
