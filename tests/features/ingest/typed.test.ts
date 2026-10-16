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
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>lama</t></is></c></row>`;
    for (let r = 2; r <= 6; r++) xml += `<row r="${r}"><c r="A${r}" s="2"><v>1.5</v></c></row>`;
    const { col } = await ingest(
      t.file("durasi.xlsx", await buildXlsx([{ name: "S", xml }], { dateStyle: true })),
    );
    expect(col("lama")).toMatchObject({ type: "duration", castFailCount: 0 });
    expect(col("lama").values[0]).toBe(129_600n); // 36 jam
  });

  it("T-065: tanggal Jan–Feb 1900 sama dengan Excel; seri 60 (29/02/1900 fiktif) gagal cast, bukan tanggal salah", async () => {
    const serials = [1, 59, 61, 45293, ...range(46, () => 45293), 60];
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>tgl</t></is></c></row>`;
    serials.forEach(
      (v, i) => (xml += `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${v}</v></c></row>`),
    );
    const { col } = await ingest(
      t.file("kabisat-1900.xlsx", await buildXlsx([{ name: "S", xml }], { dateStyle: true })),
    );
    const c = col("tgl");
    expect(c).toMatchObject({ type: "date", castFailCount: 1 });
    expect(c.values.slice(0, 4).map((v) => (v as Date).toISOString().slice(0, 10))).toEqual([
      "1900-01-01",
      "1900-02-28",
      "1900-03-01",
      "2024-01-02",
    ]);
    expect(c.values.at(-1)).toBeNull();
  });

  it("review T-065 INT-1: durasi bergaya tanggal (=B2-A2 mewarisi format tanggal) tetap persis, tanpa koreksi kabisat", async () => {
    const serials = [0.25, 1.5, 59.5, 60.5];
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>lama</t></is></c></row>`;
    serials.forEach(
      (v, i) => (xml += `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${v}</v></c></row>`),
    );
    const { col } = await ingest(
      t.file("durasi-tgl.xlsx", await buildXlsx([{ name: "S", xml }], { dateStyle: true })),
    );
    expect(col("lama")).toMatchObject({ type: "duration", castFailCount: 0 });
    expect(col("lama").values).toEqual(serials.map((d) => BigInt(d * 86_400)));
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

describe("regresi review T-007 (data salah diam-diam)", () => {
  it("H1: tahun 2 digit '03/01/26' → 2026-01-03 (bukan tahun 0026)", async () => {
    const { col } = await ingest(
      t.file(
        "yy.csv",
        csv(
          ["tgl"],
          range(20, () => ["03/01/26"]),
        ),
      ),
    );
    expect(col("tgl")).toMatchObject({ type: "date", dateFormat: "dd/mm/yyyy", castFailCount: 0 });
    expect((col("tgl").values[0] as Date).toISOString().slice(0, 10)).toBe("2026-01-03");
  });

  it("H2: 'dd-mm-yy' → tanggal, bukan durasi; tahun < 1000 tidak pernah diterima", async () => {
    const { col } = await ingest(
      t.file(
        "dmyy.csv",
        csv(
          ["tgl"],
          range(20, () => ["03-01-26"]),
        ),
      ),
    );
    expect(col("tgl")).toMatchObject({ type: "date", dateFormat: "dd-mm-yyyy" });
    expect((col("tgl").values[0] as Date).toISOString().slice(0, 10)).toBe("2026-01-03");
  });

  it("format bertitik dan bersambung (alias profil unik): dd.mm.yyyy dan dd-mm-yyyy", async () => {
    const { col } = await ingest(
      t.file(
        "pemisah.csv",
        csv(
          ["titik", "strip"],
          range(20, () => ["13.01.2026", "14-01-2026"]),
        ),
      ),
    );
    expect(col("titik")).toMatchObject({
      type: "date",
      dateFormat: "dd.mm.yyyy",
      castFailCount: 0,
    });
    expect(col("strip")).toMatchObject({
      type: "date",
      dateFormat: "dd-mm-yyyy",
      castFailCount: 0,
    });
    expect((col("titik").values[0] as Date).toISOString().slice(0, 10)).toBe("2026-01-13");
    expect((col("strip").values[0] as Date).toISOString().slice(0, 10)).toBe("2026-01-14");
  });

  it("H3: teks rupiah '15.000' di xlsx → ribuan ID (angka asli tidak pernah berakhir 0)", async () => {
    let xml = `<row r="1"><c r="A1" t="inlineStr"><is><t>harga</t></is></c></row>`;
    const vals = ["15.000", "120.000", "7.500", "1.250.000"];
    for (let r = 2; r <= 21; r++) {
      xml += `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${vals[r % 4]}</t></is></c></row>`;
    }
    const { col } = await ingest(t.file("rupiah.xlsx", await buildXlsx([{ name: "S", xml }])));
    expect(col("harga")).toMatchObject({ type: "integer", numberLocale: "id", castFailCount: 0 });
    expect(col("harga").values.slice(0, 4)).toEqual([7500n, 1250000n, 15000n, 120000n]);
  });

  it("M1: '0.500' bukan ribuan ID", async () => {
    const { col } = await ingest(
      t.file(
        "nol.csv",
        csv(
          ["kg"],
          range(20, (i) => [["0.500", "1.250", "2.750", "0.125"][i % 4]!]),
        ),
      ),
    );
    expect(col("kg")).toMatchObject({ type: "decimal", numberLocale: "us", castFailCount: 0 });
    expect(col("kg").values.slice(0, 4)).toEqual([0.5, 1.25, 2.75, 0.125]);
  });

  it("M3: pecahan > 6 digit dan eksponen disimpan persis (DOUBLE), bukan dibulatkan/menjadi 0", async () => {
    const { col } = await ingest(
      t.file(
        "presisi.csv",
        csv(
          ["kadar", "kecil"],
          range(10, () => ["0.0000617", "1e-7"]),
        ),
      ),
    );
    expect(col("kadar")).toMatchObject({ type: "decimal", float: true, castFailCount: 0 });
    expect(col("kadar").values[0]).toBe(0.0000617);
    expect(col("kecil")).toMatchObject({ type: "decimal", float: true });
    expect(col("kecil").values[0]).toBe(1e-7);
  });

  it("L2/L3: jam tanpa nol didepan konsisten dengan hitungan; sel spasi saja → NULL", async () => {
    const { col } = await ingest(
      t.file(
        "konsisten.csv",
        csv(
          ["waktu", "catatan"],
          range(10, (i) => [`2026-01-0${(i % 9) + 1} 1:2`, i === 0 ? "   " : `x${i}`]),
        ),
      ),
    );
    expect(col("waktu")).toMatchObject({ type: "timestamp", castFailCount: 0 });
    expect((col("waktu").values[0] as Date).toISOString()).toBe("2026-01-01T01:02:00.000Z");
    expect(col("catatan").values[0]).toBeNull();
    expect(col("catatan").nullPct).toBe(0.1);
  });
});

describe("decide (unit)", () => {
  const zero = {
    "yyyy-mm-dd": 0,
    "dd/mm/yyyy": 0,
    "dd-mm-yyyy": 0,
    "dd.mm.yyyy": 0,
    "yyyy/mm/dd": 0,
    "mm/dd/yyyy": 0,
  };
  const base: Profile = {
    col: "c1",
    n: 0,
    fict: 0,
    distinct: 0,
    chars: 0,
    code: 0,
    idStrong: 0,
    usStrong: 0,
    idWeak: 0,
    idText0: 0,
    intUs: 0,
    intId: 0,
    numUs: 0,
    numId: 0,
    wideUs: 0,
    wideId: 0,
    decUs: 0,
    decId: 0,
    serial: 0,
    date: zero,
    time: zero,
    duration: 0,
    bool: 0,
  };

  it("kolom kosong → teks", () => {
    expect(decide(undefined, "csv")).toEqual({ type: "text" });
    expect(decide(base, "csv")).toEqual({ type: "text" });
  });

  it("CSV '1.234' (ambigu) → ID; xlsx → US", () => {
    const p = { ...base, n: 10, idWeak: 10, intId: 10, numId: 10, decId: 10, numUs: 10, decUs: 10 };
    expect(decide(p, "csv")).toEqual({ type: "integer", numberLocale: "id" });
    expect(decide(p, "xlsx")).toEqual({ type: "decimal", numberLocale: "us" });
  });

  it("seri tanggal dd/mm vs mm/dd → hari di depan", () => {
    const p = { ...base, n: 10, date: { ...zero, "dd/mm/yyyy": 10, "mm/dd/yyyy": 10 } };
    expect(decide(p, "csv")).toEqual({ type: "date", dateFormat: "dd/mm/yyyy" });
  });

  it("satu nilai pecahan di antara bilangan bulat → desimal, bukan bulat dengan NULL (M2)", () => {
    const p = { ...base, n: 100, intUs: 99, numUs: 100, decUs: 100 };
    expect(decide(p, "csv")).toEqual({ type: "decimal", numberLocale: "us" });
  });

  it("pecahan > 6 digit / eksponen → disimpan DOUBLE (M3)", () => {
    const p = { ...base, n: 10, numUs: 10, decUs: 0, wideUs: 10, usStrong: 10 };
    expect(decide(p, "csv")).toEqual({ type: "decimal", numberLocale: "us", float: true });
  });

  it("kode ≤ 2% tidak menjadikan kolom angka teks; > 2% → teks (L1)", () => {
    const p = { ...base, n: 1000, code: 1, intUs: 1000, numUs: 1000, decUs: 1000 };
    expect(decide(p, "csv").type).toBe("integer");
    expect(decide({ ...p, code: 30 }, "csv").type).toBe("text");
  });

  it("durasi hanya dari xlsx (CSV '1900-01-01' tetap tanggal) (H2)", () => {
    const p = { ...base, n: 10, duration: 10, date: { ...zero, "yyyy-mm-dd": 10 } };
    expect(decide(p, "xlsx")).toEqual({ type: "duration" });
    expect(decide(p, "csv")).toEqual({ type: "date", dateFormat: "yyyy-mm-dd" });
  });
});
