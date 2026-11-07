import { describe, expect, it } from "vitest";
import { chartFit, verticalBarsShown, type FitInput } from "@/components/widgets/chart-series";

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

describe("chartFit batang tegak (v1.10.0)", () => {
  it("jumlah batang tegak ditentukan lebar kartu, bukan tingginya", () => {
    const narrow = fit({ type: "bar", vertical: true, room: { width: 200, height: 400 } });
    const wide = fit({ type: "bar", vertical: true, room: { width: 800, height: 400 } });
    expect(narrow.visible).toBe(Math.floor((200 - 56) / 14));
    expect(wide.visible).toBe(12);
    // Mendatar di kartu pendek tetap dibatasi tinggi.
    expect(fit({ type: "bar", room: { width: 800, height: 120 } }).visible).toBeLessThan(12);
  });
});

describe("verticalBarsShown (review v1.10.0 #2)", () => {
  it("sama dengan chartFit: kartu sempit/pendek = semua (daftar ringkas), selain itu selebar kartu", () => {
    expect(verticalBarsShown(100, 300, 30)).toBe(30);
    expect(verticalBarsShown(200, 300, 30)).toBe(Math.floor((200 - 56) / 14));
    expect(verticalBarsShown(800, 300, 6)).toBe(6);
    expect(verticalBarsShown(180, 300, 30, true)).toBe(30);
    // Kartu pendek → daftar ringkas: semua baris.
    expect(verticalBarsShown(800, 60, 30)).toBe(30);
  });
});

describe("verticalBarsShown = potongan chartFit (properti, review v1.10.0 r3)", () => {
  it("di semua ukuran kartu: daftar ringkas ⇔ semua baris; selain itu sama dengan visible chartFit", () => {
    for (const print of [false, true]) {
      for (const rows of [1, 5, 30]) {
        for (let width = 40; width <= 900; width += 7) {
          for (let height = 20; height <= 300; height += 4) {
            const f = fit({ type: "bar", vertical: true, rows, print, room: { width, height } });
            const shown = verticalBarsShown(width, height, rows, print);
            if (f.ranked) expect(shown, `${width}×${height}`).toBe(rows);
            else expect(shown, `${width}×${height}`).toBe(f.visible);
          }
        }
      }
    }
  });
});
