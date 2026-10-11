import { describe, expect, it } from "vitest";
import { deriveLabel, type VersionStatus } from "@/features/datasets/label";
import { isIdShape, nameKeyOf, validateDatasetInput } from "@/features/datasets/validation";

const v = (id: string, status: VersionStatus, errorMessage: string | null = null) => ({
  id,
  status,
  errorMessage,
});

describe("deriveLabel", () => {
  it("tanpa versi → kosong tanpa badge", () => {
    expect(deriveLabel(null, null)).toEqual({ state: "kosong", badge: null });
  });

  it("versi aktif = versi terbaru → siap tanpa badge", () => {
    expect(deriveLabel("a", v("a", "READY"))).toEqual({ state: "siap", badge: null });
  });

  it("READY aktif + terbaru FAILED → siap + badge gagal dengan pesan", () => {
    expect(deriveLabel("a", v("b", "FAILED", "Sheet 2 baris 18: format rusak"))).toEqual({
      state: "siap",
      badge: { kind: "failed", text: "Gagal", message: "Sheet 2 baris 18: format rusak" },
    });
  });

  it("belum ada versi aktif + terbaru memproses → kosong + badge memproses", () => {
    expect(deriveLabel(null, v("a", "INGESTING"))).toEqual({
      state: "kosong",
      badge: { kind: "processing", text: "Memproses" },
    });
  });

  it("UPLOADING/UPLOADED → mengunggah; AWAITING_MAPPING → menunggu pemetaan", () => {
    expect(deriveLabel(null, v("a", "UPLOADING")).badge?.text).toBe("Mengunggah");
    expect(deriveLabel(null, v("a", "UPLOADED")).badge?.text).toBe("Mengunggah");
    expect(deriveLabel("x", v("a", "AWAITING_MAPPING")).badge?.kind).toBe("awaiting_mapping");
  });

  it("terbaru READY tetapi bukan aktif (rollback) → tanpa badge", () => {
    expect(deriveLabel("a", v("b", "READY")).badge).toBeNull();
  });
});

describe("validateDatasetInput", () => {
  it("merapikan spasi dan membuat nameKey tanpa peka kapital", () => {
    const r = validateDatasetInput("  Penjualan   Cabang  ", "  ");
    expect(r).toEqual({
      ok: true,
      name: "Penjualan Cabang",
      nameKey: "penjualan cabang",
      description: null,
    });
    expect(nameKeyOf("PENJUALAN  cabang")).toBe("penjualan cabang");
  });

  it("menolak nama kosong, nama > 80, deskripsi > 500", () => {
    expect(validateDatasetInput("", null)).toMatchObject({ ok: false, field: "name" });
    expect(validateDatasetInput("a".repeat(81), null)).toMatchObject({ ok: false, field: "name" });
    expect(validateDatasetInput("ok", "d".repeat(501))).toMatchObject({
      ok: false,
      field: "description",
    });
  });

  it("menolak karakter kontrol dan format (bidi override, zero-width)", () => {
    expect(validateDatasetInput("Gaji‮txt.exe", null)).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(validateDatasetInput("Data​ku", null)).toMatchObject({ ok: false, field: "name" });
    expect(validateDatasetInput("Data\u0007", null)).toMatchObject({ ok: false, field: "name" });
    expect(validateDatasetInput("Penjualan Q3 – Ringkas", null)).toMatchObject({ ok: true });
  });

  it("isIdShape hanya menerima bentuk cuid", () => {
    expect(isIdShape("cmv3z0sxg0000ocicnzrwpr0g")).toBe(true);
    expect(isIdShape("../etc")).toBe(false);
    expect(isIdShape("ABC")).toBe(false);
    expect(isIdShape(null)).toBe(false);
  });
});
