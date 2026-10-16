import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
const { excerptOf } = await import("@/features/guides/reader");

/* T-022: cuplikan daftar panduan = teks polos tanpa sintaks markdown. */
describe("excerptOf (T-022)", () => {
  it("membuang sintaks, kode, gambar; teks tautan dipertahankan; tanda hubung di dalam kata tetap", () => {
    const md = [
      "# Unggah data",
      "",
      "Pilih **file** di [halaman dataset](/datasets). ![gambar](/a.png)",
      "",
      "```",
      "kode rahasia",
      "```",
      "",
      "- e-mail kantor",
      "> catatan",
    ].join("\n");
    expect(excerptOf(md)).toBe("Unggah data Pilih file di halaman dataset. e-mail kantor catatan");
  });

  it("dipotong ≤ batas dengan elipsis", () => {
    const out = excerptOf("kata ".repeat(100), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });
  it("review T-022: snake_case utuh, penekanan _x_ dibuang", () => {
    expect(excerptOf("Kolom tanggal_kirim _penting_")).toBe("Kolom tanggal_kirim penting");
  });
});
