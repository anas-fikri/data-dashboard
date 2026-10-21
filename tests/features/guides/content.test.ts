import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGuideFile } from "@/features/guides/content";
import { GUIDE_ROLES } from "@/features/guides/validation";

/* T-xfzy AC1/AC3: isi awal panduan valid (skema + batas struktur), slug unik, semua peran tercakup. */
const DIR = join(process.cwd(), "content/panduan");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();
const guides = files.map((f) => ({
  file: f,
  ...parseGuideFile(readFileSync(join(DIR, f), "utf8"), f),
}));

describe("isi panduan content/panduan (T-xfzy)", () => {
  it("setiap berkas lolos skema artikel; nama berkas NN-<slug>.md", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const g of guides) expect(g.file).toBe(`${g.file.slice(0, 2)}-${g.slug}.md`);
  });

  it("slug unik; setiap peran (termasuk Semua peran) punya artikel", () => {
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
    for (const role of GUIDE_ROLES)
      expect(
        guides.some((g) => g.role === role),
        role,
      ).toBe(true);
  });

  it("setiap konteks bantuan (unggah, skema, penyusun) punya artikel pemilik", () => {
    for (const ctx of ["UPLOAD", "SCHEMA", "BUILDER"] as const)
      expect(
        guides.some((g) => g.contextKey === ctx && g.role === "OWNER"),
        ctx,
      ).toBe(true);
  });

  it("T-064 AC2: artikel Lihat data dan data per periode terbit untuk pemilik dengan isi wajib", () => {
    const bySlug = (slug: string) => guides.find((g) => g.slug === slug);
    const view = bySlug("lihat-data-seperti-excel");
    const period = bySlug("data-per-periode");
    expect(view?.role).toBe("OWNER");
    expect(period).toMatchObject({ role: "OWNER", contextKey: "UPLOAD" });
    // Isi yang diminta AC: yang bisa/belum bisa, salin, unduh; batas, tinjauan, pulihkan.
    for (const text of [
      "## Yang bisa dan belum bisa",
      "## Menyalin ke Excel",
      "## Mengunduh tampilan",
    ])
      expect(view?.bodyMarkdown).toContain(text);
    for (const text of ["## Batas penyimpanan", "## Layar tinjauan", "**Pulihkan periode**"])
      expect(period?.bodyMarkdown).toContain(text);
    // Editor dan viewer mendapat bagian Lihat data / Perbesar di artikel perannya sendiri.
    expect(bySlug("editor-ubah-dashboard")?.bodyMarkdown).toContain(
      "## Melihat seluruh data (Lihat data)",
    );
    expect(bySlug("viewer-lihat-filter-ekspor")?.bodyMarkdown).toContain("## Memperbesar tabel");
  });

  it("T-076 AC2: artikel perhitungan PivotTable dan pivot tersimpan terbit untuk pemilik dengan isi wajib", () => {
    const bySlug = (slug: string) => guides.find((g) => g.slug === slug);
    const calc = bySlug("perhitungan-seperti-pivottable");
    const saved = bySlug("satu-pivot-banyak-widget");
    expect(calc).toMatchObject({ role: "OWNER", contextKey: "BUILDER" });
    expect(saved?.role).toBe("OWNER");
    // Isi yang diminta AC: Tampilkan nilai sebagai, field terhitung (contoh margin + rata-rata per
    // kiriman, angka Indonesia), Top N/(Lainnya), batas 4×8 + anggaran sel.
    for (const text of [
      "## Tampilkan nilai sebagai",
      "## Field terhitung",
      "### Menulis angka di rumus",
      "## N teratas dan (Lainnya)",
      "## Pivot bertingkat: 4 tingkat baris dan 8 nilai",
      "Margin",
      "Rata-rata per kiriman",
      "24.000 sel",
    ])
      expect(calc?.bodyMarkdown).toContain(text);
    // Pivot tersimpan: kelola, ikat widget, dampak edit, lepas, hapus, siapa bisa apa.
    for (const text of [
      "## Memakai pivot tersimpan di widget",
      "## Mengubah pivot tersimpan",
      "## Lepas dari sumber",
      "## Menghapus pivot tersimpan",
      "## Siapa bisa apa",
      "Perubahan berlaku di N widget pada M dashboard.",
    ])
      expect(saved?.bodyMarkdown).toContain(text);
    // Artikel lama ikut diperbarui: batas pivot, bagian editor/viewer, versi di menu akun.
    expect(bySlug("widget-pivot")?.bodyMarkdown).toContain("**Nilai** (1–8)");
    expect(bySlug("editor-ubah-dashboard")?.bodyMarkdown).toContain(
      "## Field terhitung dan pivot tersimpan",
    );
    expect(bySlug("viewer-lihat-filter-ekspor")?.bodyMarkdown).toContain(
      "## Membaca angka pivot dan grafik",
    );
    expect(bySlug("mengenal-data-dashboard")?.bodyMarkdown).toContain("**Versi**");
  });

  it("frontmatter salah ditolak dengan nama berkas", () => {
    expect(() => parseGuideFile("tanpa frontmatter", "x.md")).toThrow(/x\.md/);
    expect(() =>
      parseGuideFile("---\ntitle: A\nslug: Bukan Slug\nrole: OWNER\n---\nIsi", "y.md"),
    ).toThrow(/y\.md: slug/);
  });
});
