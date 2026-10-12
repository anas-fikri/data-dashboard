import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest } from "@/features/ingest/ingest";
import { decide, type Profile } from "@/features/ingest/infer";
import { buildXlsx, readParquet, testRoot, VID } from "./fakes";

/* Inferensi tipe + typed-1.parquet (T-007), end-to-end lewat runIngest (parser + DuckDB sungguhan). */
const t = testRoot("ingest-typed");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

async function ingest(path: string) {
  const s = t.setup(path);
  const r = await runIngest(VID, s.repo, s.storage, s.opts);
  expect(r).toEqual({ outcome: "done", sheets: 1 });
  const sheet = s.repo.byIndex()[0]!;
  const rows = await readParquet(join(s.storage.dir, sheet.typedKey!));
  const col = (name: string) => {
    const c = sheet.schema!.find((x) => x.name === name);
    if (!c) throw new Error(`kolom ${name} tidak ada`);
    return { ...c, values: rows.map((r) => r[c.pos]) };
  };
  return { sheet, rows, col, repo: s.repo };
}

const csv = (header: string[], rows: string[][]) =>
  `${[header, ...rows].map((r) => r.join(";")).join("\n")}\n`;
const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("AC 1: ambang 98% non-kosong", () => {
  it("99% angka desimal + 1% teks → DECIMAL, castFailCount = jumlah teks; 90% → teks", async () => {
    const a = range(100, (i) => (i === 50 ? "n/a" : `${i}.5`));
    const b = range(100, (i) => (i % 10 === 0 ? "kosong" : String(i)));
    const { col, sheet, repo } = await ingest(
      t.file(
        "ambang.csv",
        csv(
          ["harga", "campur"],
          a.map((x, i) => [x, b[i]!]),
        ),
      ),
    );
    expect(repo.status).toBe("READY");
    expect(sheet.schemaRevision).toBe(1);
    const harga = col("harga");
    expect(harga).toMatchObject({ type: "decimal", numberLocale: "us", castFailCount: 1 });
    expect(harga.values[0]).toBe(0.5);
    expect(harga.values[50]).toBeNull();
    expect(col("campur")).toMatchObject({ type: "text", castFailCount: 0 });
    expect(col("campur").values[0]).toBe("kosong");
  });
});

describe("AC 2: bilangan bulat vs boolean", () => {
  it("hanya 0/1 → bilangan bulat; ya/tidak → boolean", async () => {
    const { col } = await ingest(
      t.file(
        "bool.csv",
        csv(
          ["aktif", "lunas"],
          range(40, (i) => [String(i % 2), i % 3 ? "Ya" : "tidak"]),
        ),
      ),
    );
    const aktif = col("aktif");
    expect(aktif.type).toBe("integer");
    expect(aktif.values.slice(0, 2)).toEqual([0n, 1n]);
    const lunas = col("lunas");
    expect(lunas.type).toBe("boolean");
    expect(lunas.values.slice(0, 2)).toEqual([false, true]);
  });
});

describe("AC 3: locale angka per kolom", () => {
  it("'1.234.567,89' → ID 1234567.89; '1234.5' → US 1234.5", async () => {
    const { col } = await ingest(
      t.file(
        "locale.csv",
        csv(
          ["omzet", "berat"],
          range(20, (i) => [`1.234.56${i % 10},89`, `123${i}.5`]),
        ),
      ),
    );
    const omzet = col("omzet");
    expect(omzet).toMatchObject({ type: "decimal", numberLocale: "id", castFailCount: 0 });
    expect(omzet.values[9]).toBe(1234569.89);
    const berat = col("berat");
    expect(berat).toMatchObject({ type: "decimal", numberLocale: "us" });
    expect(berat.values[0]).toBe(1230.5);
  });

  it("angka asli xlsx berbentuk kanonik: 1.234 tetap desimal (bukan ribuan ID)", async () => {
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>berat</t></is></c></row>`;
    for (let r = 2; r <= 21; r++) xml += `<row r="${r}"><c r="A${r}"><v>1.234</v></c></row>`;
    const { col } = await ingest(t.file("kanonik.xlsx", await buildXlsx([{ name: "S", xml }])));
    expect(col("berat")).toMatchObject({ type: "decimal", numberLocale: "us" });
    expect(col("berat").values[0]).toBe(1.234);
  });
});

describe("AC 4: tanggal tanpa pergeseran zona", () => {
  it("sel tanggal xlsx asli dan teks '03/01/2026' → DATE 2026-01-03", async () => {
    const serial = (Date.UTC(2026, 0, 3) - Date.UTC(1899, 11, 30)) / 86_400_000;
    let xml =
      `<row r="1"><c r="A1" t="inlineStr"><is><t>tgl_asli</t></is></c>` +
      `<c r="B1" t="inlineStr"><is><t>tgl_teks</t></is></c></row>`;
    for (let r = 2; r <= 11; r++) {
      xml +=
        `<row r="${r}"><c r="A${r}" s="1"><v>${serial}</v></c>` +
        `<c r="B${r}" t="inlineStr"><is><t>03/01/2026</t></is></c></row>`;
    }
    const { col } = await ingest(
      t.file("tanggal.xlsx", await buildXlsx([{ name: "S", xml }], { dateStyle: true })),
    );
    for (const name of ["tgl_asli", "tgl_teks"]) {
      const c = col(name);
      expect(c.type).toBe("date");
      expect(c.castFailCount).toBe(0);
      expect((c.values[0] as Date).toISOString().slice(0, 10)).toBe("2026-01-03");
    }
    expect(col("tgl_asli").dateFormat).toBe("yyyy-mm-dd");
    expect(col("tgl_teks").dateFormat).toBe("dd/mm/yyyy");
  });

  it("kolom campuran: sel tanggal asli + teks 'dd/mm/yyyy' + teks ISO → satu kolom DATE", async () => {
    const serial = (Date.UTC(2026, 0, 3) - Date.UTC(1899, 11, 30)) / 86_400_000;
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>tgl</t></is></c></row>`;
    for (let r = 2; r <= 31; r++) {
      const cell =
        r % 3 === 0
          ? `<c r="A${r}" s="1"><v>${serial}</v></c>`
          : r % 3 === 1
            ? `<c r="A${r}" t="inlineStr"><is><t>04/01/2026</t></is></c>`
            : `<c r="A${r}" t="inlineStr"><is><t>2026-01-05</t></is></c>`;
      xml += `<row r="${r}">${cell}</row>`;
    }
    const { col } = await ingest(
      t.file("campur-tgl.xlsx", await buildXlsx([{ name: "S", xml }], { dateStyle: true })),
    );
    const c = col("tgl");
    expect(c).toMatchObject({ type: "date", dateFormat: "dd/mm/yyyy", castFailCount: 0 });
    expect(
      [...new Set(c.values.map((v) => (v as Date).toISOString().slice(0, 10)))].sort(),
    ).toEqual(["2026-01-03", "2026-01-04", "2026-01-05"]);
  });

  it("jam selain 00:00 → TIMESTAMP naive", async () => {
    const { col } = await ingest(
      t.file(
        "waktu.csv",
        csv(
          ["waktu"],
          range(10, (i) => [`1${i}/01/2026 07:3${i}`]),
        ),
      ),
    );
    expect(col("waktu").type).toBe("timestamp");
    expect((col("waktu").values[1] as Date).toISOString()).toBe("2026-01-11T07:31:00.000Z");
  });
});

describe("kasus pelengkap", () => {
  it("kode bernol-depan dan ≥ 16 digit tetap teks", async () => {
    const { col } = await ingest(
      t.file(
        "kode.csv",
        csv(
          ["hp", "nik"],
          range(10, (i) => [`08123${i}`, `320101010101000${i}`]),
        ),
      ),
    );
    expect(col("hp")).toMatchObject({ type: "text" });
    expect(col("hp").values[0]).toBe("081230");
    expect(col("nik")).toMatchObject({ type: "text" });
  });

  it("durasi Excel ([h]:mm, diubah parser menjadi tanggal 1899-12-3x) → detik", async () => {
    const { col } = await ingest(
      t.file(
        "durasi.csv",
        csv(
          ["lama"],
          range(5, () => ["1899-12-31T12:00:00"]),
        ),
      ),
    );
    expect(col("lama")).toMatchObject({ type: "duration", castFailCount: 0 });
    expect(col("lama").values[0]).toBe(129_600n);
  });

  it("statistik: nullPct dan distinctCount; header ikut nama tampil + asli", async () => {
    const { col, rows } = await ingest(
      t.file(
        "stat.csv",
        csv(
          ["Kota", "Nilai"],
          range(10, (i) => [i < 5 ? "Bandung" : "Bogor", i < 8 ? String(i) : ""]),
        ),
      ),
    );
    expect(rows).toHaveLength(10);
    expect(col("Nilai")).toMatchObject({ type: "integer", nullPct: 0.2, distinctCount: 8 });
    expect(col("Kota")).toMatchObject({ original: "Kota", distinctCount: 2, hidden: false });
  });
});

describe("decide (unit)", () => {
  const base: Profile = {
    col: "c1",
    n: 0,
    distinct: 0,
    code: 0,
    idStrong: 0,
    usStrong: 0,
    idWeak: 0,
    intUs: 0,
    decUs: 0,
    intId: 0,
    decId: 0,
    date: {
      "yyyy-mm-dd": 0,
      "dd/mm/yyyy": 0,
      "dd-mm-yyyy": 0,
      "dd.mm.yyyy": 0,
      "yyyy/mm/dd": 0,
      "mm/dd/yyyy": 0,
    },
    time: {
      "yyyy-mm-dd": 0,
      "dd/mm/yyyy": 0,
      "dd-mm-yyyy": 0,
      "dd.mm.yyyy": 0,
      "yyyy/mm/dd": 0,
      "mm/dd/yyyy": 0,
    },
    duration: 0,
    bool: 0,
  };

  it("kolom kosong → teks", () => {
    expect(decide(undefined, "csv")).toEqual({ type: "text" });
    expect(decide(base, "csv")).toEqual({ type: "text" });
  });

  it("CSV '1.234' (ambigu) → ID; xlsx → US", () => {
    const p = { ...base, n: 10, idWeak: 10, intId: 10, decId: 10, decUs: 10 };
    expect(decide(p, "csv")).toEqual({ type: "integer", numberLocale: "id" });
    expect(decide(p, "xlsx")).toEqual({ type: "decimal", numberLocale: "us" });
  });

  it("seri tanggal dd/mm vs mm/dd → hari di depan", () => {
    const p = {
      ...base,
      n: 10,
      date: { ...base.date, "dd/mm/yyyy": 10, "mm/dd/yyyy": 10 },
    };
    expect(decide(p, "csv")).toEqual({ type: "date", dateFormat: "dd/mm/yyyy" });
  });
});
