import { describe, expect, it } from "vitest";
import { columnNames } from "@/features/ingest/header";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  chooseHeader,
  missingSheetIssue,
  planColumns,
  planSheets,
  sameSnapshot,
  sheetIssues,
  snapshotRef,
  verdictOf,
  type ActiveSheet,
} from "@/features/ingest/refresh";
import { columnKeys } from "@/features/widgets/remap";

/* Versi refresh (T-013): pencocokan sheet/kolom ke skema aktif dan putusan cocok/menunggu pemetaan. */

const col = (pos: number, original: string, o: Partial<ColumnSchema> = {}): ColumnSchema => ({
  pos,
  name: original.trim() || `kolom_${pos}`,
  original,
  type: "text",
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
  ...o,
});
const meta = (originals: string[]) => columnNames(originals, originals.length);
const sheet = (name: string, index: number, schema: ColumnSchema[] = []): ActiveSheet => ({
  id: `s${index}`,
  name,
  index,
  headerRow: 1,
  schemaRevision: 1,
  schema,
});

describe("planSheets", () => {
  it("nama ternormalisasi (spasi/kapital); sheet baru tanpa pasangan = tambahan; sheet aktif hilang", () => {
    const active = [sheet("Penjualan", 0), sheet("Retur", 1)];
    const p = planSheets([{ name: "Stok" }, { name: "  PENJUALAN " }], active);
    expect(p.pairs.map((a) => a?.name ?? null)).toEqual([null, "Penjualan"]);
    expect(p.missing.map((a) => a.name)).toEqual(["Retur"]);
  });

  it("satu sheet ↔ satu sheet walau nama beda (CSV ↔ xlsx); tidak bila salah satunya multi-sheet", () => {
    expect(planSheets([{ name: "Sheet1" }], [sheet("CSV", 0)]).pairs[0]?.name).toBe("CSV");
    const two = planSheets([{ name: "CSV" }], [sheet("Penjualan", 0), sheet("Retur", 1)]);
    expect(two.pairs).toEqual([null]);
    expect(two.missing.map((a) => a.name)).toEqual(["Penjualan", "Retur"]);
    const extra = planSheets([{ name: "A" }, { name: "B" }], [sheet("CSV", 0)]);
    expect(extra.pairs).toEqual([null, null]);
    expect(extra.missing).toHaveLength(1);
  });
});

describe("planColumns", () => {
  it("kunci = nama asli ternormalisasi + urutan; duplikat dan judul kosong dicocokkan berurutan", () => {
    expect(columnKeys(["Total", " total ", "", "Kota", ""])).toEqual([
      "total\n1",
      "total\n2",
      "\n1",
      "kota\n1",
      "\n2",
    ]);
    // "Total" ke-1 aktif = Omzet (desimal), ke-2 = Diskon (bulat); file baru menukar urutan kolom lain.
    const active = [
      col(1, "Total", { name: "Omzet", type: "decimal", numberLocale: "id" }),
      col(2, "", { name: "Catatan" }),
      col(3, "Total", { name: "Diskon", type: "integer", numberLocale: "us" }),
      col(4, "", { name: "kolom_4", type: "integer", numberLocale: "us" }),
    ];
    const p = planColumns(meta(["", "TOTAL", "", "total"]), active);
    expect(p.missing).toEqual([]);
    expect(p.overrides).toEqual([
      {
        pos: 1,
        name: "Catatan",
        type: "text",
        numberLocale: undefined,
        dateFormat: undefined,
        hidden: false,
      },
      {
        pos: 2,
        name: "Omzet",
        type: "decimal",
        numberLocale: "id",
        dateFormat: undefined,
        hidden: false,
      },
      {
        pos: 3,
        name: "kolom_4",
        type: "integer",
        numberLocale: "us",
        dateFormat: undefined,
        hidden: false,
      },
      {
        pos: 4,
        name: "Diskon",
        type: "integer",
        numberLocale: "us",
        dateFormat: undefined,
        hidden: false,
      },
    ]);
  });

  it("koreksi user terbawa (nama, tipe, format, sembunyi); setiap kolom yang cocok membawa tipe", () => {
    const active = [
      col(1, "Tgl Kirim", { name: "Tanggal", type: "date", dateFormat: "dd/mm/yyyy" }),
      col(2, "Kode", { type: "text" }),
      col(3, "Internal", { hidden: true, type: "integer", numberLocale: "us" }),
    ];
    const p = planColumns(meta(["kode", "tgl  kirim", "INTERNAL"]), active);
    expect(p.overrides).toEqual([
      expect.objectContaining({ pos: 1, name: "Kode", type: "text", hidden: false }),
      expect.objectContaining({ pos: 2, name: "Tanggal", type: "date", dateFormat: "dd/mm/yyyy" }),
      expect.objectContaining({ pos: 3, name: "Internal", hidden: true, type: "integer" }),
    ]);
    expect(p.overrides.every((o) => o.type !== undefined)).toBe(true);
    expect([...p.matched.entries()].map(([pos, a]) => [pos, a.pos])).toEqual([
      [1, 2],
      [2, 1],
      [3, 3],
    ]);
  });

  it("kolom terlihat yang hilang dilaporkan; kolom tersembunyi yang hilang diabaikan", () => {
    const active = [col(1, "Omzet"), col(2, "Rahasia", { hidden: true }), col(3, "Kota")];
    const p = planColumns(meta(["Kota"]), active);
    expect(p.missing.map((c) => c.original)).toEqual(["Omzet"]);
  });

  it("kolom tambahan: tipe diinferensi, disembunyikan, nama tidak bentrok dengan nama yang dibawa", () => {
    // User mengganti nama tampil "Kota" → "Baru"; file baru punya kolom tambahan berjudul "baru" dan
    // kolom tanpa judul yang nama bawaannya ("kolom_4") sudah dibawa kolom aktif tanpa judul.
    const active = [col(1, "Kota", { name: "Baru" }), col(2, "", { name: "kolom_4" })];
    const p = planColumns(meta(["Kota", "baru", "", ""]), active);
    expect(p.overrides).toEqual([
      expect.objectContaining({ pos: 1, name: "Baru", type: "text" }),
      { pos: 2, name: "baru_2", hidden: true },
      expect.objectContaining({ pos: 3, name: "kolom_4", type: "text" }),
      { pos: 4, name: "kolom_4_2", hidden: true },
    ]);
    const names = p.overrides.map((o) => o.name!.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("chooseHeader", () => {
  const active = [col(1, "Kode"), col(2, "Omzet"), col(3, "Catatan", { hidden: true })];
  const fromActive = { headerRow: 2, columns: meta(["Kode", "Omzet", "Catatan"]) };
  const guessed = { headerRow: 1, columns: meta(["Bagian", "Wilayah", "Periode"]) };

  it("baris header aktif (koreksi user) dipakai bila tidak kehilangan kolom", () => {
    expect(chooseHeader([fromActive, guessed], active).headerRow).toBe(2);
  });

  it("header pindah di file baru → tebakan yang lengkap menang", () => {
    const moved = { headerRow: 3, columns: meta(["Kode", "Omzet"]) };
    const title = { headerRow: 1, columns: meta(["Laporan Oktober", "", ""]) };
    expect(chooseHeader([title, moved], active).headerRow).toBe(3);
  });

  it("semua kehilangan kolom → paling sedikit hilang; seri → baris header aktif", () => {
    const one = { headerRow: 4, columns: meta(["Kode"]) };
    expect(chooseHeader([guessed, one], active).headerRow).toBe(4);
    const other = { headerRow: 5, columns: meta(["Omzet"]) };
    expect(chooseHeader([one, other], active).headerRow).toBe(4);
  });
});

describe("sheetIssues + verdictOf", () => {
  const active = [
    col(1, "Tanggal", { type: "date", dateFormat: "dd/mm/yyyy" }),
    col(2, "omzet_rp", { name: "Omzet", type: "integer", numberLocale: "id" }),
    col(3, "Kota"),
    col(4, "Internal", { hidden: true, type: "decimal", numberLocale: "us" }),
  ];
  const schemaOf = (fails: number[]) =>
    active.map((a, i) => ({ ...a, castFailCount: fails[i] ?? 0 }));

  it("rasio lolos < 98% per kolom non-teks yang cocok (n = nilai non-kosong; n = 0 lolos)", () => {
    const plan = planColumns(meta(["Tanggal", "omzet_rp", "Kota", "Internal"]), active);
    // Tanggal 39/100 gagal → 61%; Omzet 2/100 gagal → tepat 98% lolos; Kota teks; Internal n = 0.
    const issues = sheetIssues(null, plan, schemaOf([39, 2, 0, 5]), [100, 100, 100, 0]);
    expect(issues).toEqual([
      'Kolom "Tanggal" hanya 61% nilai yang cocok dengan tipe Tanggal (dd/mm/yyyy).',
    ]);
    expect(sheetIssues(null, plan, schemaOf([0, 3]), [100, 100, 100, 100])).toEqual([
      'Kolom "Omzet" (judul di file "omzet_rp") hanya 97% nilai yang cocok dengan tipe Bilangan bulat (format 1.234).',
    ]);
  });

  it("kolom tersembunyi yang cocok tetap dicek; nama sheet disebut bila dataset multi-sheet", () => {
    const plan = planColumns(meta(["Tanggal", "omzet_rp", "Kota", "Internal"]), active);
    expect(sheetIssues("Penjualan", plan, schemaOf([0, 0, 0, 50]), [10, 10, 10, 100])).toEqual([
      'Kolom "Internal" (sheet Penjualan) hanya 50% nilai yang cocok dengan tipe Angka desimal (format 1,234.56).',
    ]);
  });

  it("kolom hilang + sheet hilang → alasan menyebut ≤ 5 masalah lalu sisanya; ≤ 500 karakter", () => {
    const plan = planColumns(meta(["Kota"]), active);
    const issues = [
      missingSheetIssue(sheet("Retur", 1)),
      ...sheetIssues("Penjualan", plan, [col(1, "Kota")], [10]),
    ];
    expect(issues).toEqual([
      'Sheet "Retur" tidak ada di file baru.',
      'Kolom "Tanggal" (sheet Penjualan) tidak ada di file baru.',
      'Kolom "Omzet" (judul di file "omzet_rp", sheet Penjualan) tidak ada di file baru.',
    ]);
    expect(verdictOf([])).toEqual({ ok: true });
    expect(verdictOf(issues)).toEqual({ ok: false, reason: issues.join(" ") });
    const many = Array.from({ length: 8 }, (_, i) => `Kolom "K${i}" tidak ada di file baru.`);
    const v = verdictOf(many);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toContain('Kolom "K4"');
      expect(v.reason).not.toContain('Kolom "K5"');
      expect(v.reason.endsWith("Dan 3 masalah lainnya.")).toBe(true);
    }
    const long = verdictOf(Array.from({ length: 5 }, () => `Kolom "${"x".repeat(200)}" hilang.`));
    expect(!long.ok && long.reason.length).toBe(500);
  });

  it("nama sangat panjang dipotong di pesan", () => {
    const a = [col(1, "A".repeat(200))];
    const [msg] = sheetIssues(null, planColumns(meta(["B"]), a), [], []);
    expect(msg!.length).toBeLessThan(100);
    expect(msg).toContain("…");
  });
});

describe("snapshot", () => {
  it("berubah bila versi aktif atau revisi skema sheet berubah", () => {
    const active = { versionId: "v1", sheets: [sheet("A", 0), sheet("B", 1)] };
    const ref = snapshotRef(active);
    expect(sameSnapshot(ref, snapshotRef(structuredClone(active)))).toBe(true);
    const edited = structuredClone(active);
    edited.sheets[1]!.schemaRevision = 2;
    expect(sameSnapshot(ref, snapshotRef(edited))).toBe(false);
    expect(sameSnapshot(ref, { ...ref, activeVersionId: "v2" })).toBe(false);
    expect(sameSnapshot(ref, { ...ref, sheets: ref.sheets.slice(0, 1) })).toBe(false);
    // Versi pertama: tetap tanpa versi aktif → sama; versi lain sempat aktif → basi.
    expect(sameSnapshot(snapshotRef(null), { activeVersionId: null, sheets: [] })).toBe(true);
    expect(sameSnapshot(snapshotRef(null), ref)).toBe(false);
  });
});
