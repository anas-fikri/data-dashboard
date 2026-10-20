import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES } from "@/features/auth/rate-limit";
import { GridGate, gridEngine } from "@/features/query/grid-gate";
import { QueryEngine } from "@/lib/duckdb/engine";

/*
 * T-042: isolasi beban grid — maksimal 2 dari 4 slot global, 2 in-flight per pengguna, jatah per
 * pengguna mesin (widget) tidak tersentuh, dan aturan rate sendiri.
 */
let root: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-grid-gate-"));
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "tmp"),
    memoryLimit: "256MB",
    threads: 1,
    maxTempSize: "1GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 300,
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

const deferred = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
};

describe("RULES.grid", () => {
  it("aturan rate sendiri 300/menit, terpisah dari query 600/menit", () => {
    expect(RULES.grid).toEqual({ name: "grid:user", limit: 300, windowSec: 60 });
    expect(RULES.grid.name).not.toBe(RULES.query.name);
  });
});

describe("GridGate + gridEngine", () => {
  it("grid memegang paling banyak 2 slot global; widget tetap dapat 2 slot tanpa QUERY_BUSY", async () => {
    const gate = new GridGate({ maxGlobal: 2, perUser: 2, queueWaitMs: 2_000 });
    const grid = gridEngine(engine, gate);
    const hold = deferred();
    let peak = 0;
    // 3 penggulir × 2 permintaan = 6 permintaan grid; hanya 2 yang memegang slot global.
    const scrolls = ["a", "b", "c"].flatMap((u) =>
      [0, 1].map(() =>
        grid.withUser!(u, (left) =>
          grid.withGlobal!(async () => {
            peak = Math.max(peak, gate.activeGlobal);
            await hold.p;
          }, left),
        ),
      ),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(gate.activeGlobal).toBe(2);
    // Pengguna "a" (sedang menggulir) memuat dashboard: 2 widget sekaligus lewat jatah mesin biasa.
    const widgets = await Promise.all(
      [1, 2].map((k) => engine.run("a", `SELECT ${k} AS v`, {}, 5_000)),
    );
    expect(widgets.map((w) => w.rows[0]![0])).toEqual([1, 2]);
    hold.open();
    await Promise.all(scrolls);
    expect(peak).toBe(2);
    expect(gate.activeGlobal).toBe(0);
  });

  it("lebih dari 2 permintaan grid in-flight per pengguna → QueryBusyError langsung", async () => {
    const gate = new GridGate({ maxGlobal: 2, perUser: 2, queueWaitMs: 2_000 });
    const grid = gridEngine(engine, gate);
    const hold = deferred();
    const two = [0, 1].map(() => grid.withSlot("u", () => hold.p));
    await expect(grid.withSlot("u", async () => 1)).rejects.toMatchObject({
      name: "QueryBusyError",
    });
    // Pengguna lain tidak terpengaruh jatah "u".
    const other = grid.withSlot("v", async () => "ok");
    hold.open();
    await Promise.all(two);
    expect(await other).toBe("ok");
    expect(await grid.withSlot("u", async () => 2)).toBe(2);
  });

  it("antre slot grid global melewati batas waktu → QueryBusyError, slot tidak bocor", async () => {
    const gate = new GridGate({ maxGlobal: 1, perUser: 2, queueWaitMs: 50 });
    const grid = gridEngine(engine, gate);
    const hold = deferred();
    const first = grid.withSlot("a", () => hold.p);
    await expect(grid.withSlot("b", async () => 1)).rejects.toMatchObject({
      name: "QueryBusyError",
    });
    hold.open();
    await first;
    expect(gate.activeGlobal).toBe(0);
    expect(await grid.withSlot("b", async () => 3)).toBe(3);
  });

  it("exec grid memakai mesin yang sama (sandbox, timeout)", async () => {
    const grid = gridEngine(engine, new GridGate({ maxGlobal: 2, perUser: 2, queueWaitMs: 500 }));
    const r = await grid.withSlot("a", () => grid.exec("SELECT 42 AS v", {}, 5_000));
    expect(r.rows[0]![0]).toBe(42);
  });
});
