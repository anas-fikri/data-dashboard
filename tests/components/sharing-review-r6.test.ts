import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/components/dashboards/dashboard-api";
import type { WidgetView } from "@/features/dashboards/service";
import type { ShareGrantView } from "@/features/sharing/types";

/*
 * Perbaikan review T-016 putaran 6 (klien): simpanan tertunda (panel pengaturan, tata letak) terkirim
 * dan selesai sebelum props mode lihat dibaca — "Selesai" dan Back (CL-1); galat ganti peran tanpa
 * baris tampil di atas daftar dan menyebut emailnya, fokus ke judul daftar (UI-1); dialog share tidak
 * bisa ditutup selama aksi berjalan (UI-2); konfirmasi terlihat setelah "Bagikan" berhasil (UI-3).
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
// CSS react-grid-layout tidak diproses di unit test (PostCSS proyek untuk Tailwind).
vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));
vi.mock("@/features/sharing/actions", () => ({
  listSharesAction: vi.fn(),
  searchShareUsersAction: vi.fn(),
  grantShareAction: vi.fn(),
  revokeShareAction: vi.fn(),
  setOrgShareAction: vi.fn(),
  setShareRoleAction: vi.fn(),
}));
// flushSync asli, dicatat: penutupan panel harus selesai (effect pelepasan ikut) sebelum flush().
vi.mock("react-dom", async (orig) => {
  const real = await orig<typeof import("react-dom")>();
  return { ...real, flushSync: vi.fn(real.flushSync) };
});

const { flushSync } = await import("react-dom");
const { api } = await import("@/components/dashboards/dashboard-api");
const canvas = await import("@/components/dashboards/dashboard-canvas");
const { useDashboardEditor, trackWrite, writesSettled } =
  await import("@/components/dashboards/use-dashboard-editor");
const { ShareGrants, roleRestoreTarget } = await import("@/components/sharing/share-grants");
const { ROLE_GONE, announce } = await import("@/components/sharing/share-model");
const { keepOpenWhileBusy } = await import("@/components/sharing/share-dialog");
const { GrantDone, ShareAdd } = await import("@/components/sharing/share-add");

const html = (el: ReactElement) => renderToStaticMarkup(el);
const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
type Configured = ApiResult<{ type: string; spec: unknown; version: string }>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(flushSync).mockClear();
  vi.useRealTimers();
});

describe("R6-CL-1: perubahan terakhir tersimpan sebelum mode lihat membaca props server", () => {
  const editor = () => {
    const box: { ed?: ReturnType<typeof useDashboardEditor> } = {};
    html(
      createElement(function Probe() {
        box.ed = useDashboardEditor({
          dashboardId: "d1",
          widgets: [
            { id: "a", version: "v1", title: "Omzet", type: "kpi", spec: {} } as WidgetView,
          ],
          layout: [{ i: "a", x: 0, y: 0, w: 4, h: 4 }],
          revision: 1,
          editing: true,
        });
        return null;
      }),
    );
    return box.ed!;
  };
  const saved: Configured = { ok: true, data: { type: "kpi", spec: { v: 2 }, version: "v2" } };

  it("Selesai: panel ditutup sinkron dulu → simpanan tertundanya masuk antrean, flush menunggunya", async () => {
    const ed = editor();
    const patch = deferred<Configured>();
    const configure = vi.spyOn(api, "configureWidget").mockReturnValueOnce(patch.promise);
    const order: string[] = [];
    // Pelepasan WidgetConfigForm mengirim simpanan yang masih menunggu jeda (cleanup → onSave).
    const closePanel = () => {
      order.push("close");
      void ed.configureWidget("a", "kpi", { v: 2 });
    };
    let left: boolean | null = null;
    const leaving = canvas
      .saveBeforeLeave(closePanel, () => {
        order.push("flush");
        return ed.flush();
      })
      .then((ok) => (left = ok));
    expect(flushSync).toHaveBeenCalledWith(closePanel);
    expect(order).toEqual(["close", "flush"]);
    await tick();
    expect(configure).toHaveBeenCalledTimes(1);
    expect(left).toBeNull(); // router.push ke mode lihat belum boleh berjalan
    patch.resolve(saved);
    await leaving;
    expect(left).toBe(true);
  });

  it("Selesai tanpa panel terbuka → langsung flush, tanpa flushSync", async () => {
    const flush = vi.fn(async () => true);
    expect(await canvas.saveBeforeLeave(null, flush)).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flushSync).not.toHaveBeenCalled();
  });

  it("Back: refresh menunggu simpanan editor yang dilepas (antrean editor tercatat)", async () => {
    const ed = editor();
    const patch = deferred<Configured>();
    vi.spyOn(api, "configureWidget").mockReturnValueOnce(patch.promise);
    void ed.configureWidget("a", "kpi", { v: 2 }); // flush panel saat kanvas edit dilepas
    let refreshed = false;
    const gate = writesSettled().then(() => (refreshed = true));
    await tick();
    expect(refreshed).toBe(false);
    patch.resolve(saved);
    await gate;
    expect(refreshed).toBe(true);
  });

  it("Back: tata letak keepalive saat dilepas ikut ditunggu; tulisan gagal tidak menahan", async () => {
    const put = deferred<unknown>();
    trackWrite(put.promise);
    trackWrite(Promise.reject(new Error("offline")));
    let refreshed = false;
    const gate = writesSettled().then(() => (refreshed = true));
    await tick();
    expect(refreshed).toBe(false);
    put.resolve({ ok: true });
    await gate;
    expect(refreshed).toBe(true);
  });

  it("Back: tulisan yang menggantung → refresh tetap berjalan setelah 3 detik", async () => {
    vi.useFakeTimers();
    const hang = deferred<unknown>();
    trackWrite(hang.promise);
    let refreshed = false;
    void writesSettled().then(() => (refreshed = true));
    await vi.advanceTimersByTimeAsync(2999);
    expect(refreshed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(refreshed).toBe(true);
    hang.resolve(null); // tidak menahan uji berikutnya (status modul bersama)
  });
});

describe("R6-UI-1: ganti peran untuk orang yang sudah dicabut di tempat lain", () => {
  const grants: ShareGrantView[] = [
    { userId: "u1", name: "Ani", email: "ani@pcp.co.id", role: "VIEWER", active: true },
  ];
  const SERVER = "Pengguna ini belum punya akses ke dashboard ini.";
  const render = (p: {
    list?: ShareGrantView[];
    errorUserId: string | null;
    errorEmail?: string | null;
  }) =>
    html(
      createElement(ShareGrants, {
        grants: p.list ?? grants,
        orgShared: false,
        busy: null,
        error: SERVER,
        errorUserId: p.errorUserId,
        errorEmail: p.errorEmail,
        revokeError: null,
        onRole: () => {},
        onRevoke: async () => true,
        onRevokeCancel: () => {},
      }),
    );

  it("barisnya hilang → galat tepat di bawah judul (di atas daftar), menyebut emailnya", () => {
    const out = render({ errorUserId: "u9", errorEmail: "gita@pcp.co.id" });
    const heading = out.indexOf('data-testid="share-grants-heading"');
    const alert = out.indexOf('role="alert"');
    expect(heading).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(out.indexOf("</h3>"));
    expect(alert).toBeLessThan(out.indexOf("<ul"));
    expect(out).toContain('<bdi dir="ltr">gita<wbr/>@pcp.co.id</bdi> ' + ROLE_GONE);
    expect(out).not.toContain(SERVER);
    expect(out.slice(out.indexOf("</ul>"))).not.toContain('role="alert"');
  });

  it("orang terakhir yang dicabut → galat tetap di bawah judul, sebelum teks daftar kosong", () => {
    const out = render({ list: [], errorUserId: "u1", errorEmail: "ani@pcp.co.id" });
    expect(out.indexOf('role="alert"')).toBeLessThan(out.indexOf("Belum ada orang"));
    expect(out).toContain(ROLE_GONE);
  });

  it("barisnya masih ada → galat server di baris itu, bukan pesan 'sudah tidak punya akses'", () => {
    const out = render({ errorUserId: "u1", errorEmail: "ani@pcp.co.id" });
    expect(out).toContain('data-testid="share-grant-error"');
    expect(out).toContain(SERVER);
    expect(out).not.toContain(ROLE_GONE);
  });

  it("email tidak diketahui → pesan server apa adanya", () => {
    expect(render({ errorUserId: "u9" })).toContain(SERVER);
  });

  it("fokus setelah aksi: Select baris itu, atau judul daftar bila barisnya hilang (bukan kolom cari)", () => {
    const row = { id: "row" };
    const heading = { id: "heading" };
    const box = (hasRow: boolean) =>
      ({
        querySelector: vi.fn((s: string) =>
          s.includes("share-grant-role")
            ? hasRow
              ? row
              : null
            : s === "[data-testid=share-grants-heading]"
              ? heading
              : null,
        ),
      }) as unknown as ParentNode;
    expect(roleRestoreTarget(box(true), "u1")).toBe(row);
    expect(roleRestoreTarget(box(false), "u1")).toBe(heading);
    expect(roleRestoreTarget(null, "u1")).toBeNull();
  });
});

describe("R6-UI-2: dialog share tidak bisa ditutup selama aksi berjalan", () => {
  it("tutup (Esc, klik di luar, X, Selesai) diabaikan selama sibuk; buka dan tutup biasa tetap", () => {
    expect(keepOpenWhileBusy(false, true)).toBe(true);
    expect(keepOpenWhileBusy(false, false)).toBe(false);
    expect(keepOpenWhileBusy(true, false)).toBe(true);
  });
});

describe("R6-UI-3: konfirmasi terlihat setelah 'Bagikan' berhasil", () => {
  it("baris terlihat dengan ikon dan email, tanpa role=status (sudah diumumkan aria-live panel)", () => {
    const out = html(createElement(GrantDone, { email: "c@pcp.co.id", role: "VIEWER" }));
    expect(out).toContain('data-testid="share-add-done"');
    expect(out).toContain(
      '<bdi dir="ltr">c<wbr/>@pcp.co.id</bdi> kini bisa melihat dashboard ini.',
    );
    expect(out).not.toContain("role=");
    expect(out).not.toContain("aria-live");
    expect(out).toMatch(
      /<svg[^>]*tabler-icon-circle-check[^"]*text-success"[^>]*aria-hidden="true"/,
    );
    expect(html(createElement(GrantDone, { email: "e@pcp.co.id", role: "EDITOR" }))).toContain(
      "kini bisa mengedit widget dashboard ini.",
    );
  });

  it("teks pengumuman tidak berubah", () => {
    expect(announce.grant("c@pcp.co.id", "VIEWER")).toBe(
      "c@pcp.co.id kini bisa melihat dashboard ini.",
    );
    expect(announce.grant("e@pcp.co.id", "EDITOR")).toBe(
      "e@pcp.co.id kini bisa mengedit widget dashboard ini.",
    );
  });

  it("belum ada yang dibagikan → tanpa baris konfirmasi", () => {
    const out = html(
      createElement(ShareAdd, {
        dashboardId: "d1",
        role: "VIEWER",
        onRole: () => {},
        granted: new Map(),
        busy: null,
        error: null,
        inputRef: { current: null },
        onAdd: async () => true,
        warnings: null,
      }),
    );
    expect(out).not.toContain("share-add-done");
  });
});
