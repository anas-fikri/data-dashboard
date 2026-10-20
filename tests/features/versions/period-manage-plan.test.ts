import { describe, expect, it } from "vitest";
import type { PeriodLimits } from "@/features/ingest/period-plan";
import {
  LAST_PERIOD_MESSAGE,
  RETAINED_GONE,
  parsePeriodChange,
  periodChangeNote,
  periodChangeTitle,
  periodTableRows,
  removeManifest,
  restoreCandidates,
  restoreLimitMessage,
  restoreManifest,
  rollbackWarning,
  schemaSignature,
  sheetChange,
  type ManageSegment,
  type ManageSheet,
  type ManageVersion,
} from "@/features/versions/period-manage-plan";

/*
 * Kelola daftar periode (T-056) — bagian murni: manifest hapus/pulihkan, batas saat memulihkan,
 * kandidat "Pulihkan" (tersedia / skema berubah / versi lama sudah dibuang retensi), peringatan
 * rollback, baris kartu Periode, dan kalimat riwayat.
 */

const LIMITS: PeriodLimits = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * 1024 ** 3,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};

const seg = (key: string, rows: number, id = `g-${key}`): ManageSegment => ({
  typedId: `t-${id}`,
  segmentId: id,
  periodKey: key,
  periodStart: `${key}-01`,
  rows,
  bytes: 100,
});
const sheet = (lineageId: string, segments: ManageSegment[], over: Partial<ManageSheet> = {}) => ({
  sheetId: `s-${lineageId}`,
  lineageId,
  name: lineageId === "L1" ? "Kirim" : "Retur",
  schemaSig: "1:text::",
  periodSource: "COLUMN" as const,
  periodColumn: 2,
  segments,
  ...over,
});
const version = (id: string, sheets: ManageSheet[], grain: ManageVersion["grain"] = "MONTH") => ({
  id,
  grain,
  sheets,
});

const active = version("A", [
  sheet("L1", [seg("2026-01", 30), seg("2026-02", 28, "g-feb-new"), seg("2026-03", 31)]),
  sheet("L2", [seg("2026-02", 5, "r-feb-new"), seg("2026-03", 6, "r-mar")]),
]);

describe("removeManifest", () => {
  it("periode dilepas utuh dari setiap sheet; periode lain merujuk file typed yang sama", () => {
    const r = removeManifest(active, "2026-02");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.get("L1")!.map((x) => [x.periodKey, x.typedId])).toEqual([
      ["2026-01", "t-g-2026-01"],
      ["2026-03", "t-g-2026-03"],
    ]);
    expect(r.manifest.get("L2")!.map((x) => x.periodKey)).toEqual(["2026-03"]);
    expect(r.change).toMatchObject({
      kind: "REMOVE",
      key: "2026-02",
      label: "Februari 2026",
      before: { L1: 28, L2: 5 },
      after: null,
      beforeRows: 33,
      periodsAfter: 2,
    });
    expect(periodChangeNote({ ...r.change, baseVersionId: "A", sourceVersionId: null })).toBe(
      "Februari 2026 dihapus (33 baris)",
    );
  });

  it("periode terakhir ditolak (arahkan ke Ganti semua data); periode tidak ada → pesan", () => {
    const one = version("A", [sheet("L1", [seg("2026-01", 30)])]);
    expect(removeManifest(one, "2026-01")).toEqual({ ok: false, message: LAST_PERIOD_MESSAGE });
    expect(LAST_PERIOD_MESSAGE).toContain("Ganti semua data");
    expect(removeManifest(active, "2025-12")).toMatchObject({ ok: false });
    expect(removeManifest({ ...active, grain: null }, "2026-01")).toMatchObject({ ok: false });
  });
});

describe("restoreManifest", () => {
  const older = version("B", [
    sheet("L1", [seg("2026-01", 30), seg("2026-02", 40, "g-feb-old"), seg("2026-03", 31)]),
    sheet("L2", [seg("2026-02", 7, "r-feb-old"), seg("2026-03", 6, "r-mar")]),
  ]);

  it("periode yang diganti: isi lama menggantikan isi aktif di setiap sheet, periode lain tetap", () => {
    const r = restoreManifest(active, older, "2026-02");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.get("L1")!.map((x) => x.typedId)).toEqual([
      "t-g-2026-01",
      "t-g-feb-old",
      "t-g-2026-03",
    ]);
    expect(r.manifest.get("L2")!.map((x) => x.typedId)).toEqual(["t-r-feb-old", "t-r-mar"]);
    expect(r.change).toMatchObject({
      kind: "RESTORE",
      before: { L1: 28, L2: 5 },
      after: { L1: 40, L2: 7 },
      beforeRows: 33,
      afterRows: 47,
      periodsAfter: 3,
    });
    expect(periodChangeNote({ ...r.change, baseVersionId: "A", sourceVersionId: "B" })).toBe(
      "Februari 2026 dipulihkan (33 → 47 baris)",
    );
    expect(periodChangeTitle({ ...r.change, baseVersionId: "A", sourceVersionId: "B" })).toBe(
      "Pulihkan periode Februari 2026",
    );
  });

  it("periode yang dihapus kembali ke posisinya (urut periode), jumlah periode bertambah", () => {
    const removed = removeManifest(active, "2026-01");
    if (!removed.ok) throw new Error("x");
    const now = version("C", [
      sheet("L1", [seg("2026-02", 28, "g-feb-new"), seg("2026-03", 31)]),
      sheet("L2", [seg("2026-02", 5, "r-feb-new"), seg("2026-03", 6, "r-mar")]),
    ]);
    const r = restoreManifest(now, active, "2026-01");
    if (!r.ok) throw new Error(r.message);
    expect(r.manifest.get("L1")!.map((x) => x.periodKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(r.manifest.get("L2")!.map((x) => x.periodKey)).toEqual(["2026-02", "2026-03"]);
    expect(r.change).toMatchObject({ before: null, after: { L1: 30 }, periodsAfter: 3 });
    expect(periodChangeNote({ ...r.change, baseVersionId: "C", sourceVersionId: "A" })).toBe(
      "Januari 2026 dipulihkan (30 baris)",
    );
  });

  it("isi sama (segmen sama walau file typed lain), skema/satuan berbeda, atau periode tidak ada → tidak tersedia", () => {
    const recast = version("D", [
      sheet(
        "L1",
        active.sheets[0]!.segments.map((g) => ({ ...g, typedId: `${g.typedId}-r3` })),
      ),
      sheet("L2", active.sheets[1]!.segments),
    ]);
    expect(restoreManifest(active, recast, "2026-02")).toMatchObject({ ok: false, block: "SAME" });
    const otherSchema = version("E", [
      sheet("L1", older.sheets[0]!.segments, { schemaSig: "1:number::" }),
      sheet("L2", older.sheets[1]!.segments),
    ]);
    expect(restoreManifest(active, otherSchema, "2026-02")).toMatchObject({
      ok: false,
      block: "SCHEMA",
    });
    expect(restoreManifest(active, { ...older, grain: "QUARTER" }, "2026-02")).toMatchObject({
      block: "GRAIN",
    });
    expect(restoreManifest(active, older, "2025-11")).toMatchObject({ block: "MISSING" });
  });
});

describe("restoreLimitMessage", () => {
  it("memulihkan periode yang membuat jumlah periode melewati batas → ditolak (tidak pernah melepas)", () => {
    const now = version("C", [sheet("L1", [seg("2026-02", 28), seg("2026-03", 31)])]);
    const old = version("B", [sheet("L1", [seg("2026-01", 30), seg("2026-02", 28)])]);
    const keep2 = { keepPeriods: 2, onLimit: "EVICT_OLDEST" as const };
    const msg = restoreLimitMessage(now, old, "2026-01", keep2, LIMITS);
    expect(msg).toContain("di luar batas simpan 2 periode");
    const after = version("C", [sheet("L1", [seg("2026-03", 31)])]);
    expect(restoreLimitMessage(after, old, "2026-02", keep2, LIMITS)).toBeNull();
    const msg2 = restoreLimitMessage(
      version("C", [sheet("L1", [seg("2026-02", 1), seg("2026-04", 1)])]),
      version("B", [sheet("L1", [seg("2026-03", 1)])]),
      "2026-03",
      keep2,
      LIMITS,
    );
    expect(msg2).toBe(
      'Memulihkan Maret 2026 akan melewati batas simpan 2 periode. Hapus periode Februari 2026 dulu, atau ubah pengaturan "Saat batas tercapai".',
    );
  });
});

describe("restoreCandidates", () => {
  const removedNow = version("C", [
    sheet("L1", [seg("2026-02", 28, "g-feb-new"), seg("2026-03", 31)]),
    sheet("L2", [seg("2026-02", 5, "r-feb-new"), seg("2026-03", 6, "r-mar")]),
  ]);
  const src = (id: string, v: ManageVersion) => ({
    id,
    title: `${id}.xlsx`,
    at: "2026-10-20T01:00:00.000Z",
    version: v,
  });

  it("periode dari versi tersimpan terbaru yang berbeda; riwayat tanpa versi tersimpan → penjelasan", () => {
    const c = restoreCandidates(
      removedNow,
      [src("A", active)],
      [
        { key: "2026-01", start: "2026-01-01" },
        { key: "2025-12", start: "2025-12-01" },
      ],
    );
    expect(c.map((x) => [x.key, x.state, x.source?.id ?? null, x.unavailable])).toEqual([
      ["2026-01", "MISSING", "A", null],
      ["2025-12", "MISSING", null, RETAINED_GONE],
    ]);
    expect(c[0]!.source).toMatchObject({ title: "A.xlsx", rows: 30 });
  });

  it("isi lama dengan skema berbeda → aksi tidak tersedia dengan alasan; versi sama → bukan kandidat", () => {
    const schemaChanged = version("A", [
      sheet("L1", active.sheets[0]!.segments, { schemaSig: "1:number::" }),
      sheet("L2", active.sheets[1]!.segments),
    ]);
    const c = restoreCandidates(removedNow, [src("A", schemaChanged)], []);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ key: "2026-01", source: null });
    expect(c[0]!.unavailable).toContain("Tipe kolom sudah berubah");
    expect(restoreCandidates(removedNow, [src("C2", removedNow)], [])).toEqual([]);
  });
});

describe("review L1: pulihkan mengungkap perubahan per sheet", () => {
  it("sheet yang memuat periode di data aktif tapi tidak di versi asal ikut tercantum (baris dilepas)", () => {
    const src = version("B", [
      sheet("L1", [seg("2026-01", 30), seg("2026-02", 40, "g-feb-old"), seg("2026-03", 31)]),
      sheet("L2", [seg("2026-03", 6, "r-mar")]),
    ]);
    const c = restoreCandidates(
      active,
      [{ id: "B", title: "b.xlsx", at: "2026-10-20T01:00:00.000Z", version: src }],
      [],
    );
    const feb = c.find((x) => x.key === "2026-02")!;
    expect(feb.source!.sheets).toEqual([
      { name: "Kirim", before: 28, after: 40 },
      { name: "Retur", before: 5, after: null },
    ]);
    expect(feb.source!.sheets.map(sheetChange)).toEqual([
      "28 → 40 baris",
      "5 → tidak ada (baris periode ini dilepas dari sheet ini)",
    ]);
    expect(sheetChange({ before: null, after: 7 })).toBe("tidak ada → 7 baris");
  });
});

describe("rollbackWarning", () => {
  it("menyebut periode yang ikut hilang, yang kembali ke isi lama, dan yang kembali", () => {
    const target = version("B", [
      sheet("L1", [seg("2025-12", 9), seg("2026-01", 30), seg("2026-02", 40, "g-feb-old")]),
      sheet("L2", [seg("2026-02", 5, "r-feb-new")]),
    ]);
    expect(rollbackWarning(active, target)).toBe(
      "Maret 2026 ikut hilang dari data aktif. Februari 2026 kembali ke isi versi ini. Desember 2025 kembali ke data aktif. Isi sekarang tetap bisa dipulihkan selama versi aktif sekarang masih tersimpan.",
    );
    expect(rollbackWarning(active, active)).toBeNull();
    expect(rollbackWarning(active, version("R", [], null))).toContain("mode biasa");
    expect(rollbackWarning(version("R", [], null), active)).toBeNull();
  });
});

describe("kartu Periode dan catatan", () => {
  it("baris per periode (terbaru dulu): baris per sheet, file, pengunggah, tanggal terbaru", () => {
    const meta = (g: ManageSegment, file: string, by: string | null, at: string) => ({
      ...g,
      originalName: file,
      uploadedBy: by,
      createdAt: at,
    });
    const rows = periodTableRows("MONTH", [
      {
        name: "Kirim",
        segments: [
          meta(seg("2026-01", 30), "jan.xlsx", "Ana", "2026-02-01T00:00:00.000Z"),
          meta(seg("2026-02", 28), "feb.xlsx", "Ana", "2026-03-01T00:00:00.000Z"),
        ],
      },
      {
        name: "Retur",
        segments: [meta(seg("2026-02", 5), "feb.xlsx", "Budi", "2026-03-02T00:00:00.000Z")],
      },
    ]);
    expect(rows).toEqual([
      {
        key: "2026-02",
        start: "2026-02-01",
        label: "Februari 2026",
        sheets: [
          { name: "Kirim", rows: 28 },
          { name: "Retur", rows: 5 },
        ],
        rows: 33,
        files: ["feb.xlsx"],
        uploadedBy: ["Ana", "Budi"],
        uploadedAt: "2026-03-02T00:00:00.000Z",
      },
      {
        key: "2026-01",
        start: "2026-01-01",
        label: "Januari 2026",
        sheets: [{ name: "Kirim", rows: 30 }],
        rows: 30,
        files: ["jan.xlsx"],
        uploadedBy: ["Ana"],
        uploadedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("catatan perubahan bentuk lain → null (fail-closed); tanda tangan skema abaikan nama/sembunyi", () => {
    expect(parsePeriodChange({ v: 1, kind: "DROP" })).toBeNull();
    expect(parsePeriodChange(null)).toBeNull();
    const base = {
      pos: 1,
      name: "a",
      original: "a",
      type: "decimal" as const,
      hidden: false,
      nullPct: 0,
      distinctCount: 1,
      castFailCount: 0,
    };
    expect(schemaSignature([{ ...base, name: "b", hidden: true }])).toBe(schemaSignature([base]));
    expect(schemaSignature([{ ...base, numberLocale: "id" as const }])).not.toBe(
      schemaSignature([base]),
    );
  });
});

describe("T-060: periode dari kelompok file", () => {
  const part = (key: string, rows: number, p: number, size = 3, gid = "grp"): ManageSegment => ({
    ...seg(key, rows, `${gid}-${key}-${p}`),
    groupId: gid,
    groupPart: p,
    groupSize: size,
  });
  const grouped = version("OLD", [
    sheet("L1", [
      seg("2026-01", 30),
      part("2026-03", 15, 1),
      part("2026-03", 15, 2),
      part("2026-03", 10, 3),
    ]),
  ]);

  it("hapus periode kelompok: semua file kelompok dilepas, baris = jumlah semua file", () => {
    const r = removeManifest(grouped, "2026-03");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.get("L1")!.map((x) => x.periodKey)).toEqual(["2026-01"]);
    expect(r.change).toMatchObject({ beforeRows: 40, before: { L1: 40 } });
  });

  it("pulihkan periode kelompok: SEMUA file kelompok dirujuk ulang (tidak pernah sebagian), urut nomor file", () => {
    const now = version("A2", [
      sheet("L1", [seg("2026-01", 30), seg("2026-03", 31, "single-mar")]),
    ]);
    const r = restoreManifest(now, grouped, "2026-03");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.get("L1")!.map((x) => [x.periodKey, x.segmentId, x.rows])).toEqual([
      ["2026-01", "g-2026-01", 30],
      ["2026-03", "grp-2026-03-1", 15],
      ["2026-03", "grp-2026-03-2", 15],
      ["2026-03", "grp-2026-03-3", 10],
    ]);
    expect(r.change).toMatchObject({ beforeRows: 31, afterRows: 40 });
    // Batas saat memulihkan menghitung kelompok sebagai satu periode (tanpa galat "muncul dua kali").
    expect(
      restoreLimitMessage(
        now,
        grouped,
        "2026-03",
        { keepPeriods: null, onLimit: "REJECT" },
        LIMITS,
      ),
    ).toBeNull();
    // Isi sama (segmen kelompok yang sama) → tidak ada yang dipulihkan.
    expect(restoreManifest(grouped, grouped, "2026-03")).toMatchObject({
      ok: false,
      block: "SAME",
    });
  });

  it("kartu Periode: satu baris per sheet (baris dijumlah), semua nama file", () => {
    const rows = periodTableRows("MONTH", [
      {
        name: "Kirim",
        segments: [1, 2, 3].map((p) => ({
          ...part("2026-03", p === 3 ? 10 : 15, p),
          originalName: `maret-${p}.xlsx`,
          uploadedBy: "Ana",
          createdAt: "2026-10-20T00:00:00.000Z",
        })),
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rows: 40,
      sheets: [{ name: "Kirim", rows: 40 }],
      files: ["maret-1.xlsx", "maret-2.xlsx", "maret-3.xlsx"],
    });
  });
});
