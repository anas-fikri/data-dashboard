import { describe, expect, it, vi } from "vitest";
import {
  expireExport,
  ORPHAN_AGE_MS,
  runExportCleanup,
  type ExportCleanupRepo,
} from "@/features/exports/cleanup";
import { IN_FLIGHT_STALE_MS } from "@/features/exports/service";
import { deleteExportObject, EXPORT_KEY, exportKey } from "@/lib/storage/exports";

/*
 * T-017 E10/AC3: penjaga kunci hapus ekspor, job delete-export, dan sapuan export-cleanup (kedaluwarsa,
 * job basi, objek yatim > 2 jam yang tidak berlaku lagi).
 */

const U = "cmv4kljx40009oczvdmpuown0";
const A = "cmv4kljx40009oczvdmpuexpa";
const B = "cmv4kljx40009oczvdmpuexpb";
const C = "cmv4kljx40009oczvdmpuexpc";
const key = (id: string, ext = "csv") => `exports/${U}/${id}.${ext}`;
const NOW = new Date("2026-10-15T08:00:00.000Z");

describe("kunci objek ekspor", () => {
  it("hanya exports/<cuid>/<cuid>.(csv|xlsx); prefix, traversal, kunci lain ditolak", async () => {
    expect(EXPORT_KEY.test(key(A))).toBe(true);
    expect(EXPORT_KEY.test(key(A, "xlsx"))).toBe(true);
    for (const bad of [
      "exports/",
      `exports/${U}/`,
      `exports/${U}/${A}.pdf`,
      `exports/${U}/${A}.csv/x`,
      `exports/../parquet/${U}/${A}.csv`,
      `exports/${U}/../${A}.csv`,
      `parquet/${U}/${A}/${A}/typed-1.parquet`,
      `raw/${U}/${A}.csv`,
      `exports/${U.toUpperCase()}/${A}.csv`,
      ` exports/${U}/${A}.csv`,
      `exports/${U}/${A}.csv\n`,
    ]) {
      expect(EXPORT_KEY.test(bad)).toBe(false);
      await expect(deleteExportObject(bad)).rejects.toThrow("kunci objek ekspor tidak valid");
    }
    expect(exportKey(U, A, "xlsx")).toBe(key(A, "xlsx"));
    expect(() => exportKey("../x", A, "csv")).toThrow();
  });
});

function makeRepo(over: Partial<ExportCleanupRepo> = {}) {
  return {
    expired: vi.fn(async () => [] as { id: string; key: string }[]),
    one: vi.fn(async () => null),
    markDeleted: vi.fn(async () => {}),
    markDeletedByKeys: vi.fn(async () => {}),
    liveKeys: vi.fn(async () => new Set<string>()),
    failStale: vi.fn(async () => 0),
    ...over,
  };
}

describe("expireExport (job delete-export)", () => {
  it("jatuh tempo → objek dihapus + ditandai; belum jatuh tempo → dibiarkan; sudah dihapus → lewati", async () => {
    const storage = { remove: vi.fn(async () => {}), listOlderThan: vi.fn(async () => []) };
    const due = makeRepo({
      one: vi.fn(async () => ({ key: key(A), expiresAt: NOW, deletedAt: null })),
    });
    expect(await expireExport(A, key(A), { repo: due, storage, now: () => NOW })).toBe("deleted");
    expect(storage.remove).toHaveBeenCalledWith(key(A));
    expect(due.markDeleted).toHaveBeenCalledWith([A], NOW);

    storage.remove.mockClear();
    const early = makeRepo({
      one: vi.fn(async () => ({
        key: key(A),
        expiresAt: new Date(NOW.getTime() + 1000),
        deletedAt: null,
      })),
    });
    expect(await expireExport(A, key(A), { repo: early, storage, now: () => NOW })).toBe("not-due");
    expect(storage.remove).not.toHaveBeenCalled();

    const before = makeRepo({
      one: vi.fn(async () => ({ key: key(A), expiresAt: NOW, deletedAt: NOW })),
    });
    expect(await expireExport(A, key(A), { repo: before, storage, now: () => NOW })).toBe(
      "done-before",
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("baris sudah hilang (user dihapus) → objek dari data job tetap dihapus", async () => {
    const storage = { remove: vi.fn(async () => {}), listOlderThan: vi.fn(async () => []) };
    const repo = makeRepo();
    expect(await expireExport(B, key(B), { repo, storage, now: () => NOW })).toBe("deleted");
    expect(storage.remove).toHaveBeenCalledWith(key(B));
    expect(repo.markDeleted).not.toHaveBeenCalled();
  });
});

describe("runExportCleanup (export-cleanup tiap 5 menit)", () => {
  it("kedaluwarsa dihapus lalu ditandai; gagal hapus tidak ditandai (dicoba lagi)", async () => {
    const repo = makeRepo({
      expired: vi.fn(async () => [
        { id: A, key: key(A) },
        { id: B, key: key(B) },
      ]),
    });
    const storage = {
      remove: vi.fn(async (k: string) => {
        if (k === key(B)) throw new Error("storage mati");
      }),
      listOlderThan: vi.fn(async () => []),
    };
    const log = vi.fn();
    expect(await runExportCleanup({ repo, storage, now: () => NOW, log })).toEqual({
      deleted: 1,
      failed: 1,
      stale: 0,
      orphans: 0,
    });
    expect(repo.expired).toHaveBeenCalledWith(NOW, 500);
    expect(repo.markDeleted).toHaveBeenCalledWith([A], NOW);
    expect(log).toHaveBeenCalledWith("objek ekspor gagal dihapus", {
      exportId: B,
      err: "storage mati",
    });
  });

  it("ekspor QUEUED/RUNNING > 2 jam → FAILED (batas berjalan tidak terkunci selamanya)", async () => {
    const repo = makeRepo({ failStale: vi.fn(async () => 3) });
    const storage = { remove: vi.fn(async () => {}), listOlderThan: vi.fn(async () => []) };
    expect(await runExportCleanup({ repo, storage, now: () => NOW })).toMatchObject({ stale: 3 });
    expect(repo.failStale).toHaveBeenCalledWith(
      new Date(NOW.getTime() - IN_FLIGHT_STALE_MS),
      "EXPORT_FAILED",
      expect.any(String),
    );
  });

  it("objek yatim > 2 jam dihapus kecuali yang masih berlaku", async () => {
    const repo = makeRepo({ liveKeys: vi.fn(async () => new Set([key(B)])) });
    const storage = {
      remove: vi.fn(async (_key: string) => {}),
      listOlderThan: vi.fn(async () => [key(A), key(B), key(C, "xlsx")]),
    };
    expect(await runExportCleanup({ repo, storage, now: () => NOW })).toMatchObject({
      orphans: 2,
    });
    expect(storage.listOlderThan).toHaveBeenCalledWith(
      new Date(NOW.getTime() - ORPHAN_AGE_MS),
      1000,
    );
    expect(storage.remove.mock.calls.map((c) => c[0])).toEqual([key(A), key(C, "xlsx")]);
    expect(repo.markDeletedByKeys).toHaveBeenCalledWith([key(A), key(C, "xlsx")], NOW);
  });
});
