import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { PeriodLimits } from "@/features/ingest/period-plan";
import {
  buildPeriodManifest,
  confirmBlocker,
  decidePeriodCommit,
  periodColumnPlan,
  periodPlanDigest,
  periodPlanSummary,
  validateColMap,
  type ActivePeriodSheet,
  type IncomingSegmentRef,
  type UploadFacts,
} from "@/features/ingest/period-upload-plan";

/*
 * Bagian murni unggahan periode (T-052): peta kolom ke posisi kanonik (divalidasi — catatan T-gcn8),
 * rencana dihitung ulang + manifest (periode lama dirujuk ulang), sidik rencana (PLAN_STALE), centang
 * wajib saat "Terapkan", dan kalimat riwayat.
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

const col = (pos: number, original: string, over: Partial<ColumnSchema> = {}): ColumnSchema => ({
  pos,
  name: original,
  original,
  type: "text",
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
  ...over,
});
const SCHEMA = [
  col(1, "kode"),
  col(2, "tanggal", { type: "date", dateFormat: "yyyy-mm-dd" }),
  col(3, "nilai", { type: "integer", numberLocale: "us" }),
];
const meta = (names: string[]) => names.map((n, i) => ({ pos: i + 1, name: n, original: n }));

describe("periodColumnPlan + validateColMap", () => {
  it("urutan sama → identitas; diurutkan ulang → peta ke posisi kanonik; kolom tambahan dihitung", () => {
    expect(periodColumnPlan(meta(["kode", "tanggal", "nilai"]), SCHEMA, 3, 2, null)).toEqual({
      colMap: [],
      issues: [],
      extra: 0,
    });
    const p = periodColumnPlan(meta(["Nilai", "baru", "KODE", "tanggal"]), SCHEMA, 3, 2, null);
    expect(p).toEqual({ colMap: [3, 4, 1], issues: [], extra: 1 });
    expect(validateColMap(p.colMap, 3, 4, "s")).toEqual([]);
  });

  it("kolom terlihat/periode hilang dan kolom kosong yang kembali → masalah pemetaan", () => {
    const hidden = [SCHEMA[0]!, { ...SCHEMA[1]!, hidden: true }, SCHEMA[2]!];
    expect(periodColumnPlan(meta(["kode", "nilai"]), hidden, 3, 2, "Data").issues).toEqual([
      'Kolom "tanggal" (sheet Data) (kolom periode) tidak ada di file baru.',
    ]);
    expect(periodColumnPlan(meta(["kode", "tanggal"]), SCHEMA, 3, 2, null).issues).toEqual([
      'Kolom "nilai" tidak ada di file baru.',
    ]);
    const absent = [...SCHEMA, col(4, "catatan", { absent: true })];
    expect(
      periodColumnPlan(meta(["kode", "tanggal", "nilai", "catatan"]), absent, 3, 2, null).issues,
    ).toEqual(['Kolom "catatan" kembali ada di file baru dan perlu dipetakan.']);
  });

  it("validateColMap menolak peta yang membuang/menggandakan data", () => {
    expect(validateColMap([], 3, 4, "s")).toEqual([
      "s: peta kolom identitas untuk 4 kolom file, 3 kolom data",
    ]);
    expect(validateColMap([1, 1, 2], 3, 3, "s")).toEqual(["s: kolom file 1 dipetakan dua kali"]);
    expect(validateColMap([1, 5, 2], 3, 3, "s")).toEqual([
      "s: peta kolom merujuk kolom file 5 di luar 1..3",
    ]);
    expect(validateColMap([1, 2], 3, 3, "s")).toEqual(["s: peta kolom 2 posisi, 3 kolom data"]);
    expect(validateColMap([0, 0, 0], 3, 3, "s")).toEqual([
      "s: tidak ada kolom file yang terpetakan",
    ]);
  });
});

// ── rencana + manifest ───────────────────────────────────────────────────────────────────────────

const L1 = "lineage1";
const L2 = "lineage2";
const seg = (lineage: string, start: string, rows: number, sha = `sha-${start}`) => ({
  typedId: `t-${lineage}-${start}`,
  segmentId: `g-${lineage}-${start}`,
  periodKey: start.slice(0, 7),
  periodStart: start,
  rows,
  bytes: rows * 10,
  sha256: sha,
});
const active = (): ActivePeriodSheet[] => [
  {
    sheetId: "s1",
    lineageId: L1,
    name: "Kirim",
    schemaRevision: 2,
    segments: [seg(L1, "2026-01-01", 100), seg(L1, "2026-02-01", 120), seg(L1, "2026-03-01", 90)],
  },
  {
    sheetId: "s2",
    lineageId: L2,
    name: "Retur",
    schemaRevision: 1,
    segments: [seg(L2, "2026-01-01", 5), seg(L2, "2026-02-01", 6)],
  },
];
const inc = (lineage: string, start: string, rows: number): IncomingSegmentRef => ({
  typedId: `n-${lineage}-${start}`,
  segmentId: `ng-${lineage}-${start}`,
  lineageId: lineage,
  periodKey: start.slice(0, 7),
  periodStart: start,
  rows,
  bytes: rows * 10,
});
const facts = (over: Partial<UploadFacts> = {}): UploadFacts => ({
  grain: "MONTH",
  source: "COLUMN",
  fileSheets: [L1],
  droppedRows: 0,
  ignoredSheets: [],
  fileSha256: "file-sha",
  ...over,
});
const decide = (
  incoming: IncomingSegmentRef[],
  mode: Parameters<typeof decidePeriodCommit>[0]["mode"],
  over: Partial<Parameters<typeof decidePeriodCommit>[0]> = {},
) =>
  decidePeriodCommit({
    facts: facts(),
    activeVersionId: "aktif1",
    active: active(),
    incoming,
    settings: { keepPeriods: null, onLimit: "REJECT" },
    limits: LIMITS,
    include: [],
    mode,
    ...over,
  });

describe("decidePeriodCommit + buildPeriodManifest", () => {
  it("murni menambah → aktif otomatis; manifest merujuk ulang file typed lama + segmen baru", () => {
    const d = decide([inc(L1, "2026-04-01", 95)], { kind: "auto", allowAuto: true });
    expect(d.decision).toBe("activate");
    if (d.decision !== "activate") return;
    expect(d.manifest.get(L1)!.map((r) => r.typedId)).toEqual([
      "t-lineage1-2026-01-01",
      "t-lineage1-2026-02-01",
      "t-lineage1-2026-03-01",
      "n-lineage1-2026-04-01",
    ]);
    // Sheet yang tidak ada di file: periode lamanya tetap, tidak ada yang baru.
    expect(d.manifest.get(L2)!.map((r) => r.typedId)).toEqual([
      "t-lineage2-2026-01-01",
      "t-lineage2-2026-02-01",
    ]);
    expect(periodPlanSummary(d.plan)).toBe("April 2026 ditambahkan (95 baris)");
  });

  it("allowAuto=false (versi dasar init berbeda) → menunggu konfirmasi walau murni menambah", () => {
    expect(decide([inc(L1, "2026-04-01", 95)], { kind: "auto", allowAuto: false }).decision).toBe(
      "await",
    );
  });

  it("mengganti periode → menunggu konfirmasi; manifest periode itu = file baru di sheet file saja", () => {
    const d = decide([inc(L1, "2026-02-01", 30)], { kind: "auto", allowAuto: true });
    expect(d.decision).toBe("await");
    if (d.decision !== "await") return;
    expect(d.plan.confirm).toEqual(["REPLACE", "SHRINK"]);
    expect(d.manifest.get(L1)![1]!.typedId).toBe("n-lineage1-2026-02-01");
    expect(d.manifest.get(L2)![1]!.typedId).toBe("t-lineage2-2026-02-01");
    expect(periodPlanSummary(d.plan)).toBe("Februari 2026 diganti (126 → 36 baris)");
  });

  it("melewati batas (REJECT) → reject dengan pesan; tidak ada manifest", () => {
    const d = decide(
      [inc(L1, "2026-04-01", 95)],
      { kind: "auto", allowAuto: true },
      {
        settings: { keepPeriods: 3, onLimit: "REJECT" },
      },
    );
    expect(d).toMatchObject({ decision: "reject" });
    if (d.decision === "reject") expect(d.message).toMatch(/Hapus periode Januari 2026 dulu/);
  });

  it("confirm: sidik sama → aktif; berbeda (data aktif/pengaturan berubah) → plan_stale", () => {
    const incoming = [inc(L1, "2026-02-01", 100)];
    const shown = decide(incoming, { kind: "auto", allowAuto: true }).plan;
    const ack = { shrink: false, droppedRows: 0 };
    expect(
      decide(incoming, { kind: "confirm", digest: periodPlanDigest(shown), ack }).decision,
    ).toBe("activate");
    // Versi aktif lain (Februari kini 200 baris di sheet Kirim) → rencana berbeda → PLAN_STALE.
    const moved = active();
    moved[0]!.segments[1] = seg(L1, "2026-02-01", 200);
    expect(
      decide(incoming, { kind: "confirm", digest: periodPlanDigest(shown), ack }, { active: moved })
        .decision,
    ).toBe("plan_stale");
    // Pengaturan berubah (lepas otomatis + simpan 2) → rencana berbeda.
    expect(
      decide(
        incoming,
        { kind: "confirm", digest: periodPlanDigest(shown), ack },
        { settings: { keepPeriods: 2, onLimit: "EVICT_OLDEST" } },
      ).decision,
    ).toBe("plan_stale");
  });

  it("confirm: menyusut > 50% wajib dicentang; baris dibuang wajib sama; periode nyasar bisa dimasukkan", () => {
    const shrink = [inc(L1, "2026-02-01", 30)];
    const p = decide(shrink, { kind: "auto", allowAuto: true }).plan;
    const blocked = decide(shrink, {
      kind: "confirm",
      digest: periodPlanDigest(p),
      ack: { shrink: false, droppedRows: 0 },
    });
    expect(blocked).toMatchObject({ decision: "blocked" });
    if (blocked.decision === "blocked") {
      expect(blocked.message).toMatch(/Saya paham Februari 2026 diganti/);
    }
    expect(
      decide(shrink, {
        kind: "confirm",
        digest: periodPlanDigest(p),
        ack: { shrink: true, droppedRows: 0 },
      }).decision,
    ).toBe("activate");

    // Nyasar: 2 baris Desember 2025 + 95 baris April. Bawaan dikecualikan; "Masukkan" → ikut manifest.
    const stray = [inc(L1, "2025-12-01", 2), inc(L1, "2026-04-01", 95)];
    const def = decide(stray, { kind: "auto", allowAuto: true });
    expect(def.decision).toBe("await");
    if (def.decision === "await") {
      expect(def.manifest.get(L1)!.map((r) => r.periodKey)).not.toContain("2025-12");
    }
    const withStray = decide(
      stray,
      { kind: "auto", allowAuto: true },
      { include: ["2025-12"] },
    ).plan;
    const ok = decide(
      stray,
      {
        kind: "confirm",
        digest: periodPlanDigest(withStray),
        ack: { shrink: false, droppedRows: 0 },
      },
      { include: ["2025-12"] },
    );
    expect(ok.decision).toBe("activate");
    if (ok.decision === "activate") {
      expect(ok.manifest.get(L1)![0]!.periodKey).toBe("2025-12");
    }

    const dropped = facts({ droppedRows: 4 });
    const dp = decide(
      [inc(L1, "2026-04-01", 95)],
      { kind: "auto", allowAuto: true },
      { facts: dropped },
    ).plan;
    expect(confirmBlocker(dp, { shrink: false, droppedRows: 0 })).toMatch(/Buang 4 baris/);
    expect(confirmBlocker(dp, { shrink: false, droppedRows: 4 })).toBeNull();
  });

  it("manifest menolak rencana yang tidak sepakat dengan segmen (baris berbeda)", () => {
    const d = decide([inc(L1, "2026-04-01", 95)], { kind: "auto", allowAuto: true });
    expect(() => buildPeriodManifest(d.plan, active(), [inc(L1, "2026-04-01", 94)])).toThrow(
      /94 baris, rencana 95 baris/,
    );
  });

  it("sidik stabil terhadap urutan kunci objek, berubah bila isi berubah", () => {
    const p = decide([inc(L1, "2026-04-01", 95)], { kind: "auto", allowAuto: true }).plan;
    const reordered = Object.fromEntries(Object.entries(p).reverse()) as typeof p;
    expect(periodPlanDigest(reordered)).toBe(periodPlanDigest(p));
    expect(periodPlanDigest({ ...p, droppedRows: 1 })).not.toBe(periodPlanDigest(p));
  });
});
