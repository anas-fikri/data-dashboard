import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Choice } from "@/components/dashboards/config-fields";
import { SEARCH_MIN } from "@/components/ui/search-select";
import { highlightParts, searchOptions } from "@/lib/search";

/* T-jwhc: pencarian pintar di dropdown panjang. */
const opt = (...labels: string[]) => labels.map((label) => ({ label }));
const labels = (r: { option: { label: string } }[]) => r.map((h) => h.option.label);

describe("searchOptions", () => {
  const cols = opt("Customer", "Tanggal Kirim", "Tanggal Terima", "Kota Tujuan", "Café Jakarta");

  it("kosong → semua pilihan, urutan asli, tanpa sorotan", () => {
    const r = searchOptions(cols, "  ");
    expect(labels(r)).toEqual(cols.map((c) => c.label));
    expect(r.every((h) => h.hits.length === 0)).toBe(true);
  });

  it("tidak peka huruf besar/kecil dan aksen", () => {
    const r = searchOptions(cols, "CAFE");
    expect(labels(r)).toEqual(["Café Jakarta"]);
    expect(r[0]!.hits).toEqual([0, 1, 2, 3]);
  });

  it("singkatan per kata, urutan kata bebas", () => {
    expect(labels(searchOptions(cols, "tgl krm"))).toEqual(["Tanggal Kirim"]);
    expect(labels(searchOptions(cols, "kirim tanggal"))).toEqual(["Tanggal Kirim"]);
    expect(labels(searchOptions(cols, "tgl"))).toEqual(["Tanggal Kirim", "Tanggal Terima"]);
  });

  it("inisial: tk → Tanggal Kirim, kt → Kota Tujuan", () => {
    const r = searchOptions(cols, "tk");
    expect(labels(r)).toEqual(["Tanggal Kirim"]);
    expect(r[0]!.hits).toEqual([0, 8]);
    expect(labels(searchOptions(cols, "kt"))).toEqual(["Kota Tujuan"]);
  });

  it("awalan kata didahulukan dari potongan di tengah", () => {
    expect(labels(searchOptions(opt("Pertanggungan", "Tanggal"), "tang"))).toEqual([
      "Tanggal",
      "Pertanggungan",
    ]);
  });

  it("tidak cocok → kosong; emoji dihitung satu code point", () => {
    expect(searchOptions(cols, "zzz")).toEqual([]);
    expect(searchOptions(opt("📦 Paket"), "paket")[0]!.hits).toEqual([2, 3, 4, 5, 6]);
  });

  it("highlightParts menggabungkan huruf bersebelahan", () => {
    expect(highlightParts("Tanggal Kirim", [0, 8])).toEqual([
      { text: "T", hit: true },
      { text: "anggal ", hit: false },
      { text: "K", hit: true },
      { text: "irim", hit: false },
    ]);
  });
});

describe("Choice: kotak cari hanya untuk daftar panjang", () => {
  const render = (n: number) =>
    renderToStaticMarkup(
      createElement(Choice<string>, {
        label: "Kolom",
        value: "1",
        options: Array.from({ length: n }, (_, i) => ({
          value: String(i + 1),
          label: `Kolom ${i + 1}`,
        })),
        onChange: () => {},
      }),
    );

  it(`≥ ${SEARCH_MIN} pilihan → pemicu combobox listbox berlabel, nilai terpilih tampil`, () => {
    const html = render(SEARCH_MIN);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Kolom<\/label><button[^>]*id="\1"/);
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("<span>Kolom 1</span>");
  });

  it("daftar pendek tetap Select biasa", () => {
    expect(render(SEARCH_MIN - 1)).not.toContain('aria-haspopup="listbox"');
  });
});
