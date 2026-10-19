import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest } from "@/features/ingest/ingest";
import { recastSheet, type RecastRepo } from "@/features/ingest/recast";
import type { ActiveSnapshot } from "@/features/ingest/refresh";
import { fakeLock, rowColumns, testRoot, VID, type FakeRepo } from "./fakes";

/*
 * T-036 (ADR-0008): segmen + manifest. Typed baru memuat `_row BIGINT = rowBase + baris fisik` dan
 * `_src_row`; rowBase diambil dari rowHighWater sheet logis (lineage) yang naik atomik sebesar baris
 * fisik terbesar; sheet versi refresh yang berpasangan membawa lineage sheet aktif; recast memakai
 * rowBase segmen yang sama (_row deterministik).
 */
const t = testRoot("ingest-segments");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const csv = (rows: string[][]) => `${rows.map((r) => r.join(";")).join("\n")}\n`;
const DATA = [
  ["kode", "nilai"],
  ["A", "1"],
  ["B", "2"],
  ["C", "3"],
  ["D", "4"],
];
const LEGACY_HW = 2_147_483_647n;

async function ingest(rows: string[][], prepare: (repo: FakeRepo) => void = () => {}) {
  const s = t.setup(t.file(`s-${Math.random().toString(36).slice(2)}.csv`, csv(rows)));
  prepare(s.repo);
  expect(await runIngest(VID, s.repo, s.storage, s.opts)).toEqual({ outcome: "done", sheets: 1 });
  const [sheetId] = [...s.repo.sheets.keys()];
  const sheet = s.repo.sheets.get(sheetId!)!;
  const segment = s.repo.segments.get(sheet.segmentId!)!;
  return { ...s, sheetId: sheetId!, sheet, segment };
}

describe("T-036 segmen", () => {
  it("AC2: versi pertama → lineage baru, rowBase 0, _row BIGINT = baris fisik + _src_row, high-water naik", async () => {
    const r = await ingest(DATA);
    expect(r.repo.lineages.has(r.sheet.lineageId!)).toBe(true);
    expect(r.segment).toMatchObject({
      lineageId: r.sheet.lineageId,
      rawKey: r.sheet.rawKey,
      rawRows: 5,
      headerRow: 1,
      rowBase: 0n,
    });
    const rows = await rowColumns(join(r.storage.dir, r.sheet.typedKey!));
    expect(rows.map((x) => x.type)).toEqual(["BIGINT", "BIGINT", "BIGINT", "BIGINT"]);
    expect(rows.map((x) => [x.row, x.src])).toEqual([
      [2n, 2],
      [3n, 3],
      [4n, 4],
      [5n, 5],
    ]);
    expect(r.segment.maxSrcRow).toBe(5);
    expect(r.repo.lineages.get(r.sheet.lineageId!)).toBe(5n);
  });

  it("AC2 + AC3: versi refresh berpasangan → lineage aktif dibawa, rowBase = high-water lama (tanpa bentrok)", async () => {
    const first = await ingest(DATA);
    const active: ActiveSnapshot = {
      versionId: "aktif0000000000000001",
      sheets: [
        {
          id: "sheetaktif00000000001",
          name: first.sheet.name,
          index: 0,
          headerRow: first.sheet.headerRow,
          schemaRevision: 1,
          schema: first.sheet.schema!,
          lineageId: "lineagelegacy00000001",
        },
      ],
    };
    const r = await ingest(DATA, (repo) => {
      repo.active = active;
      // Lineage hasil migrasi: typed lama ber-_row INTEGER → mulai dari 2^31 − 1.
      repo.lineages.set("lineagelegacy00000001", LEGACY_HW);
    });
    expect(r.sheet.lineageId).toBe("lineagelegacy00000001");
    expect(r.segment.rowBase).toBe(LEGACY_HW);
    const rows = await rowColumns(join(r.storage.dir, r.sheet.typedKey!));
    expect(rows.map((x) => x.row)).toEqual([2n, 3n, 4n, 5n].map((n) => LEGACY_HW + n));
    expect(rows.map((x) => x.src)).toEqual([2, 3, 4, 5]);
    expect(r.repo.lineages.get("lineagelegacy00000001")).toBe(LEGACY_HW + 5n);
    expect(r.repo.sheetMap).toEqual({ sheetaktif00000000001: r.sheetId });
  });

  it("AC2: recast memakai rowBase segmen yang sama → _row identik di setiap revisi", async () => {
    const r = await ingest(DATA, (repo) => {
      repo.active = null;
    });
    // rowBase bukan 0: segmen lineage yang sudah pernah membagikan `_row`.
    r.segment.rowBase = 1000n;
    const repo: RecastRepo = {
      loadSheet: async () => ({
        versionId: VID,
        versionStatus: "READY",
        rawKey: r.sheet.rawKey!,
        typedKey: r.sheet.typedKey ?? null,
        schemaRevision: r.sheet.schemaRevision ?? 0,
        headerRow: r.sheet.headerRow,
        colCount: r.sheet.colCount,
        columns: r.sheet.columns,
        schema: r.sheet.schema ?? null,
        source: "csv",
        rowBase: r.segment.rowBase,
      }),
      swapTyped: async (_id, expected, next) => {
        if ((r.sheet.schemaRevision ?? 0) !== expected) return false;
        Object.assign(r.sheet, next);
        return true;
      },
    };
    const deps = {
      repo,
      storage: r.storage,
      lock: fakeLock(),
      tmpRoot: join(t.root, "tmp"),
      duckMemory: "256MB",
    };
    for (const type of ["text", "integer"] as const) {
      expect(await recastSheet(r.sheetId, { columns: [{ pos: 2, type }] }, deps)).toMatchObject({
        outcome: "done",
      });
      const rows = await rowColumns(join(r.storage.dir, r.sheet.typedKey!));
      expect(rows.map((x) => [x.row, x.src])).toEqual([
        [1002n, 2],
        [1003n, 3],
        [1004n, 4],
        [1005n, 5],
      ]);
    }
  });
});
