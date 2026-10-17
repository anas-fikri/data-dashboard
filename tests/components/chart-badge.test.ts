import { describe, expect, it } from "vitest";
import { chartFit, type FitInput } from "@/components/widgets/chart-series";

/* T-032: kartu grafik terlalu pendek untuk keterangan "Menampilkan N dari M" → lencana "N dari M". */
const fit = (over: Partial<FitInput> & Pick<FitInput, "type" | "room">) =>
  chartFit({ rows: 12, categories: 40, legendRows: 0, others: false, partial: false, ...over });

describe("chartFit.badge (T-032)", () => {
  it("batang pendek (grafik muat, keterangan tidak) → 'N dari M' dari batang yang tergambar", () => {
    const f = fit({ type: "bar", room: { width: 300, height: 80 } });
    expect(f).toMatchObject({ note: "none", ranked: false });
    expect(f.badge).toBe(`${f.visible} dari 40`);
    expect(f.visible).toBeLessThan(40);
    expect(f.full).toContain(`Menampilkan ${f.visible} dari 40 kategori`);
  });

  it("jumlah keseluruhan tidak tersedia → 'N teratas'; semua kategori tampil → tanpa lencana", () => {
    const partial = fit({ type: "bar", room: { width: 300, height: 80 }, partial: true });
    expect(partial.badge).toBe(`${partial.visible} teratas`);
    const all = fit({ type: "bar", room: { width: 300, height: 80 }, rows: 1, categories: 1 });
    expect(all.badge).toBe("");
  });

  it("keterangan muat, daftar peringkat, atau pai → tanpa lencana", () => {
    expect(fit({ type: "bar", room: { width: 300, height: 240 } }).badge).toBe("");
    expect(fit({ type: "bar", room: { width: 300, height: 40 } })).toMatchObject({
      ranked: true,
      badge: "",
    });
    expect(fit({ type: "bar", room: { width: 120, height: 80 } }).badge).toBe("");
    expect(
      fit({ type: "pie", room: { width: 300, height: 80 }, legendRows: 6, others: true }).badge,
    ).toBe("");
  });
});

describe("chartFit.badgeCompact (T-2nkx)", () => {
  it("'N dari M' → 'N/M' (ribuan id-ID); 'N teratas' tetap; tanpa lencana → kosong", () => {
    const f = fit({ type: "bar", room: { width: 300, height: 80 }, categories: 1234 });
    expect(f.badge).toBe(`${f.visible} dari 1.234`);
    expect(f.badgeCompact).toBe(`${f.visible}/1.234`);
    const partial = fit({ type: "bar", room: { width: 300, height: 80 }, partial: true });
    expect(partial.badgeCompact).toBe(partial.badge);
    expect(fit({ type: "bar", room: { width: 300, height: 240 } }).badgeCompact).toBe("");
  });
});
