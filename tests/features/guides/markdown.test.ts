import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideMarkdown, guideUrl } from "@/features/guides/markdown";
import { guideBodyProblem, guideInputSchema } from "@/features/guides/validation";

/* T-020 AC2/AC6: markdown panduan disanitasi — tag/URL berbahaya hilang, tautan luar rel aman. */
const ORIGINS = ["https://dashboard.pcpexpress.com", "https://storage.pcpexpress.com"];
const html = (md: string) =>
  renderToStaticMarkup(createElement(GuideMarkdown, { markdown: md, origins: ORIGINS }));

describe("GuideMarkdown (T-020)", () => {
  it("AC2: <script> dihapus dan tidak dieksekusi (HTML mentah tidak dirender)", () => {
    const out = html("Halo <script>alert(1)</script> **tebal**\n\n<script src=x></script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("<strong>tebal</strong>");
  });

  it("AC6: javascript:, data:, iframe, object, form, style, img luar dihapus", () => {
    const out = html(
      [
        "[klik](javascript:alert(1)) [data](data:text/html,<b>x</b>) [JS](JaVaScRiPt:alert(1))",
        '<iframe src="https://evil.example"></iframe>',
        '<object data="x"></object><form action="/x"><input></form><style>body{}</style>',
        "![luar](https://evil.example/a.png) ![proto](//evil.example/b.png)",
      ].join("\n\n"),
    );
    expect(out).not.toMatch(/javascript:|data:text|<iframe|<object|<form|<style|<input/i);
    expect(out).not.toContain("evil.example");
  });

  it("tautan eksternal rel noopener noreferrer; tautan internal/mailto tanpa rel; gambar self/storage tetap", () => {
    const out = html(
      "[luar](https://example.org/x) [dalam](/dashboards) [app](https://dashboard.pcpexpress.com/panduan) [surel](mailto:a@pcpexpress.com)\n\n![a](/panduan/a.png) ![b](https://storage.pcpexpress.com/guides/b.png)",
    );
    expect(out).toMatch(/href="https:\/\/example\.org\/x"[^>]*rel="noopener noreferrer"/);
    expect(out).toContain('href="/dashboards"');
    expect(out).not.toMatch(/href="\/dashboards"[^>]*rel=/);
    expect(out).not.toMatch(/dashboard\.pcpexpress\.com\/panduan"[^>]*rel=/);
    expect(out).toContain('href="mailto:a@pcpexpress.com"');
    expect(out).toContain('src="/panduan/a.png"');
    expect(out).toContain('src="https://storage.pcpexpress.com/guides/b.png"');
  });

  it("guideUrl: aturan href/src", () => {
    expect(guideUrl("javascript:alert(1)", "href", ORIGINS)).toBe("");
    expect(guideUrl(" data:text/html,x", "href", ORIGINS)).toBe("");
    expect(guideUrl("#bagian", "href", ORIGINS)).toBe("#bagian");
    expect(guideUrl("relatif/a", "src", ORIGINS)).toBe("");
    expect(guideUrl("https://storage.pcpexpress.com.evil.example/x.png", "src", ORIGINS)).toBe("");
  });
  it("review AC5: judul isi di bawah judul artikel (h2) — # → h3, #### → h6; blok kode bisa difokus", () => {
    const out = html("# Satu\n\n## Dua\n\n#### Empat\n\n```\nkode panjang\n```");
    expect(out).not.toMatch(/<h[12][\s>]/);
    expect(out).toMatch(/<h3[^>]*>Satu<\/h3>/);
    expect(out).toMatch(/<h4[^>]*>Dua<\/h4>/);
    expect(out).toMatch(/<h6[^>]*>Empat<\/h6>/);
    expect(out).toMatch(/<pre[^>]*tabindex="0"/);
  });
  it("review R3: http:host tanpa // (tautan + autolink) tetap dianggap eksternal → rel", () => {
    const out = html("[a](http:evil.example) [b](https:/evil.example/x) <http:evil.example>");
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
  });

  it("review R2: struktur bertingkat/penekanan berlebih ditolak saat simpan dan tidak dirender", () => {
    const bombs = [">".repeat(2000), "> - ".repeat(500), "*a".repeat(5000), "*_".repeat(3000)];
    for (const md of bombs) {
      expect(guideBodyProblem(md), md.slice(0, 8)).not.toBeNull();
      const t = performance.now();
      expect(html(md)).toContain("Isi artikel tidak dapat ditampilkan");
      expect(performance.now() - t).toBeLessThan(200);
      const r = guideInputSchema.safeParse({
        title: "A",
        slug: "a",
        role: "ALL",
        contextKey: null,
        bodyMarkdown: md,
      });
      expect(r.success).toBe(false);
    }
    const prose =
      "## Langkah\n\nUnggah **file Excel** lalu periksa [skema](/datasets) dan `kolom_a`.\n\n- satu\n  - dua\n    1. tiga\n\n> catatan *penting*\n\n";
    const real = prose.repeat(Math.floor(20_000 / prose.length));
    expect(guideBodyProblem(real)).toBeNull();
    expect(html(real)).toContain("<strong>file Excel</strong>");
  });
});
