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

  it("frontmatter salah ditolak dengan nama berkas", () => {
    expect(() => parseGuideFile("tanpa frontmatter", "x.md")).toThrow(/x\.md/);
    expect(() =>
      parseGuideFile("---\ntitle: A\nslug: Bukan Slug\nrole: OWNER\n---\nIsi", "y.md"),
    ).toThrow(/y\.md: slug/);
  });
});
