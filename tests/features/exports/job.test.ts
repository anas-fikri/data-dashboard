import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  removeStaleExportDirs,
  runExportJob,
  tooLargeMessage,
  type ExportJobDeps,
  type ExportJobRow,
} from "@/features/exports/job";
import type { ExportParams } from "@/features/exports/schema";
import { COLUMN_UNAVAILABLE_VIEWER } from "@/features/query/service";
import { createSaxParser } from "@/lib/xlsx/parser";
import type { RawValue } from "@/lib/xlsx/types";
import {
  DASH,
  OWNER,
  ROWS,
  TYPED_KEY,
  VIEWER,
  WID,
  WIDGETS,
  cabangOf,
  fakeQueryRepo,
  omzetOf,
  parseCsv,
  tanggalOf,
  writeFixtureParquet,
} from "./fixtures";

/*
 * T-017 job ekspor di worker: repo/storage palsu, DuckDB + parquet sungguhan. Akses dicek ulang di
 * worker (peran sekarang, D6), batas baris EXPORT_TOO_LARGE, unggah + DONE + jadwal hapus, galat per
 * peran, tenggat, dan ekspor yang dihapus di tengah jalan.
 */

const EXPORT_ID = "cmv4kljx40009oczvdmpuexp0";
const NOT_ALLOWED =
  "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.";

let root: string;
let fixture: string;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-export-job-"));
  fixture = join(root, "fixture.parquet");
  await writeFixtureParquet(fixture);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function setup(
  over: {
    userId?: string;
    widget?: string;
    format?: "CSV" | "XLSX";
    params?: Partial<ExportParams>;
    deps?: Partial<ExportJobDeps>;
    roles?: Parameters<typeof fakeQueryRepo>[0];
  } = {},
) {
  const tmpRoot = mkdtempSync(join(root, "tmp-"));
  const stored = mkdtempSync(join(root, "s3-"));
  let row: ExportJobRow | null = {
    id: EXPORT_ID,
    userId: over.userId ?? OWNER,
    dashboardId: DASH,
    widgetId: WID(over.widget ?? "table"),
    format: over.format ?? "CSV",
    status: "QUEUED",
    params: { requestedAt: "2026-03-15T05:00:00.000Z", ...over.params },
    fileName: "Penjualan-20260315-1200.csv",
    key: null,
    title: WIDGETS[over.widget ?? "table"]!.title,
  };
  const state: {
    status: string;
    failed?: { code: string; message: string };
    done?: { key: string };
  } = {
    status: "QUEUED",
  };
  const objects = new Map<string, string>();
  const repo = {
    load: vi.fn(async (_id: string) =>
      row
        ? {
            ...row,
            status: state.status as ExportJobRow["status"],
            key: state.done?.key ?? null,
          }
        : null,
    ),
    start: vi.fn(async () => {
      if (!row || (state.status !== "QUEUED" && state.status !== "RUNNING")) return false;
      state.status = "RUNNING";
      return true;
    }),
    finish: vi.fn(async (_id: string, done: { key: string }) => {
      if (!row || state.status !== "RUNNING") return false;
      state.status = "DONE";
      state.done = done;
      return true;
    }),
    fail: vi.fn(async (_id: string, code: string, message: string) => {
      state.status = "FAILED";
      state.failed = { code, message };
    }),
    exists: vi.fn(async () => row !== null),
  };
  const storage = {
    download: vi.fn(async (key: string, dest: string) => {
      expect(key).toBe(TYPED_KEY);
      copyFileSync(fixture, dest);
    }),
    upload: vi.fn(
      async (key: string, path: string, _type: string, _o: { contentDisposition?: string }) => {
        const to = join(stored, key.replace(/\//g, "_"));
        copyFileSync(path, to);
        objects.set(key, to);
      },
    ),
    remove: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
  const scheduleDelete = vi.fn(async () => {});
  const deps: ExportJobDeps = {
    repo,
    query: { repo: fakeQueryRepo(over.roles) },
    storage,
    scheduleDelete,
    tmpRoot,
    maxRows: 1_000_000,
    ttlMs: 60 * 60 * 1000,
    deadlineMs: 60_000,
    now: () => new Date("2026-03-15T05:01:00.000Z"),
    ...over.deps,
  };
  return {
    deps,
    repo,
    storage,
    scheduleDelete,
    state,
    objects,
    tmpRoot,
    drop: () => {
      row = null;
    },
  };
}

describe("runExportJob", () => {
  it("CSV tabel: unggah ke exports/<user>/<id>.csv, DONE + kedaluwarsa 60 menit, hapus dijadwalkan", async () => {
    const t = setup({
      params: { dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 3"] }] },
    });
    const r = await runExportJob(EXPORT_ID, t.deps);
    const expected = Array.from({ length: ROWS }, (_, i) => i).filter(
      (i) => cabangOf(i) === "Cabang 3",
    );
    expect(r).toMatchObject({ outcome: "done", rows: expected.length });
    const key = `exports/${OWNER}/${EXPORT_ID}.csv`;
    expect(t.storage.upload).toHaveBeenCalledWith(
      key,
      expect.any(String),
      "text/csv; charset=utf-8",
      {
        contentDisposition:
          "attachment; filename=\"Penjualan-20260315-1200.csv\"; filename*=UTF-8''Penjualan-20260315-1200.csv",
      },
    );
    expect(t.state.done).toEqual({
      key,
      rows: expected.length,
      bytes: expect.any(Number),
      finishedAt: new Date("2026-03-15T05:01:00.000Z"),
      expiresAt: new Date("2026-03-15T06:01:00.000Z"),
    });
    expect(t.scheduleDelete).toHaveBeenCalledWith(EXPORT_ID, key, 60 * 60 * 1000);
    const lines = parseCsv(readFileSync(t.objects.get(key)!, "utf8").slice(1));
    expect(lines.slice(1).map((l) => l[0])).toEqual(expected.map(cabangOf));
    // Direktori kerja dibersihkan.
    expect(readdirSync(t.tmpRoot)).toEqual([]);
  });

  it("XLSX: dibaca ulang parser proyek, sheet bernama judul widget, teks formula tetap string", async () => {
    const t = setup({ format: "XLSX" });
    const r = await runExportJob(EXPORT_ID, t.deps);
    expect(r).toMatchObject({ outcome: "done", rows: ROWS });
    const key = `exports/${OWNER}/${EXPORT_ID}.xlsx`;
    expect(t.storage.upload.mock.calls[0]![2]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const rows: RawValue[][] = [];
    await createSaxParser().parse(
      t.objects.get(key)!,
      { sheetNames: ['Penjualan Cabang; "Q1"'], tmpDir: root },
      (_s, _n, v) => rows.push([...v]),
    );
    expect(rows[0]).toEqual(["Cabang", "Omzet", "Tanggal", "Waktu", "Aktif", "Durasi", "@Catatan"]);
    expect(rows.length).toBe(ROWS + 1);
    expect(rows[1]!.slice(0, 3)).toEqual([cabangOf(0), omzetOf(0), tanggalOf(0)]);
    expect(rows[1]![6]).toBe("=1+1");
  });

  describe("pivot (T-9bc2)", () => {
    // Fixture: Cabang (baris) × bulan Tanggal (pemisah), nilai = Total Omzet.
    const months = ["Jan 2026", "Feb 2026", "Mar 2026"];
    const sums = new Map<string, number[]>();
    for (let i = 0; i < ROWS; i++) {
      const cells = sums.get(cabangOf(i)) ?? [0, 0, 0];
      cells[tanggalOf(i).getUTCMonth()]! += omzetOf(i);
      sums.set(cabangOf(i), cells);
    }
    const total = (c: number[]) => c.reduce((a, b) => a + b, 0);
    const expected = [...sums].sort((a, b) => total(b[1]) - total(a[1]));

    it("CSV: header Cabang + bulan + Total, baris urut nilai terbesar, baris Total = jumlah semua", async () => {
      const t = setup({ widget: "pivot" });
      const r = await runExportJob(EXPORT_ID, t.deps);
      expect(r).toMatchObject({ outcome: "done", rows: expected.length + 1 });
      const lines = parseCsv(
        readFileSync(t.objects.get(`exports/${OWNER}/${EXPORT_ID}.csv`)!, "utf8").slice(1),
      );
      expect(lines[0]!.slice(0, 4)).toEqual(["Cabang", ...months]);
      expect(lines[0]![4]).toMatch(/Omzet/);
      expected.forEach(([cabang, cells], i) => {
        const row = lines[i + 1]!;
        expect(row[0]).toBe(cabang);
        cells.forEach((v, m) => expect(Number(row[m + 1])).toBeCloseTo(v, 4));
        expect(Number(row[4])).toBeCloseTo(total(cells), 4);
      });
      const last = lines[expected.length + 1]!;
      expect(last[0]).toBe("Total");
      expect(Number(last[4])).toBeCloseTo(total(expected.flatMap(([, c]) => c)), 3);
      expect(readdirSync(t.tmpRoot)).toEqual([]);
    });

    it("XLSX: sel angka bertipe angka, sheet bernama judul widget, filter dashboard berlaku", async () => {
      const t = setup({
        widget: "pivot",
        format: "XLSX",
        params: { dashboardFilters: [{ column: "Cabang", op: "in", values: ["Cabang 3"] }] },
      });
      expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done", rows: 2 });
      const rows: RawValue[][] = [];
      await createSaxParser().parse(
        t.objects.get(`exports/${OWNER}/${EXPORT_ID}.xlsx`)!,
        { sheetNames: [WIDGETS.pivot!.title], tmpDir: root },
        (_s, _n, v) => rows.push([...v]),
      );
      const cells = sums.get("Cabang 3")!;
      expect(rows[0]!.slice(0, 4)).toEqual(["Cabang", ...months]);
      expect(rows[1]![0]).toBe("Cabang 3");
      expect(typeof rows[1]![1]).toBe("number");
      expect(rows[1]![4] as number).toBeCloseTo(total(cells), 4);
      expect(rows[2]![0]).toBe("Total");
      expect(rows[2]![4] as number).toBeCloseTo(total(cells), 4);
    });
  });

  it("review INT-R3-1: XLSX terurut lewat parquet kerja → urutan layar (Omzet turun, seri: _row) utuh", async () => {
    const t = setup({ format: "XLSX", params: { sort: { column: 2, dir: "desc" } } });
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done", rows: ROWS });
    const rows: RawValue[][] = [];
    await createSaxParser().parse(
      t.objects.get(`exports/${OWNER}/${EXPORT_ID}.xlsx`)!,
      { sheetNames: ['Penjualan Cabang; "Q1"'], tmpDir: root },
      (_s, _n, v) => rows.push([...v]),
    );
    const expected = Array.from({ length: ROWS }, (_, i) => i)
      .sort((a, b) => omzetOf(b) - omzetOf(a) || a - b)
      .map(omzetOf);
    expect(rows.slice(1).map((r) => r[1])).toEqual(expected);
    // parquet kerja ikut dibersihkan bersama direktori kerja.
    expect(readdirSync(t.tmpRoot)).toEqual([]);
  });

  it("AC2: hasil > batas → FAILED EXPORT_TOO_LARGE dengan saran mempersempit filter, tanpa unggah", async () => {
    const t = setup({ deps: { maxRows: 100 } });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({
      outcome: "failed",
      code: "EXPORT_TOO_LARGE",
    });
    expect(t.state.failed).toEqual({
      code: "EXPORT_TOO_LARGE",
      message: tooLargeMessage(ROWS, 100),
    });
    expect(tooLargeMessage(1_234_567, 1_000_000)).toBe(
      "Hasil 1.234.567 baris melebihi batas 1.000.000 baris. Persempit filter lalu ekspor lagi.",
    );
    expect(t.storage.upload).not.toHaveBeenCalled();
  });

  it("akses dicabut setelah permintaan → FAILED NOT_FOUND tanpa unduh parquet", async () => {
    const t = setup({ userId: VIEWER, roles: { roles: {} } });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({ outcome: "failed", code: "NOT_FOUND" });
    expect(t.storage.download).not.toHaveBeenCalled();
  });

  it("D6 di worker: filter kolom yang tidak diizinkan → INVALID NOT_ALLOWED", async () => {
    const t = setup({
      params: { dashboardFilters: [{ column: "Omzet", op: "range", gte: 1 }] },
    });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({ outcome: "failed", code: "INVALID" });
    expect(t.state.failed?.message).toBe(NOT_ALLOWED);
    expect(t.storage.download).not.toHaveBeenCalled();
  });

  it("E8: viewer mendapat pesan umum COLUMN_UNAVAILABLE (tanpa nama kolom tersembunyi)", async () => {
    const viewer = setup({ userId: VIEWER, widget: "hidden" });
    await runExportJob(EXPORT_ID, viewer.deps);
    expect(viewer.state.failed).toEqual({
      code: "COLUMN_UNAVAILABLE",
      message: COLUMN_UNAVAILABLE_VIEWER,
    });
    const owner = setup({ widget: "hidden" });
    await runExportJob(EXPORT_ID, owner.deps);
    expect(owner.state.failed?.message).toContain('"Rahasia"');
  });

  it("E9: preset tanggal memakai requestedAt, bukan jam worker", async () => {
    const t = setup({
      params: {
        requestedAt: "2026-01-31T16:59:00.000Z", // 31 Jan 23:59 WIB
        dashboardFilters: [{ column: "Tanggal", op: "preset", preset: "this_month" }],
      },
    });
    const r = await runExportJob(EXPORT_ID, t.deps);
    const jan = Array.from({ length: ROWS }, (_, i) => i).filter(
      (i) => tanggalOf(i).getUTCMonth() === 0,
    );
    expect(r).toMatchObject({ outcome: "done", rows: jan.length });
  });

  it("idempoten: status selain QUEUED/RUNNING dilewati; ekspor dihapus di tengah → objek dihapus", async () => {
    const done = setup();
    done.state.status = "DONE";
    expect(await runExportJob(EXPORT_ID, done.deps)).toEqual({ outcome: "skipped" });
    expect(done.repo.start).not.toHaveBeenCalled();

    const gone = setup();
    gone.repo.finish.mockImplementationOnce(async () => {
      gone.drop();
      return false;
    });
    expect(await runExportJob(EXPORT_ID, gone.deps)).toEqual({ outcome: "skipped" });
    expect(gone.storage.remove).toHaveBeenCalledWith(`exports/${OWNER}/${EXPORT_ID}.csv`);
    expect(gone.objects.size).toBe(0);
    expect(gone.scheduleDelete).not.toHaveBeenCalled();
  });

  it("tenggat terlewati saat menyiapkan data → FAILED EXPORT_TIMEOUT, tanpa unggah", async () => {
    const t = setup({ deps: { deadlineMs: 50 } });
    t.storage.download.mockImplementationOnce(async (_k: string, dest: string) => {
      await new Promise((r) => setTimeout(r, 80));
      copyFileSync(fixture, dest);
    });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({
      outcome: "failed",
      code: "EXPORT_TIMEOUT",
    });
    expect(t.storage.upload).not.toHaveBeenCalled();
  });

  it("galat tak terduga dilempar (BullMQ mengulang) dan objek setengah jadi dihapus", async () => {
    const t = setup();
    t.repo.finish.mockRejectedValueOnce(new Error("db putus"));
    await expect(runExportJob(EXPORT_ID, t.deps)).rejects.toThrow("db putus");
    expect(t.storage.remove).toHaveBeenCalled();
    expect(t.state.status).toBe("RUNNING");
    expect(readdirSync(t.tmpRoot)).toEqual([]);
  });

  it("INT-1: dua run tumpang tindih — run yang kalah tidak menghapus objek baris DONE", async () => {
    const t = setup();
    const key = `exports/${OWNER}/${EXPORT_ID}.csv`;
    // Run A tertahan tepat sebelum unggah; run B (lock lepas → replika lain) berjalan sampai DONE.
    let atUpload!: () => void;
    const reachedUpload = new Promise<void>((r) => (atUpload = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const upload = t.storage.upload.getMockImplementation()!;
    const depsA: ExportJobDeps = {
      ...t.deps,
      storage: {
        ...t.storage,
        upload: async (...args: Parameters<typeof upload>) => {
          atUpload();
          await gate;
          return upload(...args);
        },
      },
    };
    const runA = runExportJob(EXPORT_ID, depsA);
    await reachedUpload;
    expect(t.state.status).toBe("RUNNING");
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done" });
    expect(t.state).toMatchObject({ status: "DONE", done: { key } });
    // A lanjut: unggah ke key yang sama, finish() → false (baris sudah DONE) → objek TIDAK dihapus.
    release();
    expect(await runA).toEqual({ outcome: "skipped" });
    expect(t.repo.finish).toHaveBeenCalledTimes(2);
    expect(t.storage.remove).not.toHaveBeenCalled();
    expect(t.objects.has(key)).toBe(true);
    expect(t.state).toMatchObject({ status: "DONE", done: { key } });
    expect(t.scheduleDelete).toHaveBeenCalledTimes(1);
    expect(readdirSync(t.tmpRoot)).toEqual([]);
  });

  it("INT-1: finish() sudah commit DONE lalu koneksi putus → galat dilempar, objek tetap ada", async () => {
    const t = setup();
    const key = `exports/${OWNER}/${EXPORT_ID}.csv`;
    t.repo.finish.mockImplementationOnce(async (_id: string, done: { key: string }) => {
      t.state.status = "DONE";
      t.state.done = done;
      throw new Error("koneksi putus setelah commit");
    });
    await expect(runExportJob(EXPORT_ID, t.deps)).rejects.toThrow("koneksi putus");
    expect(t.storage.remove).not.toHaveBeenCalled();
    expect(t.objects.has(key)).toBe(true);
    // Ulangan BullMQ melihat DONE → dilewati, objek tetap.
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({ outcome: "skipped" });
    expect(t.objects.has(key)).toBe(true);

    // Baca ulang juga gagal → objek dibiarkan (sapuan yatim yang membereskan bila memang yatim).
    const u = setup();
    u.repo.finish.mockRejectedValueOnce(new Error("db putus"));
    u.repo.load
      .mockImplementationOnce(u.repo.load.getMockImplementation()!)
      .mockRejectedValueOnce(new Error("db masih putus"));
    await expect(runExportJob(EXPORT_ID, u.deps)).rejects.toThrow("db putus");
    expect(u.storage.remove).not.toHaveBeenCalled();
    expect(u.objects.has(key)).toBe(true);
  });

  it("removeStaleExportDirs hanya menghapus direktori export-*", () => {
    const dir = mkdtempSync(join(root, "stale-"));
    mkdtempSync(join(dir, "export-"));
    mkdtempSync(join(dir, "ingest-"));
    expect(removeStaleExportDirs(dir)).toBe(1);
    expect(readdirSync(dir).every((n) => n.startsWith("ingest-"))).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });
});
