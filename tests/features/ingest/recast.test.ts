import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest } from "@/features/ingest/ingest";
import {
  MULTI_HEADER_MESSAGE,
  recastSheet,
  type RecastDeps,
  type RecastProgress,
} from "@/features/ingest/recast";
import { choiceOf, writeTyped } from "@/features/ingest/typed";
import { gcPlan } from "@/features/versions/gc";
import { newSegmentId } from "@/features/versions/segment-keys";
import { openDuck } from "@/lib/duckdb";
import { DS, fakeLock, parquetTypes, readParquet, testRoot, VID, type FakeStorage } from "./fakes";
import { FakeRecastRepo } from "./recast-fakes";

/* Recast (T-007 AC 5; per segmen T-040): satu per sheet (lock), typed-<rev+1>, revisi lama disapu GC. */
const t = testRoot("ingest-recast");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

async function setup(content: string) {
  const s = t.setup(t.file(`r-${Math.random().toString(36).slice(2)}.csv`, content));
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  const [sheetId] = [...s.repo.sheets.keys()];
  const lock = fakeLock();
  const rr = FakeRecastRepo.fromIngest(s.repo, sheetId!);
  const deps: RecastDeps = {
    repo: rr,
    storage: s.storage,
    lock,
    tmpRoot: join(t.root, "tmp"),
    duckMemory: "256MB",
  };
  return {
    ...s,
    sheetId: sheetId!,
    rr,
    deps,
    lock,
    sheet: () => s.repo.sheets.get(sheetId!)!,
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const has = (storage: FakeStorage, key: string) => existsSync(join(storage.dir, key));
const DATA = `kode;nilai\nA;1\nB;2\nC;x\n`;

describe("recast", () => {
  it("dua recast bersamaan → hanya satu dieksekusi; typed-2 dibuat, typed-1 tetap (disapu GC segmen)", async () => {
    const r = await setup(DATA);
    const typed1 = r.sheet().typedKey!;
    expect(typed1).toMatch(/typed-1\.parquet$/);
    const outcomes = await Promise.all([
      recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps),
      recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps),
    ]);
    expect(outcomes.map((o) => o.outcome).sort()).toEqual(["busy", "done"]);
    expect(r.sheet()).toMatchObject({ schemaRevision: 2 });
    expect(r.sheet().typedKey).toMatch(/typed-2-[0-9a-f]{12}\.parquet$/);
    expect(has(r.storage, r.sheet().typedKey!)).toBe(true);
    expect(has(r.storage, typed1)).toBe(true);
    // T-038: revisi lama tidak lagi dijadwalkan hapus; GC menyapunya setelah tidak dirujuk ≥ 24 jam.
    expect(typed1).toMatch(/^parquet\/[a-z0-9]+\/seg\/[a-z0-9]+\/typed-1\.parquet$/);
    expect(r.lock.held.size).toBe(0);
  });

  it("pilihan user bertahan di revisi berikutnya; nama tampil diganti, nama asli tetap", async () => {
    const r = await setup(DATA);
    // nilai: 2 angka + 1 teks → teks hasil inferensi; user paksa integer (x → NULL, gagal 1).
    const a = await recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps);
    expect(a).toMatchObject({ outcome: "done", revision: 2 });
    const b = await recastSheet(r.sheetId, { columns: [{ pos: 1, name: "Kode Barang" }] }, r.deps);
    expect(b).toMatchObject({ outcome: "done", revision: 3 });
    const [kode, nilai] = r.sheet().schema!;
    expect(kode).toMatchObject({ name: "Kode Barang", original: "kode" });
    expect(nilai).toMatchObject({ type: "integer", numberLocale: "us", castFailCount: 1 });
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(rows.map((x) => x[2])).toEqual([1n, 2n, null]);
  });

  it("T-040: tanpa perubahan cast → file typed tetap dipakai (tidak ditulis ulang), revisi naik", async () => {
    const r = await setup(DATA);
    const typed1 = r.sheet().typedKey;
    const keys = r.storage.parquetKeys();
    const out = await recastSheet(r.sheetId, { columns: [{ pos: 1, name: "Kode" }] }, r.deps);
    expect(out).toMatchObject({ outcome: "done", revision: 2 });
    expect(r.sheet().typedKey).toBe(typed1);
    expect(r.storage.parquetKeys()).toEqual(keys);
    // Profil dari ingest dipakai: raw tidak dipindai ulang dan tidak ada profil yang disimpan ulang.
    expect(r.rr.calls.saveProfile).toEqual([]);
  });

  it("baris header diganti → nama dari baris itu, baris di atasnya tidak ada di data", async () => {
    const r = await setup(`Laporan Gudang;\nkode;nilai\nA;1\nB;2\n`);
    const res = await recastSheet(r.sheetId, { headerRow: 2 }, r.deps);
    expect(res.outcome).toBe("done");
    expect(r.sheet().headerRow).toBe(2);
    expect(r.sheet().schema!.map((c) => c.name)).toEqual(["kode", "nilai"]);
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(rows.map((x) => x[0])).toEqual([3, 4]);
  });

  it("revisi berubah di tengah (stale) → file baru dihapus, pointer tidak diganti", async () => {
    const r = await setup(DATA);
    const before = r.sheet().typedKey;
    r.rr.swapTyped = async () => false;
    const out = await recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps);
    expect(out).toEqual({ outcome: "stale" });
    expect(r.sheet().typedKey).toBe(before);
    expect(r.storage.parquetKeys().some((k) => k.includes("typed-2"))).toBe(false);
    expect([...r.rr.typed.values()].some((x) => x.schemaRevision === 2)).toBe(false);
  });

  it("R2-INT-1 / T-040 AC2: swap putus sebelum commit → file tertunda disimpan; percobaan ulang job yang sama memakainya tanpa menulis ulang", async () => {
    const r = await setup(DATA);
    const real = r.rr.swapTyped;
    r.rr.swapTyped = async () => {
      throw new Error("ECONNRESET db");
    };
    const deps: RecastDeps = { ...r.deps, jobId: "rc_aaaaaaaaaaaaaaaaaaaaaaaa" };
    const input = { columns: [{ pos: 2, type: "integer" as const }] };
    await expect(recastSheet(r.sheetId, input, deps)).rejects.toThrow(/ECONNRESET/);
    expect(r.sheet().schemaRevision).toBe(1);
    expect(r.lock.held.size).toBe(0);
    const pending = r.storage.parquetKeys().filter((k) => k.includes("typed-2-"));
    expect(pending).toHaveLength(1);
    r.rr.swapTyped = real;
    let uploads = 0;
    const counted: RecastDeps = {
      ...deps,
      storage: {
        ...r.storage,
        download: r.storage.download.bind(r.storage),
        upload: async (...a) => {
          uploads++;
          return r.storage.upload(...a);
        },
        deleteObject: r.storage.deleteObject.bind(r.storage),
        exists: r.storage.exists.bind(r.storage),
      },
    };
    expect(await recastSheet(r.sheetId, input, counted)).toMatchObject({ outcome: "done" });
    expect(uploads).toBe(0);
    expect(r.sheet().typedKey).toBe(pending[0]);
    expect(r.rr.calls.addTyped).toHaveLength(1);
  });

  it("error di tengah → lock dilepas (recast berikutnya tidak 'busy')", async () => {
    const r = await setup(DATA);
    const broken: RecastDeps = {
      ...r.deps,
      storage: {
        ...r.storage,
        download: async () => {
          throw new Error("ECONNRESET");
        },
        upload: r.storage.upload.bind(r.storage),
        deleteObject: r.storage.deleteObject.bind(r.storage),
        exists: r.storage.exists.bind(r.storage),
      },
    };
    const input = { columns: [{ pos: 2, type: "integer" as const }] };
    await expect(recastSheet(r.sheetId, input, broken)).rejects.toThrow(/ECONNRESET/);
    expect(r.lock.held.size).toBe(0);
    expect((await recastSheet(r.sheetId, input, r.deps)).outcome).toBe("done");
  });

  it("sheet sudah dihapus → gone", async () => {
    const r = await setup(DATA);
    r.repo.sheets.clear();
    expect(await recastSheet(r.sheetId, {}, r.deps)).toEqual({ outcome: "gone" });
  });

  it("input user di luar enum/rentang ditolak sebelum menyentuh SQL atau storage", async () => {
    const r = await setup(DATA);
    const before = r.sheet().typedKey;
    for (const bad of [
      { columns: [{ pos: 2, type: "text'); DROP TABLE x; --" }] },
      { columns: [{ pos: 2, dateFormat: "%d/%m/%Y" }] },
      { columns: [{ pos: 3, type: "text" }] }, // hanya 2 kolom
      { columns: [{ pos: 1, sql: "1" }] }, // kunci tak dikenal
      { headerRow: 1.5 },
      { headerRow: 0 },
      "bukan objek",
    ]) {
      expect(await recastSheet(r.sheetId, bad, r.deps)).toMatchObject({ outcome: "invalid" });
    }
    expect(r.sheet().typedKey).toBe(before);
    expect(r.sheet().schemaRevision).toBe(1);
    expect(r.lock.held.size).toBe(0);
  });

  it("baseRevision usang → stale tanpa kerja (edit lama tidak menimpa edit baru)", async () => {
    const r = await setup(DATA);
    expect(await recastSheet(r.sheetId, { baseRevision: 1 }, r.deps)).toMatchObject({
      outcome: "done",
      revision: 2,
    });
    expect(await recastSheet(r.sheetId, { baseRevision: 1, columns: [] }, r.deps)).toEqual({
      outcome: "stale",
    });
    expect(r.sheet().schemaRevision).toBe(2);
  });

  it("nama tampil ganda → invalid (referensi per nama di T-009 tetap unik)", async () => {
    const r = await setup(DATA);
    expect(
      await recastSheet(r.sheetId, { columns: [{ pos: 2, name: "KODE" }] }, r.deps),
    ).toMatchObject({ outcome: "invalid" });
    expect(r.sheet().schemaRevision).toBe(1);
  });

  it("versi masih diproses → busy (typed-1 belum final)", async () => {
    const r = await setup(DATA);
    r.rr.versionStatus = "INGESTING";
    expect(await recastSheet(r.sheetId, {}, r.deps)).toEqual({ outcome: "busy" });
    expect(r.lock.held.size).toBe(0);
  });

  it("lock hilang di tengah → busy tanpa mengganti pointer; job yang sama dilanjutkan setelahnya", async () => {
    const r = await setup(DATA);
    const before = r.sheet().typedKey;
    const setNx = r.lock.setNx;
    r.lock.setNx = (async (key: string, value: string) => {
      r.lock.held.set(key, value);
      setTimeout(() => r.lock.lose(), 0);
      return "OK";
    }) as typeof r.lock.setNx;
    const deps: RecastDeps = { ...r.deps, renewMs: 1, jobId: "rc_bbbbbbbbbbbbbbbbbbbbbbbb" };
    const input = { columns: [{ pos: 2, type: "integer" as const }] };
    expect(await recastSheet(r.sheetId, input, deps)).toEqual({ outcome: "busy" });
    expect(r.sheet().typedKey).toBe(before);
    expect(r.sheet().schemaRevision).toBe(1);
    r.lock.setNx = setNx;
    r.lock.held.clear(); // lock pemegang lain kedaluwarsa
    expect(await recastSheet(r.sheetId, input, { ...deps, renewMs: undefined })).toMatchObject({
      outcome: "done",
      revision: 2,
    });
  });

  it("serial Excel di luar rentang → gagal dihitung, bukan error yang membatalkan recast (M7)", async () => {
    const r = await setup(`tgl;n\n45000;1\n3000000000;2\n45001;3\n`);
    const out = await recastSheet(
      r.sheetId,
      { columns: [{ pos: 1, type: "date", dateFormat: "serial" }] },
      r.deps,
    );
    expect(out).toMatchObject({ outcome: "done" });
    expect(r.sheet().schema![0]).toMatchObject({ type: "date", castFailCount: 1 });
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(
      rows.map((x) => (x[1] === null ? null : (x[1] as Date).toISOString().slice(0, 10))),
    ).toEqual(["2023-03-15", null, "2023-03-16"]);
  });

  it("T-030 AC2: kolom ambigu dikoreksi ke Indonesia → '1.500' = 1500, '1.5' gagal terhitung, tanda hilang", async () => {
    const lines = [
      "omzet;n",
      "1.5;0",
      ...Array.from({ length: 40 }, (_, i) => `1.${500 + i};${i}`),
    ];
    const r = await setup(`${lines.join("\n")}\n`);
    expect(r.sheet().schema![0]).toMatchObject({ numberLocale: "us", localeAmbiguous: true });
    await recastSheet(
      r.sheetId,
      { columns: [{ pos: 1, type: "decimal", numberLocale: "id" }] },
      r.deps,
    );
    const c = r.sheet().schema![0]!;
    expect(c).toMatchObject({ type: "decimal", numberLocale: "id", castFailCount: 1 });
    expect(c.localeAmbiguous).toBeUndefined();
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(rows.slice(0, 3).map((x) => x[1])).toEqual([null, 1500, 1501]);
  });

  it("review T-028 INT-1: '(0)' di kolom serial gagal cast dan terhitung (negatif akuntansi bukan nomor seri)", async () => {
    const r = await setup(`tgl;n\n45000;1\n(0);2\n45001;3\n`);
    await recastSheet(
      r.sheetId,
      { columns: [{ pos: 1, type: "date", dateFormat: "serial" }] },
      r.deps,
    );
    expect(r.sheet().schema![0]).toMatchObject({ type: "date", castFailCount: 1 });
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(rows.map((x) => x[1])).toEqual([expect.any(Date), null, expect.any(Date)]);
  });

  it("swap commit lalu koneksi putus → file yang kini aktif tidak dihapus (N1)", async () => {
    const r = await setup(DATA);
    const real = r.rr.swapTyped;
    r.rr.swapTyped = async (id, expected, next) => {
      await real(id, expected, next);
      throw new Error("Server has closed the connection");
    };
    await expect(
      recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps),
    ).rejects.toThrow(/closed the connection/);
    const active = r.sheet().typedKey!;
    expect(active).toMatch(/typed-2-[0-9a-f]{12}\.parquet$/);
    expect(has(r.storage, active)).toBe(true);
    expect(r.lock.held.size).toBe(0);
  });
});

describe("kolom kosong (absent, T-014) bertahan di setiap recast", () => {
  /** Sheet 2 kolom + kolom kosong "Tanggal" di pos 3 (seperti hasil pemetaan "kosongkan"). */
  async function withAbsent() {
    const r = await setup(DATA);
    r.sheet().schema!.push({
      pos: 3,
      name: "Tanggal",
      original: "Tanggal",
      type: "date",
      dateFormat: "dd/mm/yyyy",
      hidden: false,
      nullPct: 1,
      distinctCount: 0,
      castFailCount: 0,
      nonEmpty: 0,
      absent: true,
    });
    return r;
  }
  const typesOf = async (r: Awaited<ReturnType<typeof withAbsent>>) =>
    parquetTypes(join(r.storage.dir, r.sheet().typedKey!));

  it("ganti nama/tipe kolom kosong (pos > colCount) → tipe CAST berganti; recast kolom lain tetap membawanya", async () => {
    const r = await withAbsent();
    const out = await recastSheet(
      r.sheetId,
      { columns: [{ pos: 3, name: "Waktu", type: "timestamp" }] },
      r.deps,
    );
    expect(out).toMatchObject({ outcome: "done", revision: 2 });
    expect(r.sheet().schema![2]).toMatchObject({
      pos: 3,
      name: "Waktu",
      original: "Tanggal",
      type: "timestamp",
      dateFormat: "dd/mm/yyyy",
      absent: true,
      nonEmpty: 0,
    });
    expect((await typesOf(r)).c3).toBe("TIMESTAMP");
    const b = await recastSheet(r.sheetId, { columns: [{ pos: 2, type: "integer" }] }, r.deps);
    expect(b).toMatchObject({ outcome: "done", revision: 3 });
    expect(r.sheet().schema!.map((c) => [c.pos, c.name, c.absent ?? false])).toEqual([
      [1, "kode", false],
      [2, "nilai", false],
      [3, "Waktu", true],
    ]);
    expect((await typesOf(r)).c3).toBe("TIMESTAMP");
    const rows = await readParquet(join(r.storage.dir, r.sheet().typedKey!));
    expect(rows.map((x) => x[3])).toEqual([null, null, null]);
  });

  it("baris header diganti → kolom kosong tetap; nama bentrok dengan kolom lain → invalid", async () => {
    const r = await withAbsent();
    expect(await recastSheet(r.sheetId, { headerRow: 2 }, r.deps)).toMatchObject({
      outcome: "done",
    });
    expect(r.sheet().schema!.at(-1)).toMatchObject({ pos: 3, name: "Tanggal", absent: true });
    expect((await typesOf(r)).c3).toBe("DATE");
    expect(
      await recastSheet(r.sheetId, { columns: [{ pos: 3, name: "A" }] }, r.deps),
    ).toMatchObject({ outcome: "invalid" });
  });
});

/**
 * Sheet hasil ingest dipecah menjadi `n` segmen (seperti unggahan per periode, ADR-0008): raw tiap
 * segmen = baris judul + potongan baris data bernomor fisik sendiri, typed-1 dengan rowBase berurutan
 * (masing-masing memutuskan `float` sendiri, seperti file yang ditulis terpisah). `extra` = kolom
 * tambahan "Catatan" (tersembunyi) hanya di segmen terakhir; `profiles: false` = file lama tanpa profil.
 */
async function segmented(
  content: string,
  n: number,
  opts: { extra?: boolean; profiles?: boolean } = {},
): Promise<Setup> {
  const r = await setup(content);
  const s = r.sheet();
  const h = s.headerRow;
  const raw = join(r.storage.dir, s.rawKey!).replace(/'/g, "''");
  const work = join(t.root, "tmp", `split-${Math.random().toString(36).slice(2)}`);
  mkdirSync(work, { recursive: true });
  const duck = await openDuck({ path: join(work, "s.duckdb"), tmpDir: work, memoryLimit: "256MB" });
  const extraPos = s.colCount + 1;
  const extraMeta = { pos: extraPos, name: "Catatan", original: "Catatan" };
  try {
    const total = Number(
      (
        await duck.conn.runAndReadAll(
          `SELECT count(*) FROM read_parquet('${raw}') WHERE _row > ${h}`,
        )
      ).getRows()[0]![0],
    );
    const per = Math.ceil(total / n);
    r.rr.segments.clear();
    r.rr.typed.clear();
    r.rr.manifest = [];
    let rowBase = 0n;
    let extraSchema;
    for (let k = 0; k < n; k++) {
      const lo = h + 1 + k * per;
      const hi = Math.min(h + (k + 1) * per, h + total);
      const extra = opts.extra === true && k === n - 1;
      const colCount = s.colCount + (extra ? 1 : 0);
      const id = newSegmentId();
      const rawKey = `parquet/${DS}/seg/${id}/raw.parquet`;
      const segRaw = join(work, `raw-${k}.parquet`);
      const add = extra
        ? `, CASE WHEN _row = ${h} THEN 'Catatan' ELSE 'catatan ' || _row END AS c${extraPos}`
        : "";
      await duck.conn.run(
        `COPY (SELECT CAST(CASE WHEN _row <= ${h} THEN _row ELSE _row - ${lo - h - 1} END AS INTEGER) AS _row,
                * EXCLUDE (_row)${add}
              FROM read_parquet('${raw}') WHERE _row <= ${h} OR _row BETWEEN ${lo} AND ${hi} ORDER BY _row)
         TO '${segRaw.replace(/'/g, "''")}' (FORMAT parquet)`,
      );
      await r.storage.upload(rawKey, segRaw);
      const typedPath = join(work, `typed-${k}.parquet`);
      const typed = await writeTyped(duck, {
        rawPath: segRaw,
        outPath: typedPath,
        source: "csv",
        headerRow: h,
        colCount,
        columns: extra ? [...s.columns, extraMeta] : s.columns,
        overrides: [
          ...s.schema!.map((c) => choiceOf(c)),
          ...(extra ? [{ pos: extraPos, hidden: true }] : []),
        ],
        watch: async () => {},
        rowBase,
      });
      if (extra) extraSchema = typed.schema.find((c) => c.pos === extraPos);
      const typedKey = `parquet/${DS}/seg/${id}/typed-1.parquet`;
      await r.storage.upload(typedKey, typedPath);
      const maxSrcRow = h + hi - lo + 1;
      r.rr.segments.set(id, { id, rawKey, rowBase, maxSrcRow, headerRow: h, colCount });
      r.rr.manifest.push(
        r.rr.addRow({
          segmentId: id,
          typedKey,
          schemaRevision: s.schemaRevision ?? 1,
          columns: typed.schema.map((c) => c.pos),
          dataRows: typed.dataRows,
          typedBytes: null,
          profile: opts.profiles === false ? null : typed.profile,
        }),
      );
      rowBase += BigInt(maxSrcRow);
    }
    if (extraSchema) {
      s.colCount = extraPos;
      s.columns = [...s.columns, extraMeta];
      s.schema = [...s.schema!, extraSchema];
    }
  } finally {
    duck.close();
  }
  return r;
}

/** Baris semua segmen manifest berurutan ([_row, c1, c2, …]). */
async function allRows(r: Setup): Promise<unknown[][]> {
  const out: unknown[][] = [];
  for (const x of r.rr.manifestTyped()) {
    out.push(...(await readParquet(join(r.storage.dir, x.typedKey))));
  }
  return out;
}

/** Storage yang menghitung unduh (per kunci) dan unggah. */
function counting(r: Setup, failUploadAt?: number) {
  const downloads: string[] = [];
  let uploads = 0;
  const storage: RecastDeps["storage"] = {
    download: (key, dest) => {
      downloads.push(key);
      return r.storage.download(key, dest);
    },
    upload: async (key, path, type) => {
      uploads++;
      if (uploads === failUploadAt) throw new Error("worker mati");
      return r.storage.upload(key, path, type);
    },
    deleteObject: r.storage.deleteObject.bind(r.storage),
    exists: r.storage.exists.bind(r.storage),
  };
  return { storage, downloads, uploads: () => uploads };
}

describe("recast per segmen (T-040)", () => {
  // 48 baris: nilai bulat kecuali baris terakhir (segmen terakhir) yang butuh DOUBLE (7 digit pecahan).
  const ROWS = Array.from({ length: 48 }, (_, i) => `K${i};${i === 47 ? "1.1234567" : i}`);
  const CONTENT = `kode;nilai\n${ROWS.join("\n")}\n`;
  const toInteger = { columns: [{ pos: 2, type: "integer" as const }] };
  const values = (rows: unknown[][]) => rows.map((x) => x[2]);

  it("AC1: 24 segmen → progres 'Segmen k dari 24', tipe dari gabungan semua segmen, aktif atomik setelah semua selesai", async () => {
    const r = await segmented(CONTENT, 24);
    const before = [...r.rr.manifest];
    const seen: RecastProgress[] = [];
    const real = r.rr.swapTyped;
    let atSwap: { recorded: number; manifest: string[]; revision?: number } | null = null;
    r.rr.swapTyped = async (...a) => {
      atSwap = {
        recorded: r.rr.calls.addTyped.length,
        manifest: [...r.rr.manifest],
        revision: r.sheet().schemaRevision,
      };
      return real(...a);
    };
    const out = await recastSheet(r.sheetId, toInteger, {
      ...r.deps,
      progress: (p) => {
        seen.push(p);
      },
    });
    expect(out).toMatchObject({ outcome: "done", revision: 2 });
    expect(seen).toEqual(
      Array.from({ length: 24 }, (_, i) => ({ phase: "write", current: i + 1, total: 24 })),
    );
    // Sampai swap: manifest + revisi lama utuh; swap sekali setelah 24 file tercatat.
    expect(atSwap).toEqual({ recorded: 24, manifest: before, revision: 1 });
    expect(r.rr.calls.swap).toBe(1);
    expect(r.rr.manifestTyped().map((x) => x.schemaRevision)).toEqual(Array(24).fill(2));
    expect(r.sheet().schema![1]).toMatchObject({ type: "integer", castFailCount: 1, nonEmpty: 48 });
    const rows = await allRows(r);
    expect(values(rows)).toEqual([...Array.from({ length: 47 }, (_, i) => BigInt(i)), null]);
    expect(new Set(rows.map((x) => x[0])).size).toBe(48);
    // Kembali ke desimal: hanya segmen terakhir yang butuh DOUBLE, tetapi tipe fisik sama di semua.
    const typesBefore = new Set(
      await Promise.all(
        before.map(async (id) => {
          const key = r.rr.typed.get(id)!.typedKey;
          return (await parquetTypes(join(r.storage.dir, key))).c2;
        }),
      ),
    );
    expect(typesBefore).toEqual(new Set(["DECIMAL(38,6)", "DOUBLE"]));
    expect(
      await recastSheet(r.sheetId, { columns: [{ pos: 2, type: "decimal" }] }, r.deps),
    ).toMatchObject({ outcome: "done", revision: 3 });
    for (const x of r.rr.manifestTyped()) {
      expect((await parquetTypes(join(r.storage.dir, x.typedKey))).c2).toBe("DOUBLE");
    }
    expect(r.sheet().schema![1]).toMatchObject({ type: "decimal", float: true, castFailCount: 0 });
  });

  it("AC1: gagal di segmen ke-13 → revisi dan manifest lama tetap aktif", async () => {
    const r = await segmented(CONTENT, 24);
    const before = [...r.rr.manifest];
    const c = counting(r, 13);
    await expect(
      recastSheet(r.sheetId, toInteger, { ...r.deps, storage: c.storage }),
    ).rejects.toThrow(/worker mati/);
    expect(r.rr.manifest).toEqual(before);
    expect(r.sheet().schemaRevision).toBe(1);
    expect(r.rr.calls.swap).toBe(0);
  });

  it("AC1: prioritas di bawah ingest → menunggu selama ingest berjalan sebelum segmen berikutnya", async () => {
    const r = await segmented(CONTENT, 3);
    const log: string[] = [];
    let busy = 4;
    const out = await recastSheet(r.sheetId, toInteger, {
      ...r.deps,
      yieldPollMs: 1,
      ingestActive: async () => {
        log.push(busy > 0 ? "ingest" : "bebas");
        return busy-- > 0;
      },
      progress: (p) => {
        log.push(`segmen ${p.current}`);
      },
    });
    expect(out).toMatchObject({ outcome: "done" });
    // Progres dilaporkan dulu, lalu menunggu sampai ingest selesai, baru segmen dikerjakan.
    expect(log).toEqual([
      "segmen 1",
      "ingest",
      "ingest",
      "ingest",
      "ingest",
      "bebas",
      "segmen 2",
      "bebas",
      "segmen 3",
      "bebas",
    ]);
  });

  it("AC2: worker mati di tengah → percobaan ulang tidak mengulang segmen yang selesai; hasil identik", async () => {
    const jobId = "rc_cccccccccccccccccccccccc";
    // File lama tanpa profil: tahap baca juga dilanjutkan, bukan diulang.
    const r = await segmented(CONTENT, 6, { profiles: false });
    const first = counting(r, 4);
    await expect(
      recastSheet(r.sheetId, toInteger, { ...r.deps, jobId, storage: first.storage }),
    ).rejects.toThrow(/worker mati/);
    expect(r.rr.calls.saveProfile).toHaveLength(6);
    expect(r.rr.calls.addTyped).toHaveLength(3);
    const again = counting(r);
    const out = await recastSheet(r.sheetId, toInteger, {
      ...r.deps,
      jobId,
      storage: again.storage,
    });
    expect(out).toMatchObject({ outcome: "done", revision: 2 });
    // 3 segmen selesai sebelumnya: hanya 3 sisanya diunduh + ditulis; profil tidak dibaca ulang.
    expect(again.uploads()).toBe(3);
    expect(again.downloads).toHaveLength(3);
    expect(r.rr.calls.saveProfile).toHaveLength(6);
    expect(r.rr.calls.addTyped).toHaveLength(6);

    const clean = await segmented(CONTENT, 6, { profiles: false });
    expect(await recastSheet(clean.sheetId, toInteger, clean.deps)).toMatchObject({
      outcome: "done",
    });
    expect(r.sheet().schema).toEqual(clean.sheet().schema);
    const strip = (rows: unknown[][]) => rows.map(([, ...rest]) => rest);
    expect(strip(await allRows(r))).toEqual(strip(await allRows(clean)));
  });

  it("AC3: versi lama berbagi segmen → file + baris typed revisi lama utuh dan tetap dirujuk (rollback)", async () => {
    const r = await segmented(CONTENT, 4);
    const old = [...r.rr.manifest];
    r.rr.others = [old];
    expect(await recastSheet(r.sheetId, toInteger, r.deps)).toMatchObject({ outcome: "done" });
    expect(r.rr.manifest.some((id) => old.includes(id))).toBe(false);
    for (const id of old) {
      const x = r.rr.typed.get(id)!;
      expect(has(r.storage, x.typedKey)).toBe(true);
    }
    // GC (T-038): revisi lama dirujuk manifest versi lama yang masih hidup → tidak ditandai/disapu.
    const plan = gcPlan(
      {
        versions: [
          { id: "vlama", status: "READY" },
          { id: VID, status: "READY" },
        ],
        manifests: [
          ...old.map((typedId) => ({ versionId: "vlama", typedId })),
          ...r.rr.manifest.map((typedId) => ({ versionId: VID, typedId })),
        ],
        segments: [...r.rr.segments.values()].map((g) => ({
          id: g.id,
          createdByVersionId: "vlama",
          unreferencedAt: null,
          rawKey: g.rawKey,
        })),
        typed: [...r.rr.typed.values()].map((x) => ({
          id: x.id,
          segmentId: x.segmentId,
          unreferencedAt: null,
          typedKey: x.typedKey,
        })),
      },
      new Date(),
    );
    expect(plan.markTyped).toEqual([]);
    expect(plan.sweepTyped).toEqual([]);
    // Rollback ke manifest lama: datanya tetap revisi lama (nilai desimal di segmen terakhir utuh).
    r.rr.manifest = old;
    expect(values(await allRows(r)).at(-1)).toBeCloseTo(1.1234567);
  });

  it("AC4: kolom tersembunyi baru hanya di segmen baru → ubah tipenya tidak meng-cast ulang segmen lama (diproyeksikan NULL)", async () => {
    const r = await segmented(CONTENT, 4, { extra: true });
    const [a, b, c, last] = r.rr.manifest;
    const oldKeys = [a, b, c].map(
      (id) => r.rr.segments.get(r.rr.typed.get(id!)!.segmentId)!.rawKey,
    );
    const lastRaw = r.rr.segments.get(r.rr.typed.get(last!)!.segmentId)!.rawKey;
    const io = counting(r);
    const out = await recastSheet(
      r.sheetId,
      { columns: [{ pos: 3, type: "integer" }] },
      { ...r.deps, storage: io.storage },
    );
    expect(out).toMatchObject({ outcome: "done", revision: 2 });
    expect(r.rr.manifest.slice(0, 3)).toEqual([a, b, c]);
    expect(r.rr.manifest[3]).not.toBe(last);
    expect(io.downloads).toEqual([lastRaw]);
    expect(io.uploads()).toBe(1);
    expect(r.rr.manifestTyped().map((x) => x.columns)).toEqual([
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2, 3],
    ]);
    // Statistik kolom baru: 36 baris segmen lama terhitung kosong; 12 nilai "catatan N" gagal cast.
    expect(r.sheet().schema![2]).toMatchObject({
      type: "integer",
      hidden: true,
      nonEmpty: 12,
      castFailCount: 12,
      nullPct: 0.75,
    });
    // Ubah kolom yang ada di semua file → semua segmen ditulis ulang, file lama tetap tanpa c3.
    const io2 = counting(r);
    await recastSheet(r.sheetId, toInteger, { ...r.deps, storage: io2.storage });
    expect(io2.downloads.sort()).toEqual([...oldKeys, lastRaw].sort());
    const types = await parquetTypes(join(r.storage.dir, r.rr.manifestTyped()[0]!.typedKey));
    expect(Object.keys(types)).toEqual(["_row", "_src_row", "c1", "c2"]);
  });

  it("beberapa segmen: pilih ulang baris judul ditolak dengan pesan", async () => {
    const r = await segmented(CONTENT, 2);
    expect(await recastSheet(r.sheetId, { headerRow: 2 }, r.deps)).toEqual({
      outcome: "invalid",
      message: MULTI_HEADER_MESSAGE,
    });
    expect(r.sheet().schemaRevision).toBe(1);
  });

  it("file typed segmen yang dipakai ulang hilang dari storage → gagal integritas, tidak ada yang aktif", async () => {
    const r = await segmented(CONTENT, 3, { extra: true });
    const kept = r.rr.manifestTyped()[0]!.typedKey;
    r.storage.missing.add(kept);
    const out = await recastSheet(r.sheetId, { columns: [{ pos: 3, type: "integer" }] }, r.deps);
    expect(out).toMatchObject({ outcome: "failed" });
    expect(r.sheet().schemaRevision).toBe(1);
    // File baru milik job ini dihapus bersama barisnya.
    expect([...r.rr.typed.values()].some((x) => x.schemaRevision === 2)).toBe(false);
    expect(r.storage.parquetKeys().some((k) => k.includes("typed-2-"))).toBe(false);
  });
});
