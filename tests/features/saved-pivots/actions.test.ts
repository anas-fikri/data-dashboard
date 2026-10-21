import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-072: Server Action pivot tersimpan — user dari sesi (bukan dari klien), IP dari header proxy
 * tepercaya, hanya field yang dikenal diteruskan ke service, hasil service dikembalikan apa adanya.
 */
const { requireUser, service } = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "user1" })),
  service: {
    createSavedPivot: vi.fn(async () => ({ ok: true, data: { id: "p1", revision: 1 } })),
    updateSavedPivot: vi.fn(async () => ({ ok: false, code: "CONFLICT", message: "basi" })),
    deleteSavedPivot: vi.fn(async () => ({
      ok: false,
      code: "IN_USE",
      message: "dipakai",
      dashboards: [{ id: "d1", name: "A" }],
    })),
  },
}));
vi.mock("@/features/auth/session", () => ({ requireUser }));
vi.mock("@/features/saved-pivots/service", () => service);
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ TRUST_PROXY: true }) }));

const actions = await import("@/features/saved-pivots/actions");

beforeEach(() => vi.clearAllMocks());

describe("Server Action pivot tersimpan", () => {
  it("buat: field asing (userId, revision, datasetId palsu) tidak diteruskan", async () => {
    const r = await actions.createSavedPivotAction("ds1", {
      name: "Laba",
      spec: { sheetId: "s" },
      userId: "lain",
      revision: 9,
    } as never);
    expect(r).toEqual({ ok: true, data: { id: "p1", revision: 1 } });
    expect(requireUser).toHaveBeenCalled();
    expect(service.createSavedPivot).toHaveBeenCalledWith(
      "user1",
      "ds1",
      { name: "Laba", spec: { sheetId: "s" } },
      "198.51.100.7",
    );
  });

  it("ubah: baseRevision diteruskan; kode galat service dikembalikan apa adanya", async () => {
    const r = await actions.updateSavedPivotAction("p1", { baseRevision: 2, name: "X" });
    expect(r).toEqual({ ok: false, code: "CONFLICT", message: "basi" });
    expect(service.updateSavedPivot).toHaveBeenCalledWith(
      "user1",
      "p1",
      { name: "X", spec: undefined, baseRevision: 2 },
      "198.51.100.7",
    );
    await actions.updateSavedPivotAction("p1", null as never);
    expect(service.updateSavedPivot).toHaveBeenLastCalledWith(
      "user1",
      "p1",
      { name: undefined, spec: undefined, baseRevision: undefined },
      "198.51.100.7",
    );
  });

  it("hapus: IN_USE + daftar dashboard sampai ke klien", async () => {
    const r = await actions.deleteSavedPivotAction("p1", 3);
    expect(r).toMatchObject({ ok: false, code: "IN_USE", dashboards: [{ id: "d1", name: "A" }] });
    expect(service.deleteSavedPivot).toHaveBeenCalledWith("user1", "p1", "198.51.100.7", 3);
  });
});
