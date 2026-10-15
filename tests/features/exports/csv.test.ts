import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csvHeader, neutraliseCsv, quoteCsv, writeCsv } from "@/features/exports/csv";
import { openExportDuck } from "@/features/exports/job";
import { buildExportCount, buildExportSql, exportColumns } from "@/features/exports/sql";
import { resolveWidget, type ResolvedWidget } from "@/features/query/service";
import type { Duck } from "@/lib/duckdb";
import {
  NOTES,
  OWNER,
  ROWS,
  WID,
  aktifOf,
  cabangOf,
  durasiOf,
  fakeQueryRepo,
  omzetOf,
  parseCsv,
  tanggalOf,
  waktuOf,
  writeFixtureParquet,
} from "./fixtures";

/*
 * T-017 E3/E4/AC1/AC5: CSV lewat DuckDB sungguhan (COPY ke direktori kerja + header/BOM dari Node). Isi
 * dibandingkan dengan nilai yang dihitung uji dari fungsi pembangkit fixture yang sama.
 */

let work: string;
let src: string;
let duck: Duck;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "dd-export-csv-"));
  src = join(work, "typed.parquet");
  await writeFixtureParquet(src);
  duck = await openExportDuck(work);
});
afterAll(() => {
  duck?.close();
  rmSync(work, { recursive: true, force: true });
});

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const ts = (d: Date) =>
  `${ymd(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const hms = (s: number) =>
  `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const neutral = (s: string | null) => (s === null ? null : /^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

async function resolved(
  name: string,
  body: Parameters<typeof resolveWidget>[1] = { page: 0 },
): Promise<ResolvedWidget> {
  const repo = fakeQueryRepo();
  const w = await repo.widget(OWNER, WID(name));
  const r = await resolveWidget(w!, body, { repo, now: () => new Date("2026-03-15T05:00:00Z") });
  if (!r.ok) throw new Error(r.message);
  return r;
}

let seq = 0;
async function csvOf(r: ResolvedWidget, maxRows = 1_000_000) {
  const out = join(work, `out-${++seq}.csv`);
  const rows = await writeCsv(
    duck.conn,
    buildExportSql(r, src, "csv", maxRows),
    exportColumns(r),
    join(work, `body-${seq}.csv`),
    out,
  );
  return { rows, text: readFileSync(out, "utf8") };
}

describe("netralisasi + header CSV", () => {
  it("awalan ' untuk = + - @ tab CR; angka/teks biasa tidak berubah; header dikutip + BOM", () => {
    expect(["=1", "+1", "-1", "@a", "\tx", "\ry", "a=1", " =1", ""].map(neutraliseCsv)).toEqual([
      "'=1",
      "'+1",
      "'-1",
      "'@a",
      "'\tx",
      "'\ry",
      "a=1",
      " =1",
      "",
    ]);
    expect(quoteCsv('a "b", c')).toBe('"a ""b"", c"');
    expect(csvHeader(["Cabang", '=HYPERLINK("x")', "@Catatan"])).toBe(
      '\uFEFF"Cabang","\'=HYPERLINK(""x"")","\'@Catatan"\n',
    );
  });
});

describe("CSV tabel lewat DuckDB", () => {
  it("AC1: persis baris terfilter, urutan layar (Omzet turun, lalu _row), header nama tampil", async () => {
    const r = await resolved("table", {
      page: 0,
      dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 1"] }],
      sort: { column: 2, dir: "desc" },
    });
    const { rows, text } = await csvOf(r);
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = parseCsv(text.slice(1));
    expect(lines[0]).toEqual([
      "Cabang",
      "Omzet",
      "Tanggal",
      "Waktu",
      "Aktif",
      "Durasi",
      "'@Catatan",
    ]);
    const idx = Array.from({ length: ROWS }, (_, i) => i)
      .filter((i) => cabangOf(i) === "Cabang 1")
      .sort((a, b) => omzetOf(b) - omzetOf(a) || a - b);
    expect(rows).toBe(idx.length);
    expect(lines.length - 1).toBe(idx.length);
    expect(lines.slice(1)).toEqual(
      idx.map((i) => {
        const aktif = aktifOf(i);
        const d = durasiOf(i);
        return [
          cabangOf(i),
          String(omzetOf(i)),
          ymd(tanggalOf(i)),
          ts(waktuOf(i)),
          aktif === null ? null : aktif ? "TRUE" : "FALSE",
          d === null ? null : hms(d),
          neutral(NOTES[i % 12]!),
        ];
      }),
    );
  });

  it("AC5 + tipe: teks berawalan formula diberi ', NULL kosong, '' tetap \"\", desimal tanpa nol", async () => {
    const r = await resolved("table");
    const { rows, text } = await csvOf(r);
    expect(rows).toBe(ROWS);
    const lines = parseCsv(text.slice(1)).slice(1);
    // Urutan file (_row) tanpa urutan layar.
    expect(lines.slice(0, 12).map((l) => l[6])).toEqual([
      "'=1+1",
      "'+62812",
      "'-5",
      "'@SUM(A1)",
      "'\ttab",
      "'\rcr",
      "biasa",
      null,
      "",
      "a,b",
      'kutip "x"',
      "baris\nbaru",
    ]);
    expect(lines[0]![1]).toBe("100");
    expect(lines[1]![1]).toBe("37.5");
    // Durasi 61 detik → 0:01:01; boolean NULL (i=0) → kosong.
    expect(lines[1]![5]).toBe("0:01:01");
    expect(lines[0]![4]).toBeNull();
    // Teks dengan CR/LF/koma/kutip dikutip sesuai RFC 4180 di isi mentah.
    expect(text).toContain(`"'\rcr"`);
    expect(text).toContain('"kutip ""x"""');
    // SEC-1: kolom teks selalu dikutip (juga teks biasa); angka tetap tanpa kutip.
    expect(text.split("\n")[1]).toMatch(/^"Cabang \d",100,/);
    expect(text).toContain(',"biasa"\n');
  });

  it("SEC-1: teks dengan ';' atau tab selalu dikutip (Excel id-ID tidak memecahnya jadi sel formula)", async () => {
    const out = join(work, "sec1.csv");
    const rows = await writeCsv(
      duck.conn,
      {
        sql: "SELECT d0, m0 FROM (VALUES ($a, 1), ($b, 2), ($c, 3), (NULL, 4), ('', 5)) AS t(d0, m0)",
        params: { a: "x;=1+1", b: "y\t-2", c: "@a;b" },
      },
      [
        { key: "d0", label: "Catatan", type: "text" },
        { key: "m0", label: "Jumlah", type: "integer" },
      ],
      join(work, "sec1-body.csv"),
      out,
    );
    expect(rows).toBe(5);
    expect(readFileSync(out, "utf8")).toBe(
      '﻿"Catatan","Jumlah"\n"x;=1+1",1\n"y\t-2",2\n"@a;b",3\n,4\n"",5\n',
    );
  });

  it("batas baris: LIMIT penjaga + hitungan dengan WHERE yang sama", async () => {
    const r = await resolved("table", {
      page: 0,
      dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 2"] }],
    });
    const count = buildExportCount(r, src)!;
    const n = await duck.conn.runAndReadAll(count.sql, count.params);
    expect(Number(n.getRows()[0]![0])).toBe(ROWS / 4);
    const { rows } = await csvOf(r, 7);
    expect(rows).toBe(7);
  });

  it("E6: KPI dan grafik = persis baris rencana widget (tanpa 'Lainnya')", async () => {
    const kpi = await csvOf(await resolved("kpi"));
    const total = Array.from({ length: ROWS }, (_, i) => omzetOf(i)).reduce((a, b) => a + b, 0);
    expect(parseCsv(kpi.text.slice(1))).toEqual([["Total Omzet"], [String(total)]]);

    const bar = await resolved("bar");
    expect(buildExportCount(bar, src)).toBeNull();
    const { rows, text } = await csvOf(bar);
    const sums = new Map<string, number>();
    for (let i = 0; i < ROWS; i++) sums.set(cabangOf(i), (sums.get(cabangOf(i)) ?? 0) + omzetOf(i));
    const top = [...sums].sort((a, b) => b[1] - a[1]).slice(0, 3);
    expect(rows).toBe(3);
    expect(parseCsv(text.slice(1))).toEqual([
      ["Cabang", "Total Omzet"],
      ...top.map(([k, v]) => [k, String(v)]),
    ]);
  });

  it("DuckDB ekspor tidak bisa membaca/menulis di luar direktori kerja", async () => {
    await expect(duck.conn.run("SELECT * FROM read_csv('/etc/hosts')")).rejects.toThrow(
      /Permission Error|disabled/,
    );
    await expect(
      duck.conn.run(`COPY (SELECT 1) TO '${join(tmpdir(), "dd-export-escape.csv")}'`),
    ).rejects.toThrow(/Permission Error|disabled/);
  });
});
