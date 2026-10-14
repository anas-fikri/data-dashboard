import { describe, expect, it } from "vitest";
import {
  NETWORK_ERROR,
  activationBusy,
  formatJakarta,
  keepNotice,
  versionErrorText,
  versionStatusView,
  versionTime,
} from "@/components/datasets/version-history-status";

/* T-013: riwayat versi — status tidak hanya lewat warna, waktu Asia/Jakarta, galat yang bisa ditindak. */
describe("versionStatusView", () => {
  it("versi aktif selalu bertanda Aktif (satu-satunya nada primer)", () => {
    expect(versionStatusView({ status: "READY", active: true })).toEqual({
      kind: "active",
      label: "Aktif",
      tone: "primary",
    });
    const others = (["READY", "FAILED", "AWAITING_MAPPING", "INGESTING", "UPLOADED"] as const).map(
      (status) => versionStatusView({ status, active: false }),
    );
    expect(others.every((s) => s.tone !== "primary")).toBe(true);
  });

  it("memetakan status lain ke label Indonesia", () => {
    const label = (status: Parameters<typeof versionStatusView>[0]["status"]) =>
      versionStatusView({ status, active: false }).label;
    expect(label("READY")).toBe("Siap");
    expect(label("FAILED")).toBe("Gagal");
    expect(label("AWAITING_MAPPING")).toBe("Menunggu pemetaan");
    expect(label("INGESTING")).toBe("Memproses");
    expect(label("UPLOADED")).toBe("Menunggu diproses");
  });
});

describe("versionTime + formatJakarta", () => {
  it("memakai waktu selesai diproses, atau waktu unggah bila belum selesai", () => {
    const createdAt = "2026-10-14T01:00:00.000Z";
    expect(versionTime({ createdAt, finishedAt: "2026-10-14T02:00:00.000Z" })).toEqual({
      verb: "Diproses",
      iso: "2026-10-14T02:00:00.000Z",
    });
    expect(versionTime({ createdAt, finishedAt: null })).toEqual({
      verb: "Diunggah",
      iso: createdAt,
    });
  });

  it("menampilkan jam Asia/Jakarta (UTC+7), juga untuk objek Date", () => {
    // 17.30 UTC = 00.30 WIB keesokan harinya.
    const text = formatJakarta("2026-10-13T17:30:00.000Z");
    expect(text).toMatch(/14 Okt 2026/);
    expect(text).toMatch(/00[.:]30/);
    expect(formatJakarta(new Date("2026-10-13T17:30:00.000Z"))).toBe(text);
  });
});

describe("versionErrorText", () => {
  it("NOT_FOUND memakai teks UI, bukan pesan server (D2)", () => {
    expect(versionErrorText("NOT_FOUND", "Versi milik orang lain")).toMatch(/Muat ulang halaman/);
  });

  it("kode lain memakai pesan server bila ada, selain itu teks UI", () => {
    expect(versionErrorText("RATE_LIMITED", "Coba lagi dalam 2 menit.")).toBe(
      "Coba lagi dalam 2 menit.",
    );
    expect(versionErrorText("DATASET_BUSY", "")).toMatch(/^Tunggu file baru selesai diproses/);
  });

  it("kode tak dikenal: pesan server apa adanya, atau teks jaringan bila kosong", () => {
    expect(versionErrorText("BARU", "Pesan baru")).toBe("Pesan baru");
    expect(versionErrorText("BARU", "")).toBe(NETWORK_ERROR);
  });
});

describe("activationBusy", () => {
  it("versi terbaru diunggah/diproses/menunggu pemetaan → sibuk (server pasti DATASET_BUSY)", () => {
    for (const kind of ["uploading", "processing", "awaiting_mapping"] as const) {
      expect(activationBusy({ kind, text: "x" })).toBe(true);
    }
  });

  it("tanpa badge atau versi terbaru gagal → tidak sibuk", () => {
    expect(activationBusy(null)).toBe(false);
    expect(activationBusy({ kind: "failed", text: "Gagal", message: "rusak" })).toBe(false);
  });
});

describe("keepNotice", () => {
  const notice = { id: 1, versionId: "v2", fileName: "oktober.xlsx" };

  it("tetap tampil selama versi yang disebut masih aktif", () => {
    expect(keepNotice(notice, "v2")).toBe(notice);
  });

  it("dibuang bila versi aktif berganti ke versi lain atau tidak ada", () => {
    expect(keepNotice(notice, "v3")).toBeNull();
    expect(keepNotice(notice, null)).toBeNull();
    expect(keepNotice(null, "v2")).toBeNull();
  });
});
