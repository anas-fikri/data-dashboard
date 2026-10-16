import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideMarkdown, guideUrl } from "@/features/guides/markdown";

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
});
