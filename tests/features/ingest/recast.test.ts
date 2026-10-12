import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest } from "@/features/ingest/ingest";
import {
  OLD_TYPED_TTL_MS,
  recastSheet,
  type RecastDeps,
  type RecastRepo,
} from "@/features/ingest/recast";
import type { LockStore } from "@/lib/lock";
import { readParquet, testRoot, VID, type FakeRepo, type FakeStorage } from "./fakes";

/* Recast (T-007 AC 5): satu per sheet (lock), typed-<rev+1>, file lama dihapus 1 jam kemudian. */
const t = testRoot("ingest-recast");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

/** Redis palsu: SET NX + compare-and-delete/pexpire. `lose()` meniru lock kedaluwarsa lalu diambil lain. */
function fakeLock(): LockStore & { held: Map<string, string>; lose(): void } {
  const held = new Map<string, string>();
  return {
    held,
    lose: () => {
      for (const k of held.keys()) held.set(k, "milik-proses-lain");
    },
    setNx: async (key, value) => {
      if (held.has(key)) return null;
      held.set(key, value);
      return "OK";
    },
    delIfEquals: async (key, value) => (held.get(key) === value && held.delete(key) ? 1 : 0),
    pexpireIfEquals: async (key, value) => (held.get(key) === value ? 1 : 0),
  };
}

function recastRepo(repo: FakeRepo): RecastRepo {
  return {
    loadSheet: async (id) => {
      const s = repo.sheets.get(id);
      if (!s?.rawKey) return null;
      return {
        versionId: VID,
        versionStatus: "READY",
        rawKey: s.rawKey,
        typedKey: s.typedKey ?? null,
        schemaRevision: s.schemaRevision ?? 0,
        headerRow: s.headerRow,
        colCount: s.colCount,
        columns: s.columns,
        schema: s.schema ?? null,
        source: "csv",
      };
    },
    swapTyped: async (id, expected, next) => {
      const s = repo.sheets.get(id);
      if (!s || (s.schemaRevision ?? 0) !== expected) return false;
      Object.assign(s, next);
      return true;
    },
  };
}

async function setup(content: string) {
  const s = t.setup(t.file(`r-${Math.random().toString(36).slice(2)}.csv`, content));
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  const [sheetId] = [...s.repo.sheets.keys()];
  const deletes: [string, number][] = [];
  const lock = fakeLock();
  const deps: RecastDeps = {
    repo: recastRepo(s.repo),
    storage: s.storage,
    lock,
    scheduleDelete: async (key, ms) => {
      deletes.push([key, ms]);
    },
    tmpRoot: join(t.root, "tmp"),
    duckMemory: "256MB",
  };
  return {
    ...s,
    sheetId: sheetId!,
    deps,
    deletes,
    lock,
    sheet: () => s.repo.sheets.get(sheetId!)!,
  };
}

const has = (storage: FakeStorage, key: string) => existsSync(join(storage.dir, key));
const DATA = `kode;nilai\nA;1\nB;2\nC;x\n`;

describe("recast", () => {
  it("dua recast bersamaan → hanya satu dieksekusi; typed-2 dibuat, typed-1 masih ada sampai 1 jam", async () => {
    const r = await setup(DATA);
    const typed1 = r.sheet().typedKey!;
    expect(typed1).toMatch(/typed-1\.parquet$/);
    const outcomes = await Promise.all([
      recastSheet(r.sheetId, { columns: [{ pos: 2, type: "text" }] }, r.deps),
      recastSheet(r.sheetId, { columns: [{ pos: 2, type: "text" }] }, r.deps),
    ]);
    expect(outcomes.map((o) => o.outcome).sort()).toEqual(["busy", "done"]);
    expect(r.sheet()).toMatchObject({ schemaRevision: 2 });
    expect(r.sheet().typedKey).toMatch(/typed-2-[0-9a-f]{12}\.parquet$/);
    expect(has(r.storage, r.sheet().typedKey!)).toBe(true);
    expect(has(r.storage, typed1)).toBe(true);
    expect(r.deletes).toEqual([[typed1, OLD_TYPED_TTL_MS]]);
    expect(OLD_TYPED_TTL_MS).toBe(60 * 60 * 1000);
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
    const deps: RecastDeps = {
      ...r.deps,
      repo: { ...r.deps.repo, swapTyped: async () => false },
    };
    expect(await recastSheet(r.sheetId, {}, deps)).toEqual({ outcome: "stale" });
    expect(r.sheet().typedKey).toBe(before);
    expect(r.storage.parquetKeys().some((k) => k.includes("typed-2"))).toBe(false);
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
        deletePrefix: r.storage.deletePrefix.bind(r.storage),
      },
    };
    await expect(recastSheet(r.sheetId, {}, broken)).rejects.toThrow(/ECONNRESET/);
    expect(r.lock.held.size).toBe(0);
    expect((await recastSheet(r.sheetId, {}, r.deps)).outcome).toBe("done");
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
    const deps: RecastDeps = {
      ...r.deps,
      repo: {
        ...r.deps.repo,
        loadSheet: async (id) => ({
          ...(await r.deps.repo.loadSheet(id))!,
          versionStatus: "INGESTING",
        }),
      },
    };
    expect(await recastSheet(r.sheetId, {}, deps)).toEqual({ outcome: "busy" });
    expect(r.lock.held.size).toBe(0);
  });

  it("lock hilang di tengah → tidak mengganti pointer, file miliknya dihapus", async () => {
    const r = await setup(DATA);
    const before = r.sheet().typedKey;
    r.lock.setNx = (async (key: string, value: string) => {
      r.lock.held.set(key, value);
      setTimeout(() => r.lock.lose(), 0);
      return "OK";
    }) as typeof r.lock.setNx;
    const out = await recastSheet(r.sheetId, {}, { ...r.deps, renewMs: 1 });
    expect(out).toEqual({ outcome: "busy" });
    expect(r.sheet().typedKey).toBe(before);
    expect(r.storage.parquetKeys().filter((k) => k.includes("typed-"))).toEqual([before]);
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
});
