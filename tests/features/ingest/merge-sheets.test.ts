import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest, type IngestOptions } from "@/features/ingest/ingest";
import {
  columnsKey,
  isContinuation,
  markContinuations,
  MERGE_NEEDS_MAPPING,
  sheetGroups,
} from "@/features/ingest/merge-sheets";
import type { ActiveSnapshot } from "@/features/ingest/refresh";
import { buildXlsx, readParquet, testRoot, VID } from "./fakes";

/*
 * Gabungkan sheet berkolom sama (T-0gmm): parser + DuckDB sungguhan, repo/storage palsu. Satu sheet
 * logis, satu segmen per sheet asal (manifest ordinal 0..n-1), tipe dari gabungan profil, `_row` unik.
 */
const t = testRoot("ingest-merge");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const PARALLEL: Partial<IngestOptions> = { sheetThreads: 3, parallelMinSheetBytes: 0 };
const cell = (v: string) => `<c t="inlineStr"><is><t>${v}</t></is></c>`;
const header = (r: number, names: string[]) => `<row r="${r}">${names.map(cell).join("")}</row>`;

/** Baris data `from..from+n-1` (Kode teks, Nilai angka, Catatan teks), judul di baris `head`. */
function sheetXml(opts: {
  names?: string[];
  head?: number;
  from: number;
  n: number;
  /** Nilai teks di kolom Nilai baris data pertama (uji tipe gabungan). */
  textValue?: string;
}) {
  const head = opts.head ?? 1;
  const out = [
    ...(head > 1 ? [`<row r="1">${cell("Laporan pengiriman")}</row>`] : []),
    header(head, opts.names ?? ["Kode", "Nilai", "Catatan"]),
  ];
  for (let i = 0; i < opts.n; i++) {
    const r = head + 1 + i;
    const k = opts.from + i;
    const nilai = i === 0 && opts.textValue ? cell(opts.textValue) : `<c><v>${k * 3}</v></c>`;
    out.push(`<row r="${r}">${cell(`K-${k}`)}${nilai}${cell(`baris ${k}`)}</row>`);
  }
  return out.join("");
}

async function book() {
  return t.file(
    `gabung-${Math.random().toString(36).slice(2)}.xlsx`,
    await buildXlsx([
      { name: "Jan", xml: sheetXml({ from: 1, n: 300 }) },
      { name: "Rute", xml: sheetXml({ names: ["Asal", "Tujuan", "Jarak"], from: 1, n: 5 }) },
      // Judul beda besar/kecil + spasi, dan baris judul di baris 2 (ada judul laporan di atasnya).
      {
        name: "Feb",
        xml: sheetXml({ names: ["kode", "NILAI ", "Catatan"], head: 2, from: 301, n: 200 }),
      },
    ]),
  );
}

describe("sheetGroups (murni)", () => {
  const rec = (names: string[]) => ({
    colCount: names.length,
    columns: names.map((n, i) => ({ pos: i + 1, name: n || `kolom_${i + 1}`, original: n })),
  });
  it("judul sama (abaikan huruf besar/spasi) → satu kelompok urut kemunculan; tanpa gabung → sendiri", () => {
    const recs = [
      rec(["A", "B"]),
      rec(["X"]),
      rec([" a ", "b"]),
      rec(["A", "B", "C"]),
      rec(["A", "B"]),
    ];
    expect(sheetGroups(recs, true)).toEqual([[0, 2, 4], [1], [3]]);
    expect(sheetGroups(recs, false)).toEqual([[0], [1], [2], [3], [4]]);
  });
  it("sheet tanpa kolom tidak pernah digabung", () => {
    const empty = { colCount: 0, columns: [] };
    expect(columnsKey(empty)).toBeNull();
    expect(sheetGroups([empty, empty], true)).toEqual([[0], [1]]);
  });
});

/** Baris data tanpa judul (lanjutan ekspor terpecah): baris 1 langsung data. */
function bareXml(from: number, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = from + i;
    out.push(
      `<row r="${i + 1}">${cell(`K-${k}`)}<c><v>${k * 3}</v></c>${cell(`baris ${k}`)}</row>`,
    );
  }
  return out.join("");
}

describe("v1.19.1: sheet lanjutan tanpa judul (murni)", () => {
  const cols = (...n: string[]) =>
    n.map((original, i) => ({ pos: i + 1, name: original, original }));
  const rec = (
    headerRow: number,
    rows: (string | null)[][],
    names = ["Kode", "Nilai", "Catatan"],
  ) => ({
    colCount: 3,
    headerRow,
    columns: cols(...names),
    preview: { rows: rows.map((cells, i) => ({ row: i + 1, cells })) },
  });
  const leader = rec(1, [
    ["Kode", "Nilai", "Catatan"],
    ["K-1", "3", "baris 1"],
  ]);

  it("baris pertama data dengan jenis nilai cocok → lanjutan; memakai judul leader, headerRow 0, berantai", () => {
    const c2 = rec(1, [["K-9", "27", "baris 9"]], ["K-9", "27", "baris 9"]);
    const c3 = rec(1, [["K-10", "30", "baris 10"]], ["K-10", "30", "baris 10"]);
    expect(isContinuation(leader, c2)).toBe(true);
    const recs = [structuredClone(leader), c2, c3];
    expect([...markContinuations(recs)]).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(recs[1]!.headerRow).toBe(0);
    expect(recs[2]!.columns.map((c) => c.original)).toEqual(["Kode", "Nilai", "Catatan"]);
    expect(sheetGroups(recs, true)).toEqual([[0, 1, 2]]);
  });

  it("bukan lanjutan: punya judul sendiri, jumlah kolom beda, atau jenis nilai tidak cocok", () => {
    const titled = rec(1, [
      ["Kode", "Nilai", "Catatan"],
      ["K-1", "3", "x"],
    ]);
    expect(isContinuation(leader, titled)).toBe(false);
    const other = rec(1, [["Asal", "Tujuan", "Jarak"]], ["Asal", "Tujuan", "Jarak"]);
    expect(isContinuation(leader, other)).toBe(false); // teks di kolom angka
    expect(isContinuation(leader, { ...rec(1, [["K-1", "3", "x", "y"]]), colCount: 4 })).toBe(
      false,
    );
  });
});

describe("ingest: gabungkan sheet berkolom sama", () => {
  it("dua sheet berkolom sama → satu sheet, dua segmen berurutan; sheet lain tetap terpisah", async () => {
    const s = t.setup(await book());
    s.repo.mergeSheets = true;
    const r = await runIngest(VID, s.repo, s.storage, s.opts);
    expect(r).toEqual({ outcome: "done", sheets: 2 });
    expect(s.repo.status).toBe("READY");

    const [jan, rute] = s.repo.byIndex();
    expect([jan!.name, rute!.name]).toEqual(["Jan", "Rute"]);
    // rawRows sheet gabungan = jumlah raw semua sheet asal (judul + data; Feb punya judul laporan).
    expect(jan!.rawRows).toBe(301 + 202);
    const man = (await s.repo.manifest())!;
    const janMan = man.find((m) => m.name === "Jan")!;
    expect(janMan.segments.map((g) => g.ordinal)).toEqual([0, 1]);
    expect(man.find((m) => m.name === "Rute")!.segments).toHaveLength(1);

    // Segmen kedua: baris judul sendiri (2), nama asal menyebut sheet, rowBase setelah segmen pertama.
    const [g0, g1] = janMan.segments.map((g) =>
      [...s.repo.segments.values()].find((x) => x.rawKey === g.rawKey)!,
    );
    expect(g0!.headerRow).toBe(1);
    expect(g1!.headerRow).toBe(2);
    expect(g0!.originalName).toBe("data.xlsx (sheet Jan)");
    expect(g1!.originalName).toBe("data.xlsx (sheet Feb)");
    expect(g1!.rowBase).toBe(g0!.rowBase + BigInt(g0!.maxSrcRow));
    // Sheet tunggal tetap memakai nama file versi (originalName tidak diisi ingest).
    expect([...s.repo.segments.values()].filter((x) => !x.originalName)).toHaveLength(1);

    // Typed: semua baris data dua sheet, `_row` unik dan naik, kolom bertipe sama (Nilai bulat).
    const rows = (
      await Promise.all(janMan.segments.map((g) => readParquet(join(s.storage.dir, g.typedKey))))
    ).flat();
    expect(rows).toHaveLength(500);
    const ids = rows.map((x) => x[0] as number);
    expect(new Set(ids).size).toBe(500);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(rows[0]!.slice(1)).toEqual(["K-1", 3n, "baris 1"]);
    expect(rows.at(-1)!.slice(1)).toEqual(["K-500", 1500n, "baris 500"]);
    const nilai = jan!.schema!.find((c) => c.pos === 2)!;
    expect(nilai.type).toBe("integer");
    expect(nilai.name).toBe("Nilai");
    // Statistik skema = gabungan (500 baris terisi).
    expect(nilai.nonEmpty).toBe(500);
  });

  it("tipe ditentukan dari gabungan: teks di sheet kedua membuat kolom tidak lagi bulat murni", async () => {
    const fx = t.file(
      "gabung-tipe.xlsx",
      await buildXlsx([
        { name: "A", xml: sheetXml({ from: 1, n: 5 }) },
        { name: "B", xml: sheetXml({ from: 6, n: 5, textValue: "tidak ada" }) },
      ]),
    );
    const merged = t.setup(fx);
    merged.repo.mergeSheets = true;
    expect(await runIngest(VID, merged.repo, merged.storage, merged.opts)).toEqual({
      outcome: "done",
      sheets: 1,
    });
    const sheet = merged.repo.byIndex()[0]!;
    const one = t.setup(
      t.file("tanpa-teks.xlsx", await buildXlsx([{ name: "A", xml: sheetXml({ from: 1, n: 5 }) }])),
    );
    await runIngest(VID, one.repo, one.storage, one.opts);
    // Skema gabungan memuat profil sheet B (1 gagal cast / teks) — beda dengan sheet A sendiri.
    const g = sheet.schema!.find((c) => c.pos === 2)!;
    const a = one.repo.byIndex()[0]!.schema!.find((c) => c.pos === 2)!;
    expect(g.nonEmpty).toBe(10);
    expect(a.nonEmpty).toBe(5);
    expect(a.type).toBe("integer");
    // Satu nilai teks dari 10: tipe tetap bulat dengan 1 gagal cast, atau berubah teks — bukan diam-diam
    // bulat tanpa gagal (artinya profil sheet B diabaikan).
    expect(g.type === "integer" ? g.castFailCount : 1).toBe(1);
  });

  it("v1.19.1: sheet lanjutan tanpa judul → digabung, semua barisnya data dengan judul sheet pertama", async () => {
    const file = t.file(
      `lanjut-${Math.random().toString(36).slice(2)}.xlsx`,
      await buildXlsx([
        { name: "os invoice", xml: sheetXml({ from: 1, n: 300 }) },
        { name: "os invoice(2)", xml: bareXml(301, 250) },
        { name: "os invoice(3)", xml: bareXml(551, 50) },
      ]),
    );
    const s = t.setup(file);
    s.repo.mergeSheets = true;
    const r = await runIngest(VID, s.repo, s.storage, s.opts);
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    const [inv] = s.repo.byIndex();
    expect(inv!.name).toBe("os invoice");
    expect(inv!.schema!.map((c) => c.name)).toEqual(["Kode", "Nilai", "Catatan"]);
    const man = (await s.repo.manifest())!;
    const rows = (
      await Promise.all(man[0]!.segments.map((g) => readParquet(join(s.storage.dir, g.typedKey))))
    ).flat();
    // Baris pertama sheet lanjutan adalah data (tidak dibuang sebagai judul).
    expect(rows).toHaveLength(600);
    expect(rows.map((x) => x[1])).toContain("K-301");
    expect(rows.map((x) => x[1])).toContain("K-551");
  });

  it("tanpa pilihan gabung → perilaku lama (tiga sheet terpisah)", async () => {
    const s = t.setup(await book());
    expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 3 });
    expect(s.repo.byIndex().map((x) => x.name)).toEqual(["Jan", "Rute", "Feb"]);
    expect([...s.repo.segments.values()].every((x) => !x.originalName)).toBe(true);
  });

  it("paralel = berurutan (metadata + typed byte-per-byte)", async () => {
    const fx = await book();
    const one = async (extra: Partial<IngestOptions>) => {
      const s = t.setup(fx);
      s.repo.mergeSheets = true;
      const r = await runIngest(VID, s.repo, s.storage, { ...s.opts, ...extra });
      const man = (await s.repo.manifest())!;
      return {
        r,
        meta: s.repo
          .byIndex()
          .map(({ rawKey: _r, typedKey: _t, segmentId: _g, lineageId: _l, ...x }) => x),
        typed: man.flatMap((m) =>
          m.segments.map((g) => readFileSync(join(s.storage.dir, g.typedKey))),
        ),
      };
    };
    const seq = await one({});
    const par = await one(PARALLEL);
    expect(par.r).toEqual(seq.r);
    expect(par.meta).toEqual(seq.meta);
    expect(par.typed).toHaveLength(seq.typed.length);
    par.typed.forEach((b, i) => expect(b.equals(seq.typed[i]!)).toBe(true));
  }, 60_000);

  it("versi refresh gabungan yang butuh pemetaan → FAILED dengan saran, tanpa objek tersisa", async () => {
    const first = t.setup(await book());
    first.repo.mergeSheets = true;
    await runIngest(VID, first.repo, first.storage, first.opts);
    const sh = first.repo.byIndex();
    // Data aktif punya sheet "Lain" yang tidak ada di file baru → tidak cocok (butuh pemetaan).
    const active: ActiveSnapshot = {
      versionId: "aktif0000000000000001",
      sheets: [
        ...sh.map((x, i) => ({
          id: `sheetaktif0000000000${i}`,
          name: x.name,
          index: x.index,
          headerRow: x.headerRow,
          schemaRevision: 1,
          schema: x.schema!,
          lineageId: x.lineageId!,
        })),
        {
          id: "sheetaktif00000000009",
          name: "Lain",
          index: 9,
          headerRow: 1,
          schemaRevision: 1,
          schema: sh[1]!.schema!,
          lineageId: "lineageLain",
        },
      ],
    } as ActiveSnapshot;
    const s = t.setup(await book());
    s.repo.mergeSheets = true;
    s.repo.active = active;
    const r = await runIngest(VID, s.repo, s.storage, s.opts);
    expect(r).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toContain(MERGE_NEEDS_MAPPING);
    expect(s.repo.status).toBe("FAILED");
    expect(s.storage.parquetKeys()).toEqual([]);
  });

  it("data aktif lama dengan sheet terpisah → unggah tergabung aktif; sheet anggota lama dipetakan ke sheet gabungan", async () => {
    const first = t.setup(await book());
    await runIngest(VID, first.repo, first.storage, first.opts);
    const sh = first.repo.byIndex();
    expect(sh.map((x) => x.name)).toEqual(["Jan", "Rute", "Feb"]);
    const active = {
      versionId: "aktif0000000000000001",
      sheets: sh.map((x, i) => ({
        id: `sheetaktif0000000000${i}`,
        name: x.name,
        index: x.index,
        headerRow: x.headerRow,
        schemaRevision: 1,
        schema: x.schema!,
        lineageId: x.lineageId!,
      })),
    } as ActiveSnapshot;
    const s = t.setup(await book());
    s.repo.mergeSheets = true;
    s.repo.active = active;
    const r = await runIngest(VID, s.repo, s.storage, s.opts);
    expect(r).toEqual({ outcome: "done", sheets: 2 });
    expect(s.repo.status).toBe("READY");
    const ids = [...s.repo.sheets.keys()];
    // "Feb" bukan sheet hilang: widget-nya ikut sheet gabungan "Jan".
    expect(s.repo.sheetMap).toEqual({
      sheetaktif00000000000: ids[0],
      sheetaktif00000000001: ids[1],
      sheetaktif00000000002: ids[0],
    });
  });

  it("sheet aktif yang diserap punya kolom terlihat yang tidak ada di file → FAILED dengan saran (bukan widget rusak diam-diam)", async () => {
    const first = t.setup(await book());
    await runIngest(VID, first.repo, first.storage, first.opts);
    const sh = first.repo.byIndex();
    const feb = sh[2]!;
    const extra = { ...feb.schema![0]!, pos: 99, name: "Keterangan", original: "Keterangan" };
    const active = {
      versionId: "aktif0000000000000001",
      sheets: sh.map((x, i) => ({
        id: `sheetaktif0000000000${i}`,
        name: x.name,
        index: x.index,
        headerRow: x.headerRow,
        schemaRevision: 1,
        schema: i === 2 ? [...x.schema!, extra] : x.schema!,
        lineageId: x.lineageId!,
      })),
    } as ActiveSnapshot;
    const s = t.setup(await book());
    s.repo.mergeSheets = true;
    s.repo.active = active;
    const r = await runIngest(VID, s.repo, s.storage, s.opts);
    expect(r).toMatchObject({ outcome: "failed" });
    expect(s.repo.error).toContain(MERGE_NEEDS_MAPPING);
    expect(s.repo.error).toContain("Keterangan");
    expect(s.repo.error).toContain("Feb");
    expect(s.storage.parquetKeys()).toEqual([]);
  });

  it("versi refresh gabungan yang cocok → aktif, sheet logis dibawa dari pasangan aktif", async () => {
    const first = t.setup(await book());
    first.repo.mergeSheets = true;
    await runIngest(VID, first.repo, first.storage, first.opts);
    const sh = first.repo.byIndex();
    const active = {
      versionId: "aktif0000000000000001",
      sheets: sh.map((x, i) => ({
        id: `sheetaktif0000000000${i}`,
        name: x.name,
        index: x.index,
        headerRow: x.headerRow,
        schemaRevision: 1,
        schema: x.schema!,
        lineageId: x.lineageId!,
      })),
    } as ActiveSnapshot;
    const s = t.setup(await book());
    s.repo.mergeSheets = true;
    s.repo.active = active;
    s.repo.lineages.set(sh[0]!.lineageId!, 10_000n);
    expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 2 });
    const jan = s.repo.byIndex()[0]!;
    expect(jan.lineageId).toBe(sh[0]!.lineageId);
    const ids = [...s.repo.sheets.keys()];
    expect(s.repo.sheetMap).toEqual({
      sheetaktif00000000000: ids[0],
      sheetaktif00000000001: ids[1],
    });
    const man = (await s.repo.manifest())!;
    expect(man[0]!.segments.map((g) => g.rowBase)).toEqual([10_000n, 10_000n + 301n]);
  });
});
