import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Announce } from "@/components/guides/announce";

/*
 * T-exfc AC1: jumlah hasil cari diumumkan. Teks yang sudah ada saat halaman dimuat tidak dibacakan
 * pembaca layar, jadi HTML server memuat wilayah status yang KOSONG; pesan diisi setelah tampil (e2e).
 */
describe("Announce (T-exfc)", () => {
  it("HTML server: wilayah status tersembunyi yang masih kosong", () => {
    const out = renderToStaticMarkup(createElement(Announce, { message: "3 artikel cocok." }));
    expect(out).toMatch(/^<p role="status" class="sr-only"[^>]*><\/p>$/);
  });
});
