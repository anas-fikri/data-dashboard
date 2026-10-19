import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { runIngest } from "@/features/ingest/ingest";
import {
  ALREADY_MAPPED_MESSAGE,
  applyMapping,
  type MappingCommit,
  type MappingDeps,
  type MappingRepo,
} from "@/features/ingest/mapping";
import {
  validateMapping,
  type MappingContext,
  type MappingInput,
} from "@/features/ingest/mapping-input";
import { OLD_TYPED_TTL_MS } from "@/features/ingest/recast";
import {
  sameSnapshot,
  snapshotRef,
  type ActiveSheet,
  type ActiveSnapshot,
} from "@/features/ingest/refresh";
import {
  fakeLock,
  parquetTypes,
  readParquet,
  rowColumns,
  testRoot,
  VID,
  type FakeRepo,
} from "./fakes";

/*
 * Pemetaan kolom (T-014): validasi keputusan (murni, dipakai app + worker) dan job map-version dengan
 * parser + DuckDB sungguhan, DB/storage palsu. Job hanya membaca raw.parquet (bukan file asli), tulis
 * typed-2 dengan pilihan skema aktif terkini, lalu commit; basi/hilang → file miliknya dibuang.
 */

const col = (pos: number, name: string, extra: Partial<ColumnSchema> = {}): ColumnSchema => ({
  pos,
  name,
  original: name,
  type: "text",
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
  ...extra,
});
const meta = (names: string[]) => names.map((n, i) => ({ pos: i + 1, name: n, original: n }));

describe("validateMapping", () => {
  const A1: ActiveSheet = {
    id: "A1",
    name: "Penjualan",
    index: 0,
    headerRow: 1,
    schemaRevision: 3,
    schema: [
      col(1, "Kode"),
      col(2, "Cabang"),
      col(3, "Nilai", { type: "integer", numberLocale: "us" }),
      col(4, "Catatan", { hidden: true }),
    ],
  };
  const ctx = (over: Partial<MappingContext> = {}): MappingContext => ({
    active: { versionId: "V1", sheets: [A1] },
    sheets: [
      {
        id: "N1",
        name: "penjualan",
        index: 0,
        colCount: 4,
        headerRow: 1,
        preview: null,
        columns: meta(["Kode", "Kantor", "Nilai", "Baru"]),
      },
    ],
    ...over,
  });
  const base = { activeVersionId: "V1", sheets: [{ id: "A1", schemaRevision: 3 }] };
  const one = (columns: { activePos: number; newPos: number | null }[], extra = {}) => ({
    base,
    sheets: [{ activeSheetId: "A1", target: "N1", columns, ...extra }],
  });

  it("kolom dipetakan → nama/tipe aktif, judul asli file baru; tambahan disembunyikan; tersembunyi yang hilang dibuang", () => {
    const r = validateMapping(one([{ activePos: 2, newPos: 2 }]), ctx());
    if (!r.ok) throw new Error(r.message);
    const p = r.plan.pairs[0]!;
    expect(p.overrides).toEqual([
      expect.objectContaining({ pos: 1, name: "Kode", type: "text" }),
      expect.objectContaining({ pos: 2, name: "Cabang", type: "text", hidden: false }),
      expect.objectContaining({ pos: 3, name: "Nilai", type: "integer" }),
      { pos: 4, name: "Baru", hidden: true },
    ]);
    expect(p.absent).toEqual([]);
    expect([p.mapped, p.nulls]).toEqual([1, 0]);
    expect(r.plan.sheetMap).toEqual({ A1: "N1" });
  });

  it("kosongkan → kolom absent dengan pilihan aktif; cast hanya untuk kolom cocok/dipetakan", () => {
    const r = validateMapping(
      one([{ activePos: 2, newPos: null }], { casts: [{ pos: 3, type: "decimal" }] }),
      ctx(),
    );
    if (!r.ok) throw new Error(r.message);
    const p = r.plan.pairs[0]!;
    expect(p.absent).toEqual([expect.objectContaining({ name: "Cabang", original: "Cabang" })]);
    expect(p.overrides[1]).toEqual({ pos: 2, name: "Kantor", hidden: true });
    expect(p.overrides[2]).toMatchObject({ pos: 3, type: "decimal", numberLocale: "us" });
    expect(p.nulls).toBe(1);
    const bad = validateMapping(
      one([{ activePos: 2, newPos: null }], { casts: [{ pos: 4, type: "integer" }] }),
      ctx(),
    );
    expect(bad).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("cast untuk kolom yang dipetakan user → tipe pilihan, nama dan format lain dari kolom aktif", () => {
    // Nilai (bilangan bulat) tidak ada; "Jumlah" di file baru dipetakan ke sana sebagai teks.
    const sheets = [
      {
        id: "N1",
        name: "penjualan",
        index: 0,
        colCount: 4,
        headerRow: 1,
        preview: null,
        columns: meta(["Kode", "Cabang", "Jumlah", "Baru"]),
      },
    ];
    const r = validateMapping(
      one([{ activePos: 3, newPos: 3 }], { casts: [{ pos: 3, type: "text" }] }),
      ctx({ sheets }),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.plan.pairs[0]!.overrides[2]).toMatchObject({ pos: 3, name: "Nilai", type: "text" });
    expect(r.plan.pairs[0]!.mapped).toBe(1);
  });

  it("keputusan kurang, kolom bukan yang hilang, kolom baru yang sudah cocok, di luar rentang → INVALID", () => {
    for (const cols of [
      [],
      [{ activePos: 1, newPos: 2 }],
      [{ activePos: 2, newPos: 1 }],
      [{ activePos: 2, newPos: 5 }],
      [
        { activePos: 2, newPos: 2 },
        { activePos: 2, newPos: null },
      ],
    ]) {
      expect(validateMapping(one(cols), ctx())).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(validateMapping({ base }, ctx())).toMatchObject({ ok: false, code: "INVALID" });
    expect(validateMapping(one([{ activePos: 2, newPos: 2.5 }]), ctx())).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });

  it("acuan skema aktif berubah → STALE", () => {
    const stale = { ...one([{ activePos: 2, newPos: 2 }]), base: { ...base, sheets: [] } };
    expect(validateMapping(stale, ctx())).toMatchObject({ ok: false, code: "STALE" });
    expect(
      validateMapping(one([{ activePos: 2, newPos: 2 }]), ctx({ active: null })),
    ).toMatchObject({ ok: false, code: "STALE" });
  });

  it("kolom absent lama yang tetap hilang dibawa tanpa keputusan; batas 16.384 kolom", () => {
    const withAbsent: ActiveSheet = {
      ...A1,
      schema: [...A1.schema, col(5, "Diskon", { type: "date", absent: true })],
    };
    const r = validateMapping(
      one([{ activePos: 2, newPos: null }]),
      ctx({ active: { versionId: "V1", sheets: [withAbsent] } }),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.plan.pairs[0]!.absent.map((a) => a.name)).toEqual(["Cabang", "Diskon"]);
    const wide = Array.from({ length: 16_384 }, (_, i) => (i === 0 ? "Kode" : `x${i}`));
    const tooWide = validateMapping(
      one([{ activePos: 2, newPos: null }]),
      ctx({
        sheets: [
          {
            id: "N1",
            name: "Penjualan",
            index: 0,
            colCount: wide.length,
            headerRow: 1,
            preview: null,
            columns: meta(wide),
          },
        ],
        active: {
          versionId: "V1",
          sheets: [{ ...A1, schema: [col(1, "Kode"), col(2, "Cabang")] }],
        },
      }),
    );
    expect(tooWide).toMatchObject({ ok: false, code: "INVALID" });
    if (!tooWide.ok) expect(tooWide.message).toMatch(/16\.384/);
  });

  it("acknowledge hanya true; posisi yang diperiksa job = kolom cocok + dipetakan", () => {
    const r = validateMapping({ ...one([{ activePos: 2, newPos: 2 }]), acknowledge: true }, ctx());
    if (!r.ok) throw new Error(r.message);
    expect(r.input.acknowledge).toBe(true);
    expect(r.plan.pairs[0]).toMatchObject({ checked: [1, 2, 3], userPaired: false, headerRow: 1 });
    expect(
      validateMapping({ ...one([{ activePos: 2, newPos: 2 }]), acknowledge: false }, ctx()),
    ).toMatchObject({ ok: false, code: "INVALID" });
  });

  describe("sheet aktif hilang (multi-sheet)", () => {
    const A2: ActiveSheet = { ...A1, id: "A2", name: "Retur", index: 1, schema: [col(1, "No")] };
    const multi = ctx({
      active: { versionId: "V1", sheets: [A1, A2] },
      sheets: [
        {
          id: "N1",
          name: "Penjualan",
          index: 0,
          colCount: 3,
          headerRow: 1,
          preview: null,
          columns: meta(["Kode", "Cabang", "Nilai"]),
        },
        {
          id: "N2",
          name: "Retur 2026",
          index: 1,
          colCount: 1,
          headerRow: 1,
          preview: null,
          columns: meta(["Nomor"]),
        },
      ],
    });
    const mbase = {
      activeVersionId: "V1",
      sheets: [
        { id: "A1", schemaRevision: 3 },
        { id: "A2", schemaRevision: 3 },
      ],
    };

    it("wajib diputuskan; dipasangkan dengan sheet baru tanpa pasangan → sheetMap; null → tidak dipakai", () => {
      expect(validateMapping({ base: mbase, sheets: [] }, multi)).toMatchObject({
        ok: false,
        code: "INVALID",
      });
      const paired = validateMapping(
        {
          base: mbase,
          sheets: [{ activeSheetId: "A2", target: "N2", columns: [{ activePos: 1, newPos: 1 }] }],
        },
        multi,
      );
      if (!paired.ok) throw new Error(paired.message);
      expect(paired.plan.sheetMap).toEqual({ A1: "N1", A2: "N2" });
      expect(paired.plan.pairs[1]!.overrides).toEqual([
        expect.objectContaining({ pos: 1, name: "No", hidden: false }),
      ]);
      const dropped = validateMapping(
        { base: mbase, sheets: [{ activeSheetId: "A2", target: null, columns: [] }] },
        multi,
      );
      if (!dropped.ok) throw new Error(dropped.message);
      expect(dropped.plan.dropped.map((s) => s.name)).toEqual(["Retur"]);
      expect(dropped.plan.sheetMap).toEqual({ A1: "N1" });
    });

    it("pasangan user: header aktif (koreksi user) dari pratinjau bila lebih cocok; keputusan merujuk header itu", () => {
      // Sheet aktif "Retur" ber-header baris 2; file baru menebak baris 1 (judul laporan).
      const A2h: ActiveSheet = { ...A2, headerRow: 2, schema: [col(1, "No"), col(2, "Alasan")] };
      const fresh = {
        id: "N2",
        name: "Retur 2026",
        index: 1,
        colCount: 2,
        headerRow: 1,
        columns: meta(["Laporan retur", "Jan 2026"]),
        preview: {
          colCount: 2,
          rows: [
            { row: 1, cells: ["Laporan retur", "Jan 2026"] },
            { row: 2, cells: ["No", "Alasan"] },
            { row: 3, cells: ["1", "Rusak"] },
          ],
        },
      };
      const c = ctx({
        active: { versionId: "V1", sheets: [A1, A2h] },
        sheets: [multi.sheets[0]!, fresh],
      });
      const input = (columns: { activePos: number; newPos: number | null }[]) => ({
        base: mbase,
        sheets: [{ activeSheetId: "A2", target: "N2", columns }],
      });
      const r = validateMapping(input([]), c);
      if (!r.ok) throw new Error(r.message);
      expect(r.plan.pairs[1]).toMatchObject({
        userPaired: true,
        headerRow: 2,
        columns: meta(["No", "Alasan"]),
        checked: [1, 2],
      });
      // Keputusan yang dibuat atas header tebakan tidak sah lagi (kolomnya cocok di header aktif).
      expect(validateMapping(input([{ activePos: 1, newPos: 1 }]), c)).toMatchObject({
        ok: false,
        code: "INVALID",
      });
      // Pasangan otomatis tetap memakai header tersimpan.
      expect(r.plan.pairs[0]).toMatchObject({ userPaired: false, headerRow: 1 });
    });

    it("sheet yang sudah berpasangan otomatis tidak bisa dipilih/diganti; null hanya tanpa pasangan", () => {
      for (const sheets of [
        [{ activeSheetId: "A2", target: "N1", columns: [{ activePos: 1, newPos: 1 }] }],
        [{ activeSheetId: "A1", target: "N2", columns: [] }],
        [{ activeSheetId: "A1", target: null, columns: [] }],
      ]) {
        expect(validateMapping({ base: mbase, sheets }, multi)).toMatchObject({
          ok: false,
          code: "INVALID",
        });
      }
    });
  });
});

describe("applyMapping (job map-version)", () => {
  const t = testRoot("ingest-mapping");
  afterAll(t.cleanup);
  beforeEach(t.resetTmp);

  const csv = (rows: string[][]) => `${rows.map((r) => r.join(";")).join("\n")}\n`;
  const range = <T>(n: number, f: (i: number) => T): T[] =>
    Array.from({ length: n }, (_, i) => f(i));
  const day = (i: number) => `${String((i % 28) + 1).padStart(2, "0")}/01/2026`;

  /** v1 aktif → v2 tanpa "Cabang" (jadi "Kantor") dan tanpa "Tanggal" → AWAITING_MAPPING. */
  async function awaiting() {
    const v1 = t.setup(
      t.file(
        `v1-${Math.random().toString(36).slice(2)}.csv`,
        csv([
          ["Kode", "Cabang", "Nilai", "Tanggal"],
          ...range(10, (i) => [`K${i}`, `C${i}`, String(i), day(i)]),
        ]),
      ),
    );
    expect((await runIngest(VID, v1.repo, v1.storage, v1.opts)).outcome).toBe("done");
    const first = v1.repo.byIndex()[0]!;
    const active: ActiveSnapshot = {
      versionId: "aktif0000000000000001",
      sheets: [
        {
          id: "sheetaktif00000000001",
          name: first.name,
          index: 0,
          headerRow: first.headerRow,
          schemaRevision: 2,
          schema: first.schema!,
        },
      ],
    };
    const s = t.setup(
      t.file(
        `v2-${Math.random().toString(36).slice(2)}.csv`,
        csv([
          ["Kode", "Kantor", "Nilai", "Catatan"],
          ...range(6, (i) => [`K${i}`, `Kt${i}`, String(i * 10), "x"]),
        ]),
      ),
    );
    s.repo.active = active;
    expect((await runIngest(VID, s.repo, s.storage, s.opts)).outcome).toBe("awaiting");
    // Koreksi user di skema aktif SETELAH ingest (typed-1 masih memakai nama lama).
    const sa = s.repo.active!.sheets[0]!;
    sa.schemaRevision += 1;
    sa.schema = sa.schema.map((c) => (c.original === "Nilai" ? { ...c, name: "Omzet" } : c));
    const [sheetId] = [...s.repo.sheets.keys()];
    expect(s.repo.sheets.get(sheetId!)!.schema![2]!.name).toBe("Nilai");
    const downloads: string[] = [];
    const download = s.storage.download.bind(s.storage);
    s.storage.download = async (key, dest) => {
      downloads.push(key);
      return download(key, dest);
    };
    const commits: MappingCommit[] = [];
    const deletes: [string, number][] = [];
    const lock = fakeLock();
    const deps: MappingDeps = {
      repo: mappingRepo(s.repo, commits),
      storage: s.storage,
      lock,
      scheduleDelete: async (key, ms) => {
        deletes.push([key, ms]);
      },
      tmpRoot: join(t.root, "tmp"),
      duckMemory: "256MB",
    };
    const input: MappingInput = {
      base: snapshotRef(s.repo.active),
      sheets: [
        {
          activeSheetId: "sheetaktif00000000001",
          target: sheetId!,
          columns: [
            { activePos: 2, newPos: 2 },
            { activePos: 4, newPos: null },
          ],
        },
      ],
    };
    const job = { versionId: VID, input, actorId: "owner1", ip: "10.0.0.1" };
    return {
      ...s,
      sheetId: sheetId!,
      sheet: () => s.repo.sheets.get(sheetId!)!,
      deps,
      job,
      commits,
      deletes,
      downloads,
      lock,
      typedKeys: () => s.storage.parquetKeys().filter((k) => k.includes("typed-")),
    };
  }

  /** MappingRepo palsu di atas FakeRepo (meniru commit Prisma: acuan, status, sheet, aktivasi). */
  function mappingRepo(r: FakeRepo, commits: MappingCommit[]): MappingRepo {
    return {
      allocateRows: (lineageId, span) => r.allocateRows(lineageId, span),
      load: async () =>
        r.alive()
          ? {
              datasetId: "ds",
              status: r.status,
              source: "csv",
              sheets: [...r.sheets.entries()].map(([id, s]) => ({
                id,
                name: s.name,
                index: s.index,
                colCount: s.colCount,
                columns: s.columns,
                preview: s.preview ?? null,
                headerRow: s.headerRow,
                rawKey: s.rawKey!,
                typedKey: s.typedKey ?? null,
                schemaRevision: s.schemaRevision ?? 1,
                lineageId: s.lineageId,
                segment: s.segmentId
                  ? { id: s.segmentId, rowBase: r.segments.get(s.segmentId)!.rowBase }
                  : null,
              })),
              active: structuredClone(r.active),
              mappedBy: r.status === "READY" ? (commits.at(-1)?.meta.jobId ?? null) : null,
            }
          : null,
      alive: async () => r.alive() && r.status === "AWAITING_MAPPING",
      commit: async (_v, d) => {
        if (!r.alive()) return "gone";
        if (!sameSnapshot(d.base, snapshotRef(r.active))) return "stale";
        if (r.status !== "AWAITING_MAPPING") return "gone";
        for (const u of d.sheets) {
          const s = r.sheets.get(u.id)!;
          Object.assign(s, {
            typedKey: u.typedKey,
            schema: u.schema,
            schemaRevision: u.schemaRevision,
            headerRow: u.headerRow,
            columns: u.columns,
            ...(u.aliasName !== undefined ? { aliasName: u.aliasName } : {}),
            ...(u.lineage ? { lineageId: u.lineage.lineageId } : {}),
          });
          if (u.lineage) {
            const g = r.segments.get(u.lineage.segmentId)!;
            Object.assign(g, {
              lineageId: u.lineage.lineageId,
              rowBase: u.lineage.rowBase,
              maxSrcRow: u.lineage.maxSrcRow,
            });
          }
        }
        r.status = "READY";
        r.activated = true;
        commits.push(d);
        return "done";
      },
    };
  }

  it("petakan + kosongkan → typed-2 dari raw.parquet saja, READY + aktif, typed-1 dihapus 1 jam kemudian", async () => {
    const m = await awaiting();
    const typed1 = m.sheet().typedKey!;
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "done" });
    expect(m.repo.status).toBe("READY");
    expect(m.repo.activated).toBe(true);
    // Hanya raw.parquet versi ini yang diunduh, tidak pernah file asli (raw/<ds>/<ver>/source.csv).
    expect(m.downloads).toEqual([m.sheet().rawKey]);
    expect(m.commits).toEqual([
      expect.objectContaining({
        sheetMap: { sheetaktif00000000001: m.sheetId },
        actorId: "owner1",
        ip: "10.0.0.1",
        meta: { mapped: 1, nulls: 1, droppedSheets: [] },
      }),
    ]);
    const s = m.sheet();
    expect(s.schemaRevision).toBe(2);
    expect(s.typedKey).toMatch(/typed-2-[0-9a-f]{12}\.parquet$/);
    expect(s.schema!.map((c) => [c.pos, c.name, c.original, c.hidden, c.absent ?? false])).toEqual([
      [1, "Kode", "Kode", false, false],
      [2, "Cabang", "Kantor", false, false],
      [3, "Omzet", "Nilai", false, false], // pilihan skema aktif TERKINI (bukan saat ingest)
      [4, "Catatan", "Catatan", true, false],
      [5, "Tanggal", "Tanggal", false, true],
    ]);
    expect(s.schema![4]).toMatchObject({ type: "date", dateFormat: "dd/mm/yyyy", nullPct: 1 });
    const path = join(m.storage.dir, s.typedKey!);
    expect((await parquetTypes(path)).c5).toBe("DATE");
    const rows = await readParquet(path);
    expect(rows.map((x) => [x[2], x[3], x[5]]).slice(0, 2)).toEqual([
      ["Kt0", 0n, null],
      ["Kt1", 10n, null],
    ]);
    expect(m.deletes).toEqual([[typed1, OLD_TYPED_TTL_MS]]);
    expect(existsSync(join(m.storage.dir, typed1))).toBe(true); // query lama tetap selesai
    expect(m.lock.held.size).toBe(0);
  });

  it("skema aktif berubah sebelum commit → stale: versi tetap menunggu, file baru dibuang", async () => {
    const m = await awaiting();
    const before = m.typedKeys();
    const download = m.storage.download.bind(m.storage);
    m.storage.download = async (key, dest) => {
      m.repo.active!.sheets[0]!.schemaRevision += 1; // user menyimpan koreksi skema
      return download(key, dest);
    };
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "stale" });
    expect(m.repo.status).toBe("AWAITING_MAPPING");
    expect(m.typedKeys()).toEqual(before);
    expect(m.deletes).toEqual([]);
    // Acuan basi sejak awal → stale tanpa kerja.
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "stale" });
  });

  it("versi dibuang saat job berjalan → gone, file yang sempat diunggah dihapus", async () => {
    const m = await awaiting();
    const before = m.typedKeys();
    const upload = m.storage.upload.bind(m.storage);
    m.storage.upload = async (key, path, type) => {
      await upload(key, path, type);
      m.repo.alive = () => false; // buang versi
    };
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "gone" });
    expect(m.typedKeys()).toEqual(before);
    expect(m.commits).toEqual([]);
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "gone" });
  });

  it("keputusan tidak lengkap → invalid; versi sedang dipetakan proses lain → busy", async () => {
    const m = await awaiting();
    const partial = {
      ...m.job,
      input: {
        ...m.job.input,
        sheets: [{ ...m.job.input.sheets[0]!, columns: [{ activePos: 2, newPos: 2 }] }],
      },
    };
    expect(await applyMapping(partial, m.deps)).toMatchObject({
      outcome: "invalid",
      message: expect.stringMatching(/Tanggal/),
    });
    m.lock.held.set(`map:${VID}`, "proses-lain");
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "busy" });
    expect(m.repo.status).toBe("AWAITING_MAPPING");
  });

  it("versi sudah READY: done hanya untuk job yang meng-commit-nya, job lain → gone dengan pesan", async () => {
    const m = await awaiting();
    const job = { ...m.job, jobId: "mp_a" };
    expect(await applyMapping(job, m.deps)).toEqual({ outcome: "done" });
    expect(m.commits[0]!.meta.jobId).toBe("mp_a");
    // Percobaan ulang job yang sama (gagal setelah commit) → tetap done tanpa kerja.
    expect(await applyMapping(job, m.deps)).toEqual({ outcome: "done" });
    expect(await applyMapping({ ...m.job, jobId: "mp_b" }, m.deps)).toEqual({
      outcome: "gone",
      message: ALREADY_MAPPED_MESSAGE,
    });
    expect(m.commits).toHaveLength(1);
  });

  /**
   * Dataset dua sheet: "Data" (header baris 2 hasil koreksi user, Jumlah bilangan bulat) + "Ringkasan".
   * File baru CSV (sheet "CSV") tanpa pasangan otomatis, dengan baris judul laporan di baris 1 → tebakan
   * header baris 1. User memasangkan Data → CSV dan membuang Ringkasan.
   */
  async function renamed(jumlah: (i: number) => string) {
    const s = t.setup(
      t.file(
        `v2-${Math.random().toString(36).slice(2)}.csv`,
        csv([
          ["Periode Jan 2026", "Cabang Semua", "Dicetak admin"],
          ["Tanggal", "Cabang", "Jumlah"],
          ...range(10, (i) => [`T${i}`, `C${i}`, jumlah(i)]),
        ]),
      ),
    );
    s.repo.active = {
      versionId: "aktif0000000000000001",
      sheets: [
        {
          id: "sheetaktif00000000001",
          name: "Data",
          index: 0,
          headerRow: 2,
          schemaRevision: 4,
          schema: [
            col(1, "Tanggal"),
            col(2, "Cabang"),
            col(3, "Jumlah", { type: "integer", numberLocale: "us" }),
          ],
        },
        {
          id: "sheetaktif00000000002",
          name: "Ringkasan",
          index: 1,
          headerRow: 1,
          schemaRevision: 1,
          schema: [col(1, "Bulan")],
        },
      ],
    };
    expect((await runIngest(VID, s.repo, s.storage, s.opts)).outcome).toBe("awaiting");
    const [sheetId] = [...s.repo.sheets.keys()];
    expect(s.repo.sheets.get(sheetId!)!.headerRow).toBe(1);
    const commits: MappingCommit[] = [];
    const deps: MappingDeps = {
      repo: mappingRepo(s.repo, commits),
      storage: s.storage,
      lock: fakeLock(),
      scheduleDelete: async () => {},
      tmpRoot: join(t.root, "tmp"),
      duckMemory: "256MB",
    };
    const input: MappingInput = {
      base: snapshotRef(s.repo.active),
      sheets: [
        { activeSheetId: "sheetaktif00000000001", target: sheetId!, columns: [] },
        { activeSheetId: "sheetaktif00000000002", target: null, columns: [] },
      ],
    };
    return {
      ...s,
      sheet: () => s.repo.sheets.get(sheetId!)!,
      sheetId: sheetId!,
      deps,
      commits,
      job: { versionId: VID, input, actorId: "owner1", ip: "10.0.0.1" },
      typedKeys: () => s.storage.parquetKeys().filter((k) => k.includes("typed-")),
    };
  }

  it("sheet ganti nama dipasangkan user → header aktif dari pratinjau, alias nama sheet aktif, sheetMap", async () => {
    const m = await renamed((i) => String(i * 5));
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "done" });
    expect(m.commits[0]).toMatchObject({
      sheetMap: { sheetaktif00000000001: m.sheetId },
      meta: { mapped: 0, nulls: 0, droppedSheets: ["Ringkasan"] },
      sheets: [{ headerRow: 2, aliasName: "Data" }],
    });
    const s = m.sheet();
    expect(s.headerRow).toBe(2);
    expect(s.schema!.map((c) => [c.name, c.original, c.type])).toEqual([
      ["Tanggal", "Tanggal", "text"],
      ["Cabang", "Cabang", "text"],
      ["Jumlah", "Jumlah", "integer"],
    ]);
    // Baris judul kolom tidak menjadi data.
    const rows = await readParquet(join(m.storage.dir, s.typedKey!));
    expect(rows).toHaveLength(10);
    expect(rows[0]!.slice(1)).toEqual(["T0", "C0", 0n]);
  });

  it("T-036 AC3: dipasangkan user dari sheet logis lain → lineage sheet aktif dibawa, `_row` baru dari high-water-nya", async () => {
    const m = await renamed((i) => String(i * 5));
    m.repo.active!.sheets[0]!.lineageId = "lineageaktif0000000001";
    m.repo.lineages.set("lineageaktif0000000001", 2_147_483_647n);
    const own = m.sheet().lineageId!;
    expect(own).not.toBe("lineageaktif0000000001");
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "done" });
    const u = m.commits[0]!.sheets[0]!;
    expect(u.lineage).toMatchObject({
      lineageId: "lineageaktif0000000001",
      segmentId: m.sheet().segmentId,
      rowBase: 2_147_483_647n,
    });
    expect(m.sheet().lineageId).toBe("lineageaktif0000000001");
    // High-water naik sebesar baris fisik terbesar; typed: _row = rowBase + _src_row.
    expect(m.repo.lineages.get("lineageaktif0000000001")).toBe(
      2_147_483_647n + BigInt(u.lineage!.maxSrcRow),
    );
    const rows = await rowColumns(join(m.storage.dir, m.sheet().typedKey!));
    expect(rows.every((x) => x.row === 2_147_483_647n + BigInt(x.src))).toBe(true);
  });

  it("rasio cast < 98 % dengan tipe yang diterapkan → review (tanpa commit, file dibuang); acknowledge → diterapkan", async () => {
    const m = await renamed((i) => (i < 2 ? "N/A" : String(i)));
    const before = m.typedKeys();
    expect(await applyMapping(m.job, m.deps)).toEqual({
      outcome: "review",
      issues: [
        {
          sheet: "Data",
          column: "Jumlah",
          header: "Jumlah",
          pct: 0.8,
          typeLabel: "Bilangan bulat (format 1,234)",
        },
      ],
    });
    expect(m.repo.status).toBe("AWAITING_MAPPING");
    expect(m.commits).toEqual([]);
    expect(m.typedKeys()).toEqual(before);
    const ack = { ...m.job, input: { ...m.job.input, acknowledge: true as const } };
    expect(await applyMapping(ack, m.deps)).toEqual({ outcome: "done" });
    expect(m.sheet().schema![2]).toMatchObject({ type: "integer", castFailCount: 2, nonEmpty: 10 });
  });

  it("R2-INT-1: review berulang tidak meninggalkan typed yatim; setelah commit hanya typed-1 + typed aktif", async () => {
    const m = await renamed((i) => (i < 2 ? "N/A" : String(i)));
    const before = m.typedKeys();
    // Storage palsu menolak kunci objek penuh sebagai prefix, sama dengan S3 storage.
    await expect(m.storage.deletePrefix(before[0]!)).rejects.toThrow(/diakhiri/);
    for (let round = 0; round < 2; round++) {
      expect(await applyMapping(m.job, m.deps)).toMatchObject({ outcome: "review" });
      expect(m.typedKeys()).toEqual(before);
    }
    const ack = { ...m.job, input: { ...m.job.input, acknowledge: true as const } };
    expect(await applyMapping(ack, m.deps)).toEqual({ outcome: "done" });
    expect(m.typedKeys()).toEqual([...before, m.sheet().typedKey!].sort());
  });

  it("R2-UI-4: sheet aktif yang sudah punya alias dipasangkan lagi → alias tetap akar silsilah", async () => {
    const m = await renamed((i) => String(i * 5));
    // Sheet aktif "Data" sendiri hasil pemetaan "Penjualan" → "Data" (V1 → V2); V3 dipasangkan user.
    m.repo.active!.sheets[0]!.aliasName = "Penjualan";
    expect(await applyMapping(m.job, m.deps)).toEqual({ outcome: "done" });
    expect(m.commits[0]!.sheets[0]!.aliasName).toBe("Penjualan");
  });
});
