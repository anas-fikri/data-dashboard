import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ guideArticle: { findMany: vi.fn(async () => []) } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
const { contextGuides, excerptOf, isNewcomer, searchQuery, searchStatus } =
  await import("@/features/guides/reader");

/* T-7rw4: Bantuan halaman dataset = beberapa konteks; peran tetap disaring (ALL ikut). */
describe("contextGuides (T-7rw4)", () => {
  it("satu konteks atau beberapa konteks → contextKey IN, artikel terbit untuk peran halaman + ALL", async () => {
    await contextGuides(["OWNER"], "SAVED_PIVOT");
    await contextGuides(["EDITOR"], ["UPLOAD", "SAVED_PIVOT"]);
    const where = db.guideArticle.findMany.mock.calls.map(
      (c) => (c as unknown as [{ where: unknown }])[0].where,
    );
    expect(where).toEqual([
      { status: "PUBLISHED", role: { in: ["OWNER", "ALL"] }, contextKey: { in: ["SAVED_PIVOT"] } },
      {
        status: "PUBLISHED",
        role: { in: ["EDITOR", "ALL"] },
        contextKey: { in: ["UPLOAD", "SAVED_PIVOT"] },
      },
    ]);
  });
});

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
  it("review T-0vjt: baris pemisah tabel (perataan :--, :-:, --:) tidak masuk cuplikan", () => {
    expect(excerptOf("| Peran | Hak |\n| :-- | :-: | --: |\n| Pemilik | penuh |")).toBe(
      "Peran Hak Pemilik penuh",
    );
  });
  it("review T-022: snake_case utuh, penekanan _x_ dibuang", () => {
    expect(excerptOf("Kolom tanggal_kirim _penting_")).toBe("Kolom tanggal_kirim penting");
  });
});

/* T-exfc NB1: teks status memakai kata kunci bersih yang sama dengan pencarian. */
describe("searchQuery/searchStatus (T-exfc NB1)", () => {
  it("?q=%00%00 → kata kunci kosong (bukan status “”); NUL di tengah dibuang", () => {
    expect(searchQuery("\u0000\u0000")).toBe("");
    expect(searchQuery("  up\u0000load\n ")).toBe("upload");
    expect(searchStatus(searchQuery("  up\u0000load "), 3)).toBe(
      "3 artikel cocok dengan “upload”.",
    );
  });
  it("kata kunci < 2 huruf setelah dibersihkan → minta minimal 2 huruf; dipotong ≤ 100", () => {
    expect(searchStatus(searchQuery("a\u0000"), 0)).toBe("Ketik minimal 2 huruf untuk mencari.");
    expect(Array.from(searchQuery("x".repeat(150)))).toHaveLength(100);
  });
});

/* T-exfc AC3: kartu "Mulai di sini" hanya untuk pengguna yang benar-benar baru. */
describe("isNewcomer (T-exfc)", () => {
  const base = { isAdmin: false, ownsDataset: false, hasRead: false };
  it("baru = bukan admin, tanpa dataset, belum membaca", () => {
    expect(isNewcomer(base)).toBe(true);
  });
  it("admin, pemilik dataset (pemilik lama), atau sudah membaca → bukan baru", () => {
    expect(isNewcomer({ ...base, isAdmin: true })).toBe(false);
    expect(isNewcomer({ ...base, ownsDataset: true })).toBe(false);
    expect(isNewcomer({ ...base, hasRead: true })).toBe(false);
    expect(isNewcomer({ isAdmin: true, ownsDataset: true, hasRead: false })).toBe(false);
  });
});
