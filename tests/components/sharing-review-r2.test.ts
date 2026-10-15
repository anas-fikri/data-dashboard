import { Dialog } from "radix-ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrossFilterField } from "@/components/dashboards/config-sections";
import {
  FilterColumnsSettings,
  focusIfTargeted,
} from "@/components/dashboards/filter-columns-settings";
import { FILTER_SETTINGS_ID } from "@/components/dashboards/filters/filter-bar";
import { CROSS_FILTER_LABEL } from "@/components/dashboards/filters/filter-model";
import { PHONE_HEIGHT, phoneCardStyle } from "@/components/dashboards/layout-ops";
import {
  historyReady,
  isHistoryMount,
  viewCanvasKey,
} from "@/components/dashboards/use-dashboard-editor";
import { closeFocusTarget } from "@/components/sharing/share-dialog";
import { FILTER_LINK_ATTR, ShareWarnings } from "@/components/sharing/share-warnings";
import { PageHeader } from "@/components/ui/page-header";
import { WIDGET_CHANGED, withChangeCheck } from "@/components/widgets/body-state";
import { fetchWidget, type WidgetQueryState } from "@/components/widgets/widget-query";

// FilterColumnsSettings memakai useRouter (refresh setelah simpan); di luar App Router diganti.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/*
 * Perbaikan review T-016 putaran 2 (klien): Back/Forward tidak memakai versi widget dari cache riwayat
 * (R2-CL-1), versi pengaturan di jawaban gagal (R2-CL-2), kartu KPI ponsel tumbuh untuk blok galat
 * (R2-UI-2), saran filter silang di peringatan share (R2-UI-3), kepala halaman dua aksi di 768
 * (R2-UI-5), fokus setelah tautan ke kolom filter (R2-UI-6).
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("R2-CL-1: kanvas setelah Back/Forward", () => {
  const URL_VIEW = "http://app.test/dashboards/d1?f=x";

  it("dipasang segera setelah popstate ke URL yang sama → dari riwayat", () => {
    const last = { at: 1_000, href: URL_VIEW };
    expect(isHistoryMount(last, 1_000, URL_VIEW)).toBe(true);
    expect(isHistoryMount(last, 2_500, URL_VIEW)).toBe(true);
  });

  it("tanpa popstate, URL lain (Back ke halaman lain lalu buka dashboard), atau sudah lama → bukan", () => {
    expect(isHistoryMount(null, 1_000, URL_VIEW)).toBe(false);
    const last = { at: 1_000, href: "http://app.test/dashboards" };
    expect(isHistoryMount(last, 1_100, URL_VIEW)).toBe(false);
    // Lebih dari 2 s: halaman yang tidak ada di cache diambil dari server (props sudah segar).
    expect(isHistoryMount({ at: 1_000, href: URL_VIEW }, 3_000, URL_VIEW)).toBe(false);
    // Jam mundur: tidak dianggap riwayat.
    expect(isHistoryMount({ at: 1_000, href: URL_VIEW }, 900, URL_VIEW)).toBe(false);
  });

  it("kanvas (query widget + tulis editor) baru dirender setelah refresh selesai", () => {
    expect(historyReady(false, false, false)).toBe(true); // pemasangan biasa
    expect(historyReady(true, false, false)).toBe(false); // menunggu refresh diminta
    expect(historyReady(true, true, true)).toBe(false); // refresh berjalan
    expect(historyReady(true, false, true)).toBe(false);
    expect(historyReady(true, true, false)).toBe(true); // props segar sudah tiba
  });

  it("popstate → pemasangan berikutnya di URL itu tidak siap; URL lain / tanpa popstate siap", async () => {
    const listeners: Record<string, () => void> = {};
    const location = { href: URL_VIEW };
    vi.stubGlobal("window", {
      location,
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
    });
    // Modul segar: pendengar popstate tingkat modul terpasang pada window tiruan.
    const React = await import("react");
    const { renderToStaticMarkup: render } = await import("react-dom/server");
    const mod = await import("@/components/dashboards/use-dashboard-editor");
    const probe = () =>
      render(
        React.createElement(function Probe() {
          return React.createElement("i", { "data-ready": String(mod.useFreshAfterHistory()) });
        }),
      );
    expect(probe()).toContain('data-ready="true"');
    expect(typeof listeners.popstate).toBe("function");
    listeners.popstate!();
    expect(probe()).toContain('data-ready="false"');
    location.href = "http://app.test/dashboards/d2";
    expect(probe()).toContain('data-ready="true"');
  });

  it("key mode lihat berubah bila versi widget, daftar widget, atau revisi tata letak berubah", () => {
    const w = [
      { id: "a", version: "2026-10-15T04:24:25.053Z" },
      { id: "b", version: "2026-10-15T04:20:00.000Z" },
    ];
    const k = viewCanvasKey(w, 3);
    expect(viewCanvasKey([...w], 3)).toBe(k); // props sama dari refresh → tidak dipasang ulang
    expect(viewCanvasKey([{ ...w[0]!, version: "2026-10-15T04:40:04.421Z" }, w[1]!], 3)).not.toBe(
      k,
    );
    expect(viewCanvasKey([w[0]!], 3)).not.toBe(k);
    expect(viewCanvasKey(w, 4)).not.toBe(k);
  });
});

describe("R2-CL-2: jawaban gagal membawa versi pengaturan widget", () => {
  const data = (widgetVersion: string) => ({
    columns: [{ key: "c0", label: "Omzet", type: "integer" as const }],
    rows: [[1]],
    widgetVersion,
  });
  const failed = (version?: string): WidgetQueryState => ({
    status: "error",
    code: "INVALID",
    message: "Urutan hanya untuk kolom di tabel ini.",
    data: data("v1"), // tabel lama tetap dipegang (keepOnError)
    filters: "[]",
    ...(version ? { version } : {}),
  });

  it("INVALID dari pengaturan baru (urutan kolom lama) → CHANGED + Muat ulang, tanpa data lama", () => {
    const s = withChangeCheck(failed("v2"), ["v1"]);
    expect(s).toEqual({ status: "error", code: "CHANGED", message: WIDGET_CHANGED, filters: "[]" });
  });

  it("versi gagal dikenal kartu → galat asli; tanpa versi → data lama yang menentukan", () => {
    expect(withChangeCheck(failed("v1"), ["v1"])).toEqual(failed("v1"));
    expect(withChangeCheck(failed(), ["v1"])).toEqual(failed());
    // Versi jawaban gagal didahulukan dari versi data lama.
    expect(withChangeCheck({ ...failed("v1"), data: data("v0") }, ["v1"]).status).toBe("error");
    expect(withChangeCheck({ ...failed("v1"), data: data("v0") }, ["v1"])).toMatchObject({
      code: "INVALID",
    });
  });

  const stubFetch = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );

  it("fetchWidget: widgetVersion jawaban gagal disimpan sebagai version", async () => {
    stubFetch(400, {
      ok: false,
      code: "INVALID",
      message: "Urutan hanya untuk kolom di tabel ini.",
      widgetVersion: "v2",
    });
    const r = await fetchWidget(
      { widgetId: "w1", sort: { column: 3, dir: "asc" } },
      new AbortController().signal,
    );
    expect(r).toEqual({
      ok: false,
      code: "INVALID",
      status: 400,
      version: "v2",
      message: "Urutan hanya untuk kolom di tabel ini.",
    });
  });

  it("fetchWidget: tanpa widgetVersion (mis. 404) atau bukan string → tanpa version", async () => {
    stubFetch(404, { ok: false, code: "NOT_FOUND", message: "Tidak ditemukan." });
    const r1 = await fetchWidget({ widgetId: "w1" }, new AbortController().signal);
    expect(r1).not.toHaveProperty("version");
    stubFetch(400, { ok: false, code: "INVALID", message: "x", widgetVersion: 5 });
    const r2 = await fetchWidget({ widgetId: "w1" }, new AbortController().signal);
    expect(r2).not.toHaveProperty("version");
  });
});

describe("R2-UI-2: kartu KPI di tumpukan ponsel", () => {
  it("KPI: tinggi minimum (tumbuh untuk blok galat + tombol), bukan tinggi tetap", () => {
    expect(phoneCardStyle("kpi")).toEqual({ minHeight: PHONE_HEIGHT.kpi });
    expect(phoneCardStyle("kpi")).not.toHaveProperty("height");
    expect(PHONE_HEIGHT.kpi).toBe(150);
  });

  it("tabel/grafik tetap setinggi tetap (isi menggulir di dalam kartu); jenis lain 160", () => {
    expect(phoneCardStyle("table")).toEqual({ height: 440 });
    expect(phoneCardStyle("line")).toEqual({ height: 280 });
    expect(phoneCardStyle("empty")).toEqual({ height: 160 });
  });
});

const warnings = (filterColumns: string[]) =>
  html(
    createElement(
      Dialog.Root,
      null,
      createElement(ShareWarnings, { dashboardId: "d1", editor: false, filterColumns }),
    ),
  );

describe("R2-UI-3: saran peringatan kolom lintas sheet", () => {
  it("menyebut sakelar filter silang dengan label aslinya di pengaturan grafik", () => {
    const out = warnings(["Kota Tujuan", "No Resi"]);
    expect(CROSS_FILTER_LABEL).toBe("Klik grafik menyaring widget lain");
    expect(out).toContain(`matikan “${CROSS_FILTER_LABEL}” di pengaturan grafik`);
    expect(out).toContain("ganti nama kolomnya di skema");
    expect(out).toContain("hapus kolom filternya di");
    // Label sakelar di panel pengaturan grafik = teks yang dirujuk peringatan.
    const field = html(createElement(CrossFilterField, { value: true, onChange: () => {} }));
    expect(field).toContain(CROSS_FILTER_LABEL);
  });
});

describe("R2-UI-5: kepala halaman dengan dua aksi", () => {
  it("≥ 768: baris boleh membungkus, judul tumbuh dengan basis 16rem (aksi turun bila tidak muat)", () => {
    const out = html(
      createElement(PageHeader, {
        title: "Ringkasan pengiriman cabang Jakarta Selatan dan sekitarnya",
        actions: createElement("button", null, "Bagikan"),
      }),
    );
    expect(out).toMatch(/<header class="[^"]*md:flex-row md:flex-wrap[^"]*"/);
    expect(out).toMatch(/<div class="min-w-0 md:grow md:basis-64">/);
    // Bawah 768: tetap kolom.
    expect(out).toMatch(/<header class="flex flex-col /);
  });
});

describe("R2-UI-6: tautan ke kolom filter memindah fokus ke bagiannya", () => {
  it("tautan peringatan ditandai untuk dialog", () => {
    const link = warnings(["Cabang"]).match(/<a [^>]*>/)?.[0] ?? "";
    expect(link).toContain(`href="/dashboards/d1?mode=edit#${FILTER_SETTINGS_ID}"`);
    expect(link).toContain(`${FILTER_LINK_ATTR}=""`);
  });

  it("dialog ditutup lewat tautan: fokus ke bagian kolom filter bila sudah ada; selain itu bawaan", () => {
    const section = { id: FILTER_SETTINGS_ID } as unknown as HTMLElement;
    const doc = { getElementById: (id: string) => (id === FILTER_SETTINGS_ID ? section : null) };
    expect(closeFocusTarget(true, doc)).toBe(section);
    expect(closeFocusTarget(false, doc)).toBeNull(); // Esc, X, Selesai → tombol Bagikan
    expect(closeFocusTarget(true, { getElementById: () => null })).toBeNull(); // dari mode lihat
  });

  it("bagian kolom filter: bisa difokus skrip (bukan tab stop) dengan cincin fokus keyboard", () => {
    const out = html(
      createElement(FilterColumnsSettings, { dashboardId: "d1", columns: [], sources: [] }),
    );
    expect(out).toMatch(
      new RegExp(
        `<section[^>]*id="${FILTER_SETTINGS_ID}"[^>]*tabindex="-1"[^>]*class="[^"]*focus-visible:ring-2`,
      ),
    );
  });

  it("dipasang dengan #kolom-filter → difokus tanpa menggulir lagi; hash lain → tidak", () => {
    const focus = vi.fn();
    const el = { focus } as unknown as HTMLElement;
    expect(focusIfTargeted(el, `#${FILTER_SETTINGS_ID}`)).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusIfTargeted(el, "")).toBe(false);
    expect(focusIfTargeted(el, "#lain")).toBe(false);
    expect(focusIfTargeted(null, `#${FILTER_SETTINGS_ID}`)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
