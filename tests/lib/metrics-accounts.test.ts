import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { duration, jobsText } from "@/features/metrics/format";
import { rankAccounts } from "@/features/metrics/view";
import { GridGate } from "@/features/query/grid-gate";
import { QueryEngine } from "@/lib/duckdb/engine";
import { queryStarted, runAs, takeSnapshot } from "@/lib/metrics/accounts";
import {
  ACCOUNT_WINDOW_MIN,
  KEY,
  readAccountActivity,
  saveAccountSnapshot,
} from "@/lib/metrics/store";

/*
 * T-qed9 perkiraan per akun: pelacak waktu eksekusi per user (AsyncLocalStorage), penyimpanan Redis (ember per
 * menit 15 menit, query berjalan per proses), ranking, dan pemasangan di mesin DuckDB (hanya waktu memegang slot
 * global, bukan antre).
 */
describe("pelacak", () => {
  it("di luar runAs tidak dihitung; query berjalan dihitung sampai snapshot lalu lanjut", () => {
    takeSnapshot(0); // kosongkan sisa uji lain
    let t = 1_000;
    const clock = () => t;
    expect(queryStarted(clock)).toBeTypeOf("function");
    const end = runAs("u1", () => queryStarted(clock));
    const quick = runAs("u2", () => queryStarted(clock));
    t = 1_500;
    quick();
    quick(); // idempoten
    t = 4_000;
    expect(takeSnapshot(4_000)).toEqual({ running: { u1: 1 }, ms: { u1: 3_000, u2: 500 } });
    t = 6_000;
    end();
    expect(takeSnapshot(7_000)).toEqual({ running: {}, ms: { u1: 2_000 } });
    expect(takeSnapshot(8_000)).toEqual({ running: {}, ms: {} });
  });
});

/** Redis palsu secukupnya: hash, multi (hset/hincrbyfloat/pexpire). */
function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const ttl = new Map<string, number>();
  const h = (k: string) => hashes.get(k) ?? (hashes.set(k, new Map()), hashes.get(k)!);
  const api = {
    hgetall: async (k: string) => Object.fromEntries(hashes.get(k) ?? []),
    hset: async (k: string, f: string, v: string) => (h(k).set(f, v), 1),
    hdel: async (k: string, ...fs: string[]) => (fs.forEach((f) => hashes.get(k)?.delete(f)), 1),
    multi() {
      const ops: (() => void)[] = [];
      const m = {
        hset: (k: string, f: string, v: string) => (ops.push(() => h(k).set(f, v)), m),
        hincrbyfloat: (k: string, f: string, v: number) => (
          ops.push(() => h(k).set(f, String(Number(h(k).get(f) ?? 0) + v))),
          m
        ),
        pexpire: (k: string, ms: number) => (ops.push(() => ttl.set(k, ms)), m),
        exec: async () => ops.forEach((f) => f()),
      };
      return m;
    },
  };
  return { api, hashes, ttl };
}

describe("penyimpanan per akun", () => {
  it("detik dijumlah per menit dalam jendela 15 menit; query berjalan dari proses segar saja", async () => {
    const { api, hashes, ttl } = fakeRedis();
    const r = api as never;
    const t0 = 100 * 60_000;
    await saveAccountSnapshot(r, "app:a", { running: { u1: 2 }, ms: { u1: 4_000, u2: 0 } }, t0);
    await saveAccountSnapshot(r, "app:a", { running: { u1: 1 }, ms: { u1: 1_000 } }, t0 + 50_000);
    await saveAccountSnapshot(r, "worker:b", { running: {}, ms: { u2: 6_000 } }, t0 + 60_000);
    // Ember di luar jendela (16 menit lalu) tidak ikut.
    await saveAccountSnapshot(
      r,
      "app:old",
      { running: { u3: 1 }, ms: { u3: 9_000 } },
      t0 - 16 * 60_000,
    );
    expect(ttl.get(KEY.acctSec + 100)).toBe((ACCOUNT_WINDOW_MIN + 5) * 60_000);
    expect(hashes.get(KEY.acctSec + 100)!.has("u2")).toBe(false); // 0 ms tidak ditulis

    const now = t0 + 65_000;
    const a = await readAccountActivity(r, now);
    expect(Object.fromEntries(a)).toEqual({
      u1: { running: 1, seconds: 5 },
      u2: { running: 0, seconds: 6 },
    });
    // Laporan proses > 10 menit dibuang.
    expect(hashes.get(KEY.acctRun)!.has("app:old")).toBe(false);
    // Proses app berhenti melapor (> 30 dtk) → query berjalan tidak dihitung lagi.
    expect((await readAccountActivity(r, t0 + 50_000 + 60_000)).get("u1")!.running).toBe(0);
  });
});

describe("rankAccounts + format", () => {
  const users = [
    { id: "a", email: "a@x.id", name: "Ani" },
    { id: "b", email: "b@x.id", name: null },
    { id: "c", email: "c@x.id", name: null },
    { id: "d", email: "d@x.id", name: null },
  ];
  it("terberat dulu (detik → berjalan → job); akun tanpa aktivitas dibuang; dibatasi", () => {
    const activity = new Map([
      ["a", { running: 0, seconds: 30 }],
      ["b", { running: 2, seconds: 30 }],
      ["d", { running: 0, seconds: 0 }],
    ]);
    const jobs = new Map([["c", { upload: 1, recast: 0, export: 2 }]]);
    const rows = rankAccounts(users, activity, jobs, 10);
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(rows[2]!.jobs).toEqual({ upload: 1, recast: 0, export: 2 });
    expect(rankAccounts(users, activity, jobs, 1)).toHaveLength(1);
  });

  it("durasi dan teks job", () => {
    expect([duration(0), duration(44.6), duration(130), duration(3600), duration(3900)]).toEqual([
      "0 dtk",
      "45 dtk",
      "2 mnt 10 dtk",
      "1 jam",
      "1 jam 5 mnt",
    ]);
    expect(jobsText({ upload: 1, recast: 0, export: 2 })).toBe("1 unggahan, 2 ekspor");
    expect(jobsText({ upload: 0, recast: 0, export: 0 })).toBe("–");
  });
});

describe("pemasangan di mesin DuckDB", () => {
  const root = mkdtempSync(join(tmpdir(), "dd-acct-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("widget (withUser → withGlobal) dan grid (gerbang grid) dihitung untuk user masing-masing", async () => {
    const engine = await QueryEngine.create({
      dataDir: join(root, "cache"),
      tmpDir: join(root, "tmp"),
      memoryLimit: "128MB",
      threads: 1,
      maxTempSize: "256MB",
      maxConcurrency: 2,
      perUser: 2,
      queueWaitMs: 5_000,
    });
    {
      takeSnapshot();
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await engine.withUser("widget-user", () => engine.withGlobal(() => sleep(30)));
      const gate = new GridGate({ maxGlobal: 1, perUser: 2, queueWaitMs: 5_000 });
      await gate.withUser("grid-user", () => engine.withGlobal(() => sleep(30)));
      // Tanpa user (mis. tugas internal) → tidak dihitung.
      await engine.withGlobal(() => sleep(5));
      const snap = takeSnapshot();
      expect(Object.keys(snap.ms).sort()).toEqual(["grid-user", "widget-user"]);
      expect(snap.ms["widget-user"]).toBeGreaterThanOrEqual(25);
      expect(snap.running).toEqual({});
    }
  });
});
