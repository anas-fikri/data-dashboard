import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createConfigSaves, withUnsaved } from "@/components/dashboards/config-saves";
import { WidgetConfigForm } from "@/components/dashboards/widget-config";
import { panelSaveStatus, type Source } from "@/components/dashboards/widget-config-model";
import type { WidgetView } from "@/features/dashboards/service";
import { MISSING_COLUMN } from "@/features/widgets/remap";

/*
 * T-013 review putaran 10: simpanan pengaturan widget yang sedang dikirim / gagal (R10-SM-2, R10-3)
 * dan baris status panel saat gagal (R10-1).
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const sortAsc = { type: "bar", spec: { sort: "value_asc" } };
const sortDesc = { type: "bar", spec: { sort: "value_desc" } };

describe("R10-SM-2: spec yang sedang dikirim", () => {
  it("panel yang dibuka ulang memakai spec terkirim sampai simpanan itu dijawab", () => {
    const s = createConfigSaves();
    s.start("w", sortAsc);
    expect(s.unsaved("w")).toBe(sortAsc);
    s.finish("w", sortAsc, null);
    expect(s.unsaved("w")).toBeUndefined();
  });

  it("jawaban simpanan lama tidak melepas simpanan yang lebih baru untuk widget yang sama", () => {
    const s = createConfigSaves();
    s.start("w", sortAsc);
    s.start("w", sortDesc); // suntingan berikutnya masuk antrean di belakangnya
    s.finish("w", sortAsc, null);
    expect(s.unsaved("w")).toBe(sortDesc);
    s.finish("w", sortDesc, null);
    expect(s.unsaved("w")).toBeUndefined();
  });

  it("form mulai dari spec terkirim, tanpa tanda dialihkan; tanpa simpanan → widget apa adanya", () => {
    const w: WidgetView = {
      id: "w",
      type: "kpi",
      title: "Omzet",
      spec: {},
      version: "v1",
      retargeted: true,
    };
    // Versi pengaturan (T-016) tetap milik widget tersimpan: simpanan berikutnya membawanya.
    expect(withUnsaved(w, sortAsc)).toEqual({
      id: "w",
      type: "bar",
      title: "Omzet",
      spec: { sort: "value_asc" },
      version: "v1",
      retargeted: undefined,
    });
    expect(withUnsaved(w, undefined)).toBe(w);
  });
});

describe("R10-3: simpanan gagal diingat sampai berhasil", () => {
  it("gagal bukan STALE → dikirim ulang dan alasannya ada; berhasil (juga kiriman ulang) → hilang", () => {
    const s = createConfigSaves();
    s.start("w", sortAsc);
    s.finish("w", sortAsc, "Server sedang bermasalah. Coba lagi beberapa saat lagi.");
    expect(s.retries()).toEqual([["w", sortAsc]]);
    expect(s.errors()).toEqual({ w: "Server sedang bermasalah. Coba lagi beberapa saat lagi." });
    // Panel yang dibuka ulang setelah gagal mulai dari perubahan yang belum tersimpan itu.
    expect(s.unsaved("w")).toBe(sortAsc);

    s.start("w", sortAsc); // "Coba lagi" mengirim objek yang sama
    s.finish("w", sortAsc, null);
    expect(s.retries()).toEqual([]);
    expect(s.errors()).toEqual({});
    expect(s.unsaved("w")).toBeUndefined();
  });

  it("simpanan berikutnya yang berhasil untuk widget itu menggantikan yang gagal; widget lain tetap", () => {
    const s = createConfigSaves();
    s.finish("a", sortAsc, "gagal a");
    s.finish("b", sortAsc, "gagal b");
    s.finish("a", sortDesc, null);
    expect(s.retries()).toEqual([["b", sortAsc]]);
    expect(s.errors()).toEqual({ b: "gagal b" });
  });

  it("gagal lagi menyimpan alasan terbaru; widget dihapus → tidak dikirim ulang", () => {
    const s = createConfigSaves();
    s.finish("w", sortAsc, "gagal 1");
    s.finish("w", sortDesc, "gagal 2");
    expect(s.retries()).toEqual([["w", sortDesc]]);
    expect(s.errors()).toEqual({ w: "gagal 2" });
    s.start("w", sortAsc);
    s.forget("w");
    expect(s.retries()).toEqual([]);
    expect(s.unsaved("w")).toBeUndefined();
  });

  it("status panel: alasan dari editor menang; 'error' lokal tanpa alasan = sudah dikirim ulang", () => {
    expect(panelSaveStatus("saving", "gagal")).toBe("saving");
    expect(panelSaveStatus("error", "gagal")).toBe("error");
    // Dibuka ulang setelah gagal: panel belum menyimpan apa pun, alasan tetap tampil.
    expect(panelSaveStatus("idle", "gagal")).toBe("error");
    // "Coba lagi"/"Selesai" di toolbar berhasil mengirim ulang.
    expect(panelSaveStatus("error", undefined)).toBe("saved");
    expect(panelSaveStatus("saved", undefined)).toBe("saved");
    expect(panelSaveStatus("idle", undefined)).toBe("idle");
  });
});

describe("R10-1: baris status saat gagal simpan terlihat dan terbaca sebagai kesalahan", () => {
  const sources: Source[] = [
    {
      id: S1,
      name: "Penjualan",
      columns: [
        { pos: 1, name: "Cabang", type: "text" },
        { pos: 3, name: "Omzet", type: "decimal" },
      ],
    },
  ];
  const fmt = { style: "number", decimals: 0 } as const;
  const kpi = (column: number) => ({
    sheetId: S1,
    measure: { agg: "sum", column },
    format: fmt,
  });
  const statusOf = (spec: unknown, saveError?: string) => {
    const html = renderToStaticMarkup(
      createElement(WidgetConfigForm, {
        widget: { id: "w", type: "kpi", title: "", spec, version: "v1" },
        sources,
        datasetId: "ds",
        saveError,
        onSave: () => Promise.resolve(true),
      }),
    );
    return html.match(/<p[^>]*data-testid="config-status"[^>]*>.*?<\/p>/)?.[0] ?? "";
  };

  it("gagal → menempel di bawah area gulir, warna kesalahan + ikon, berisi alasannya", () => {
    const p = statusOf(kpi(3), "Server sedang bermasalah. Coba lagi beberapa saat lagi.");
    expect(p).toMatch(/class="[^"]*\bsticky bottom-0\b[^"]*\bbg-card\b[^"]*\btext-destructive\b/);
    expect(p).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(p).toContain('data-state="error"');
    expect(p).toContain(
      "Belum tersimpan — Server sedang bermasalah. Coba lagi beberapa saat lagi.",
    );
  });

  it("tanpa kegagalan, atau draf yang belum bisa disimpan → baris biasa tanpa ikon", () => {
    const plain = statusOf(kpi(3));
    expect(plain).toContain('class="text-xs text-muted-foreground"');
    expect(plain).not.toContain("<svg");
    // Kolom pengganti belum dipilih: pesan itu didahulukan, bukan gaya kesalahan simpan.
    const missing = statusOf(kpi(MISSING_COLUMN), "gagal");
    expect(missing).toContain("Belum tersimpan — pilih kolom pengganti.");
    expect(missing).not.toContain("sticky");
    expect(missing).not.toContain("<svg");
  });
});

describe("ditolak permanen (tidak valid)", () => {
  it("alasan tetap tampil di panel, tetapi tidak dikirim ulang (tidak menahan Selesai)", () => {
    const s = createConfigSaves();
    const save = { type: "bar", spec: { sheetId: "s" } };
    s.start("w", save);
    s.finish("w", save, "Kolom tidak valid.", false);
    expect(s.errors()).toEqual({ w: "Kolom tidak valid." });
    expect(s.retries()).toEqual([]);
    expect(s.unsaved("w")).toBe(save);
  });
});
