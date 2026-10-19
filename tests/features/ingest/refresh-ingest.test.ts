import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  permanentMessage,
  runIngest,
  StaleSnapshotError,
  type SheetRecord,
} from "@/features/ingest/ingest";
import type { ActiveSnapshot } from "@/features/ingest/refresh";
import { buildXlsx, readParquet, testRoot, VID } from "./fakes";

/*
 * Versi refresh end-to-end (T-013, D4/A4): parser + DuckDB sungguhan, versi aktif dipalsukan dari hasil
 * ingest pertama (plus koreksi user). Cocok → aktif tanpa inferensi; tidak cocok → menunggu pemetaan;
 * skema aktif berubah di tengah → diulang.
 */
const t = testRoot("ingest-refresh");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const csv = (rows: string[][]) => `${rows.map((r) => r.join(";")).join("\n")}\n`;
const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const day = (i: number) => `${String((i % 28) + 1).padStart(2, "0")}/01/2026`;

/** Versi pertama (inferensi) → acuan aktif; `edit` meniru koreksi user di halaman skema. */
async function activeFrom(
  rows: string[][],
  edit: (c: ColumnSchema) => Partial<ColumnSchema> = () => ({}),
): Promise<ActiveSnapshot> {
  const s = t.setup(t.file(`v1-${Math.random().toString(36).slice(2)}.csv`, csv(rows)));
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  expect(s.repo.activated).toBe(true); // versi pertama langsung aktif
  const sh = s.repo.byIndex()[0]!;
  return {
    versionId: "aktif0000000000000001",
    sheets: [
      {
        id: "sheetaktif00000000001",
        name: sh.name,
        index: sh.index,
        headerRow: sh.headerRow,
        schemaRevision: 3,
        schema: sh.schema!.map((c) => ({ ...c, ...edit(c) })),
      },
    ],
  };
}

async function refresh(rows: string[][], active: ActiveSnapshot) {
  const s = t.setup(t.file(`v2-${Math.random().toString(36).slice(2)}.csv`, csv(rows)));
  s.repo.active = active;
  const run = () => runIngest(VID, s.repo, s.storage, s.opts);
  return { ...s, run, sheet: () => s.repo.byIndex()[0]! };
}

const v1Rows = [
  ["Tanggal", "Omzet", "Kode", "Catatan"],
  ...range(30, (i) => [day(i), String(1000 + i), String(i + 1), `c${i}`]),
];
/** Koreksi user: Omzet diganti nama, Kode dipaksa teks (inferensi: bulat), Catatan disembunyikan. */
const corrected = (c: ColumnSchema): Partial<ColumnSchema> =>
  c.original === "Omzet"
    ? { name: "Pendapatan" }
    : c.original === "Kode"
      ? { type: "text", numberLocale: undefined }
      : c.original === "Catatan"
        ? { hidden: true }
        : {};

describe("refresh cocok → aktif dengan skema aktif", () => {
  it("urutan/kapital/spasi berubah; koreksi user terbawa; kolom tambahan disembunyikan", async () => {
    const active = await activeFrom(v1Rows, corrected);
    expect(active.sheets[0]!.schema.find((c) => c.original === "Kode")!.type).toBe("text");
    const r = await refresh(
      [
        ["KODE", "Catatan", "  omzet ", "tanggal", "Baru"],
        ...range(30, (i) => [String(100 + i), `d${i}`, String(5000 + i), day(i), String(i)]),
      ],
      active,
    );
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(r.repo.status).toBe("READY");
    expect(r.repo.activated).toBe(true);
    const s = r.sheet();
    const by = (pos: number) => s.schema!.find((c) => c.pos === pos)!;
    expect(by(1)).toMatchObject({ name: "Kode", original: "KODE", type: "text", hidden: false });
    expect(by(2)).toMatchObject({ name: "Catatan", hidden: true });
    expect(by(3)).toMatchObject({ name: "Pendapatan", type: "integer", castFailCount: 0 });
    expect(by(4)).toMatchObject({
      name: "Tanggal",
      original: "tanggal",
      type: "date",
      dateFormat: "dd/mm/yyyy",
    });
    expect(by(5)).toMatchObject({ name: "Baru", type: "integer", hidden: true });
    // Kode tetap teks walau isinya angka (pilihan user, bukan inferensi).
    const rows = await readParquet(join(r.storage.dir, s.typedKey!));
    expect(rows[0]![1]).toBe("100");
    // Progres terakhir (setelah tahap "tipe" sheet ini) menandai cast dengan skema aktif.
    expect(r.repo.progressLog.at(-1)).toMatchObject({ stage: "simpan", refresh: true });
  });

  it("T-014: alias pasangan pemetaan sheet aktif terbawa ke sheet versi baru (rollback lintas versi)", async () => {
    const active = await activeFrom(v1Rows);
    active.sheets[0]!.aliasName = "Penjualan";
    const r = await refresh(v1Rows, active);
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(r.sheet().aliasName).toBe("Penjualan");
  });

  it("T-033: pasangan planSheets (sheet aktif → sheet versi baru) diteruskan ke finish sebagai sheetMap", async () => {
    const active = await activeFrom(v1Rows);
    const r = await refresh(v1Rows, active);
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    const [newId] = [...r.repo.sheets.keys()];
    expect(r.repo.sheetMap).toEqual({ [active.sheets[0]!.id]: newId });
    // Versi pertama (tanpa versi aktif): tidak ada pasangan.
    const first = t.setup(t.file("v1-pertama.csv", csv(v1Rows)));
    await runIngest(VID, first.repo, first.storage, first.opts);
    expect(first.repo.sheetMap).toEqual({});
  });

  it("T-033 (review T2): xlsx 2 sheet, urutan ditukar, satu berpasangan lewat alias → sheetMap per silsilah, bukan posisi", async () => {
    const xml = (n: number) =>
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Kode</t></is></c><c r="B1" t="inlineStr"><is><t>Omzet</t></is></c></row>` +
      range(
        10,
        (i) =>
          `<row r="${i + 2}"><c r="A${i + 2}"><v>${n + i}</v></c><c r="B${i + 2}"><v>${i * 3}</v></c></row>`,
      ).join("");
    const v1 = t.setup(
      t.file(
        "v1-dua.xlsx",
        await buildXlsx([
          { name: "Sales", xml: xml(1) },
          { name: "Sales 2026", xml: xml(100) },
        ]),
      ),
    );
    expect(await runIngest(VID, v1.repo, v1.storage, v1.opts)).toMatchObject({ outcome: "done" });
    const [sales, y2026] = v1.repo.byIndex();
    const active: ActiveSnapshot = {
      versionId: "aktif0000000000000001",
      sheets: [
        {
          id: "aktifsales00000000001",
          name: "Sales",
          aliasName: "Penjualan",
          index: 0,
          headerRow: sales!.headerRow,
          schemaRevision: 1,
          schema: sales!.schema!,
        },
        {
          id: "aktif2026000000000002",
          name: "Sales 2026",
          index: 1,
          headerRow: y2026!.headerRow,
          schemaRevision: 1,
          schema: y2026!.schema!,
        },
      ],
    };
    // File baru: urutan ditukar; "Penjualan" = sheet "Sales" yang dikembalikan ke nama akarnya.
    const s = t.setup(
      t.file(
        "v2-dua.xlsx",
        await buildXlsx([
          { name: "Sales 2026", xml: xml(200) },
          { name: "Penjualan", xml: xml(300) },
        ]),
      ),
    );
    s.repo.active = active;
    expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 2 });
    const idOf = (name: string) => [...s.repo.sheets].find(([, x]) => x.name === name)![0];
    expect(s.repo.sheetMap).toEqual({
      aktifsales00000000001: idOf("Penjualan"),
      aktif2026000000000002: idOf("Sales 2026"),
    });
  });

  it("kolom tersembunyi yang hilang diabaikan", async () => {
    const active = await activeFrom(v1Rows, corrected);
    const r = await refresh(
      [["Tanggal", "Omzet", "Kode"], ...range(10, (i) => [day(i), String(i), String(i)])],
      active,
    );
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(r.repo.activated).toBe(true);
  });

  it("baris header aktif (koreksi user) dipakai walau tebakan memilih baris lain", async () => {
    const active = await activeFrom(v1Rows);
    active.sheets[0]!.headerRow = 2;
    // Baris 1 juga label unik semua → tebakan memilih baris 1 (paling awal).
    const r = await refresh(
      [
        ["Bagian", "Wilayah", "Periode", "Ket"],
        ["Tanggal", "Omzet", "Kode", "Catatan"],
        ...range(10, (i) => [day(i), String(i), String(i), "x"]),
      ],
      active,
    );
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    const s = r.sheet();
    expect(s.headerRow).toBe(2);
    expect(s.columns.map((c) => c.original)).toEqual(["Tanggal", "Omzet", "Kode", "Catatan"]);
    expect(s.schema!.find((c) => c.original === "Omzet")).toMatchObject({
      type: "integer",
      castFailCount: 0,
    });
  });

  it("header pindah di file baru (judul di atas) → baris tebakan yang lengkap dipakai", async () => {
    const active = await activeFrom(v1Rows);
    const r = await refresh(
      [
        ["Laporan Oktober", "", "", ""],
        ["Tanggal", "Omzet", "Kode", "Catatan"],
        ...range(10, (i) => [day(i), String(i), String(i), "x"]),
      ],
      active,
    );
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(r.sheet().headerRow).toBe(2);
    expect(r.repo.activated).toBe(true);
  });
});

describe("refresh tidak cocok → menunggu pemetaan (versi aktif tetap)", () => {
  it("kolom terlihat hilang → AWAITING_MAPPING dengan alasan; sheet + typed disimpan", async () => {
    const active = await activeFrom(v1Rows, corrected);
    const r = await refresh(
      [["Tanggal", "Kode", "Catatan"], ...range(10, (i) => [day(i), String(i), "x"])],
      active,
    );
    const out = await r.run();
    const reason = 'Kolom "Pendapatan" (judul di file "Omzet") tidak ada di file baru.';
    expect(out).toEqual({ outcome: "awaiting", sheets: 1, message: reason });
    expect(r.repo.status).toBe("AWAITING_MAPPING");
    expect(r.repo.error).toBe(reason);
    expect(r.repo.stage).toBe("typed");
    expect(r.repo.activated).toBe(false);
    expect(r.storage.parquetKeys().map((k) => k.split("/").at(-1))).toEqual([
      "raw.parquet",
      "typed-1.parquet",
    ]);
  });

  it("nilai yang cocok dengan tipe aktif < 98% → menunggu pemetaan", async () => {
    const active = await activeFrom(v1Rows, corrected);
    const r = await refresh(
      [
        ["Tanggal", "Omzet", "Kode", "Catatan"],
        ...range(10, (i) => [day(i), i < 4 ? "n/a" : String(i), String(i), "x"]),
      ],
      active,
    );
    const out = await r.run();
    expect(out.outcome).toBe("awaiting");
    expect(r.repo.error).toMatch(
      /^Kolom "Pendapatan" \(judul di file "Omzet"\) hanya 60% nilai yang cocok dengan tipe Bilangan bulat/,
    );
  });

  it("sheet aktif tidak ada di file baru; sheet baru tanpa pasangan diinferensi biasa", async () => {
    const base = await activeFrom(v1Rows);
    const one = base.sheets[0]!;
    const active: ActiveSnapshot = {
      ...base,
      sheets: [
        { ...one, name: "Penjualan" },
        { ...one, id: "sheetaktif00000000002", name: "Retur", index: 1 },
      ],
    };
    const r = await refresh(v1Rows, active);
    const out = await r.run();
    expect(out.outcome).toBe("awaiting");
    expect(r.repo.error).toBe(
      'Sheet "Penjualan" tidak ada di file baru. Sheet "Retur" tidak ada di file baru.',
    );
    expect(r.repo.progressLog.some((p) => p.refresh)).toBe(false);
    expect(r.sheet().schema!.every((c) => !c.hidden)).toBe(true);
  });
});

describe("skema aktif berubah selama cast", () => {
  it("finish basi → error sementara (diulang BullMQ); percobaan ulang memakai acuan baru", async () => {
    expect(permanentMessage(new StaleSnapshotError())).toBeNull();
    const active = await activeFrom(v1Rows, corrected);
    const r = await refresh(v1Rows, active);
    const create = r.repo.createSheet.bind(r.repo);
    // User menyimpan koreksi (revisi naik) saat ingest berjalan.
    r.repo.createSheet = async (v: string, rec: SheetRecord, lineageId: string) => {
      r.repo.active!.sheets[0]!.schemaRevision += 1;
      r.repo.active!.sheets[0]!.schema.find((c) => c.original === "Tanggal")!.name = "Tgl";
      return create(v, rec, lineageId);
    };
    await expect(r.run()).rejects.toBeInstanceOf(StaleSnapshotError);
    expect(r.repo.status).toBe("INGESTING");
    expect(r.repo.activated).toBe(false);

    r.repo.createSheet = create;
    expect(await r.run()).toEqual({ outcome: "done", sheets: 1 });
    expect(r.repo.activated).toBe(true);
    expect(r.sheet().schema!.find((c) => c.original === "Tanggal")!.name).toBe("Tgl");
    expect(r.repo.sheets.size).toBe(1);
  });
});
