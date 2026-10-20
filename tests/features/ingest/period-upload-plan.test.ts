import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { PeriodLimits } from "@/features/ingest/period-plan";
import {
  applySchemaChange,
  buildPeriodManifest,
  combinedSha256,
  confirmBlocker,
  decidePeriodCommit,
  periodColumnPlan,
  planInputs,
  segmentGroupProblem,
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
  it("urutan sama → identitas; diurutkan ulang → peta ke posisi kanonik; kolom tambahan → kolom tersembunyi baru (T-057)", () => {
    expect(periodColumnPlan(meta(["kode", "tanggal", "nilai"]), SCHEMA, 3, 2, null)).toEqual({
      colMap: [],
      issues: [],
      extra: 0,
      colCount: 3,
      schema: SCHEMA,
      change: null,
    });
    const p = periodColumnPlan(meta(["Nilai", "baru", "KODE", "tanggal"]), SCHEMA, 3, 2, null);
    // Posisi kanonik 4 = kolom baru "baru" (kolom file 2); periode lama tidak memuatnya (NULL).
    expect(p.colMap).toEqual([3, 4, 1, 2]);
    expect(p.issues).toEqual([]);
    expect(p.extra).toBe(1);
    expect(p.colCount).toBe(4);
    expect(p.schema[3]).toMatchObject({ pos: 4, original: "baru", type: "text", hidden: true });
    expect(p.change).toMatchObject({
      colCount: 4,
      columns: [{ pos: 4, original: "baru" }],
      aliases: [],
      normalized: [],
    });
    expect(validateColMap(p.colMap, 4, 4, "s")).toEqual([]);
  });

  it("kolom terlihat/periode hilang → masalah pemetaan; kolom kosong yang kembali dipetakan (T-057)", () => {
    const hidden = [SCHEMA[0]!, { ...SCHEMA[1]!, hidden: true }, SCHEMA[2]!];
    expect(periodColumnPlan(meta(["kode", "nilai"]), hidden, 3, 2, "Data").issues).toEqual([
      'Kolom "tanggal" (sheet Data) (kolom periode) tidak ada di file baru.',
    ]);
    expect(periodColumnPlan(meta(["kode", "tanggal"]), SCHEMA, 3, 2, null).issues).toEqual([
      'Kolom "nilai" tidak ada di file baru.',
    ]);
    // Kolom absent (T-014) yang kembali ada: nilainya dari file untuk periode ini, periode lama tetap
    // NULL; kolom menjadi kolom biasa (lebar kanonik 4).
    const absent = [...SCHEMA, col(4, "catatan", { absent: true })];
    const back = periodColumnPlan(
      meta(["kode", "tanggal", "nilai", "catatan"]),
      absent,
      3,
      2,
      null,
    );
    expect(back.issues).toEqual([]);
    expect(back.colMap).toEqual([]);
    expect(back.colCount).toBe(4);
    expect(back.schema[3]!.absent).toBeUndefined();
    expect(back.change).toMatchObject({ colCount: 4, normalized: [4], added: [] });
  });

  it("T-057 keputusan pemetaan: dipetakan → alias; kosongkan → NULL (kolom tetap); kolom periode tidak bisa dikosongkan", () => {
    const file = meta(["kode", "Tgl", "ket"]);
    const p = periodColumnPlan(
      file,
      SCHEMA,
      3,
      2,
      null,
      new Map([
        [2, 2],
        [3, null],
      ]),
    );
    expect(p.issues).toEqual([]);
    expect(p.colMap).toEqual([1, 2, 0, 3]);
    expect(p.schema[1]!.aliases).toEqual(["Tgl"]);
    expect(p.schema[2]!.absent).toBeUndefined();
    expect(p.change).toMatchObject({ aliases: [{ pos: 2, alias: "Tgl" }], colCount: 4 });
    expect(
      periodColumnPlan(
        file,
        SCHEMA,
        3,
        2,
        null,
        new Map([
          [2, null],
          [3, null],
        ]),
      ).issues,
    ).toEqual(['Kolom "tanggal" adalah kolom periode dan tidak bisa dikosongkan.']);
    // Kolom file yang sudah cocok tidak bisa dipakai lagi; keputusan untuk kolom yang tidak hilang ditolak.
    expect(
      periodColumnPlan(meta(["kode", "tanggal"]), SCHEMA, 3, 2, null, new Map([[3, 1]])).issues,
    ).toEqual(['Kolom file baru posisi 1 tidak bisa dipakai untuk Kolom "nilai".']);
    expect(
      periodColumnPlan(meta(["kode", "tanggal", "nilai"]), SCHEMA, 3, 2, null, new Map([[1, 1]]))
        .issues,
    ).toEqual(["Kolom posisi 1 tidak perlu dipetakan."]);
  });

  it("T-057 applySchemaChange: diterapkan pada sheet aktif yang sama; revisi lain / posisi bentrok → null", () => {
    const p = periodColumnPlan(
      meta(["kode", "Tgl", "nilai", "baru"]),
      SCHEMA,
      3,
      2,
      null,
      new Map([[2, 2]]),
    );
    const ch = { ...p.change!, lineageId: "L", baseRevision: 4 };
    const row = {
      colCount: 3,
      columns: meta(["kode", "tanggal", "nilai"]),
      schema: SCHEMA,
      schemaRevision: 4,
    };
    const next = applySchemaChange(row, ch)!;
    expect(next.colCount).toBe(4);
    expect(next.columns.map((c) => c.original)).toEqual(["kode", "tanggal", "nilai", "baru"]);
    expect(next.schema.map((c) => [c.pos, c.hidden, c.aliases])).toEqual([
      [1, false, undefined],
      [2, false, ["Tgl"]],
      [3, false, undefined],
      [4, true, undefined],
    ]);
    expect(applySchemaChange({ ...row, schemaRevision: 5 }, ch)).toBeNull();
    expect(
      applySchemaChange({ ...row, schema: [...SCHEMA, col(4, "lain", { absent: true })] }, ch),
    ).toBeNull();
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

describe("T-060: kelompok file satu periode di rencana dan manifest", () => {
  const ref = (key: string, rows: number, id: string, g?: [number, number]) => ({
    typedId: `t-${id}`,
    segmentId: id,
    lineageId: "L1",
    periodKey: key,
    periodStart: `${key}-01`,
    rows,
    bytes: 10,
    ...(g ? { groupId: "grp", groupPart: g[0], groupSize: g[1] } : {}),
  });

  it("combinedSha256: satu file = sha-nya; kelompok = sidik urutan-bebas; ada null → null", () => {
    expect(combinedSha256(["a"])).toBe("a");
    expect(combinedSha256(["a", "a"])).toBe("a");
    const ab = combinedSha256(["a", "b"]);
    expect(ab).toMatch(/^[0-9a-f]{64}$/);
    expect(combinedSha256(["b", "a"])).toBe(ab);
    expect(combinedSha256(["a", null])).toBeNull();
  });

  it("segmentGroupProblem: >1 segmen hanya sebagai satu kelompok lengkap", () => {
    expect(segmentGroupProblem([])).toBeNull();
    expect(segmentGroupProblem([{}])).toBeNull();
    expect(segmentGroupProblem([{}, {}])).toBe("muncul lebih dari sekali");
    const g = (p: number, n: number, id = "x") => ({ groupId: id, groupPart: p, groupSize: n });
    expect(segmentGroupProblem([g(1, 2), g(2, 2)])).toBeNull();
    expect(segmentGroupProblem([g(1, 3), g(2, 3)])).toBe("kelompok file tidak lengkap");
    expect(segmentGroupProblem([g(1, 2), g(1, 2)])).toBe("nomor file kelompok ganda");
    expect(segmentGroupProblem([g(1, 2), g(2, 2, "y")])).toBe("muncul lebih dari sekali");
  });

  it("kelompok menggantikan periode utuh: baris dijumlah, segmen dihitung untuk batas, manifest semua file", () => {
    const active: ActivePeriodSheet[] = [
      {
        sheetId: "S1",
        lineageId: "L1",
        name: "Data",
        schemaRevision: 1,
        segments: [
          { ...ref("2026-02", 20, "feb"), sha256: "s-feb" },
          { ...ref("2026-03", 31, "mar"), sha256: "s-mar" },
        ],
      },
    ];
    const incoming = [
      ref("2026-03", 15, "p1", [1, 3]),
      ref("2026-03", 15, "p2", [2, 3]),
      ref("2026-03", 10, "p3", [3, 3]),
    ];
    const inputs = planInputs(active, incoming);
    expect(inputs.incoming).toEqual([
      {
        key: "2026-03",
        start: "2026-03-01",
        sheets: { L1: { rows: 40, bytes: 30, segments: 3 } },
        sha256: null,
      },
    ]);
    const d = decidePeriodCommit({
      facts: {
        grain: "MONTH",
        source: "COLUMN",
        fileSheets: ["L1"],
        droppedRows: 0,
        ignoredSheets: [],
        fileSha256: "f",
      },
      activeVersionId: "A",
      active,
      incoming,
      settings: { keepPeriods: null, onLimit: "REJECT" },
      limits: { ...LIMITS, sheetMaxSegments: 3 },
      include: [],
      mode: { kind: "auto", allowAuto: true },
    });
    // Feb (1) + Maret (3 file) = 4 segmen > batas 3 segmen per sheet → ditolak sebelum commit.
    expect(d.decision).toBe("reject");
    const ok = decidePeriodCommit({
      facts: {
        grain: "MONTH",
        source: "COLUMN",
        fileSheets: ["L1"],
        droppedRows: 0,
        ignoredSheets: [],
        fileSha256: "f",
      },
      activeVersionId: "A",
      active,
      incoming: [...incoming].reverse(),
      settings: { keepPeriods: null, onLimit: "REJECT" },
      limits: LIMITS,
      include: [],
      mode: { kind: "auto", allowAuto: true },
    });
    expect(ok.decision).toBe("await");
    if (ok.decision !== "await") return;
    expect(ok.manifest.get("L1")!.map((r) => [r.periodKey, r.segmentId])).toEqual([
      ["2026-02", "feb"],
      ["2026-03", "p1"],
      ["2026-03", "p2"],
      ["2026-03", "p3"],
    ]);
    // Kelompok tidak lengkap / dua segmen tanpa kelompok → galat bentuk (tidak pernah diaktifkan).
    expect(() => planInputs(active, incoming.slice(0, 2))).toThrow(/kelompok file tidak lengkap/);
    expect(() => planInputs(active, [ref("2026-03", 1, "a"), ref("2026-03", 1, "b")])).toThrow(
      /muncul lebih dari sekali/,
    );
  });
});
