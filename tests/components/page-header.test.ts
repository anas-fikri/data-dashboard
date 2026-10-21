import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/ui/page-header";

/*
 * T-exfc AC3: aksi berupa komponen yang merender null (mis. GuideHelp tanpa artikel bantuan) tidak
 * meninggalkan wadah aksi yang menempati ruang; tanpa aksi → tanpa wadah.
 */
const html = (actions?: ReactNode) =>
  renderToStaticMarkup(createElement(PageHeader, { title: "Dataset", actions }));
const Nothing = () => null;

describe("PageHeader: wadah aksi (T-exfc)", () => {
  it("aksi yang merender null → wadah kosong disembunyikan (empty:hidden)", () => {
    const out = html(createElement(Nothing));
    const box = /<div data-slot="page-actions" class="([^"]*)"><\/div>/.exec(out);
    expect(box?.[1]).toContain("empty:hidden");
  });
  it("tanpa aksi → tanpa wadah; dengan aksi → wadah berisi aksi", () => {
    expect(html()).not.toContain("page-actions");
    expect(html(createElement("button", null, "Bantuan"))).toMatch(
      /data-slot="page-actions"[^>]*><button>Bantuan<\/button><\/div>/,
    );
  });
  it("≥ 768 px aksi berbaris dan boleh turun baris (T-075: 5 aksi dashboard meluap 195 px di 768 px)", () => {
    const box = /data-slot="page-actions" class="([^"]*)"/.exec(
      html(createElement("button", null, "Bantuan")),
    );
    expect(box?.[1]).toContain("md:flex-row");
    expect(box?.[1]).toContain("md:flex-wrap");
  });
});
