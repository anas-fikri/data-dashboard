import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/*
 * Lead review T-016 R4: dashboard yang dibuka lewat navigasi klien (klik baris di /dashboards atau
 * Beranda) memuat modul kanvas SETELAH router Next memasang pendengar popstate-nya. Saat Back, React
 * merender pemulihan riwayat secara sinkron di dalam event popstate (microtask setelah pendengar router),
 * SEBELUM pendengar modul yang terdaftar belakangan berjalan → gerbang refresh R2-CL-1 tidak pernah aktif
 * dan props dari cache riwayat dipakai (CHANGED / STALE). Di Chromium, pendengar di window dipanggil
 * urut daftar walau capture. Kanvas mengenali render itu dari window.event (popstate).
 */
type Listener = (e: Event) => void;
const URL_VIEW = "http://app.test/dashboards/d1";

/** window tiruan: pendengar urut daftar; window.event = event yang sedang dikirim (seperti browser). */
function fakeWindow(href: string) {
  const popstate: Listener[] = [];
  const win = {
    location: { href },
    event: undefined as Event | undefined,
    addEventListener(type: string, fn: Listener) {
      if (type === "popstate") popstate.push(fn);
    },
    popstate() {
      const ev = new Event("popstate");
      win.event = ev;
      for (const fn of popstate) fn(ev);
      win.event = undefined;
    },
  };
  return win;
}

/**
 * Router Next (app-router.js) memasang pendengarnya saat hidrasi, SEBELUM modul kanvas dimuat.
 * renderInEvent: React merender pemulihan riwayat di dalam event itu (data ada di cache riwayat).
 */
async function setup(renderInEvent: boolean) {
  const win = fakeWindow(URL_VIEW);
  vi.stubGlobal("window", win);
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  let inEvent = "";
  let probe = () => "";
  win.addEventListener("popstate", () => {
    if (renderInEvent) inEvent = probe();
  });
  const mod = await import("@/components/dashboards/use-dashboard-editor");
  probe = () =>
    renderToStaticMarkup(
      React.createElement(function Probe() {
        return React.createElement("i", { "data-ready": String(mod.useFreshAfterHistory()) });
      }),
    );
  return { win, probe, inEvent: () => inEvent };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("lead R4: Back ke dashboard yang dibuka lewat navigasi klien", () => {
  it("kanvas dirender di dalam popstate sebelum pendengar modul → tetap menunggu refresh", async () => {
    const s = await setup(true);
    expect(s.probe()).toContain('data-ready="true"'); // pemasangan biasa (klik baris)
    s.win.popstate();
    expect(s.inEvent()).toContain('data-ready="false"');
  });

  it("popstate yang sudah dipakai render itu tidak menandai pemasangan berikutnya sebagai riwayat", async () => {
    const s = await setup(true);
    s.win.popstate();
    expect(s.inEvent()).toContain('data-ready="false"');
    // Pemasangan biasa sesudahnya (di luar event, URL sama, < 2 s) tidak meminta refresh lagi.
    expect(s.probe()).toContain('data-ready="true"');
  });

  it("render tertunda (di luar event) sesudah popstate tetap dari riwayat; URL lain tidak", async () => {
    const s = await setup(false);
    s.win.popstate();
    expect(s.probe()).toContain('data-ready="false"');
    s.win.location.href = "http://app.test/dashboards/d2";
    expect(s.probe()).toContain('data-ready="true"');
  });
});
