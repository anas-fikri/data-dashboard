import { createElement, useState, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetView } from "@/features/dashboards/service";
import type { ShareGrantView, ShareState } from "@/features/sharing/types";

/*
 * Perbaikan review T-016 putaran 5 (klien): aksi share NOT_FOUND memuat ulang daftar (DI-1), widget
 * sesi ini punya refresh sendiri (CL-1), mode lihat mengisi ulang props tanpa memasang ulang kanvas
 * (CL-2), Enter di daftar peran tidak mengeklik "Batal" konfirmasi (UI-1), pesan "pilih pengguna" tepat
 * di bawah kolom cari (UI-2), fokus setelah "Jadikan editor" tidak jatuh ke <body> (UI-3), nama di
 * dialog share membungkus (UI-4).
 */
const m = vi.hoisted(() => ({
  ready: true,
  refresh: vi.fn(),
  listShares: vi.fn(),
  content: [] as Record<string, unknown>[],
  picker: [] as { errorId?: string; errorText?: string }[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
// CSS react-grid-layout tidak diproses di unit test (PostCSS proyek untuk Tailwind).
vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));
vi.mock("@/features/sharing/actions", () => ({
  listSharesAction: m.listShares,
  searchShareUsersAction: vi.fn(),
  grantShareAction: vi.fn(),
  revokeShareAction: vi.fn(),
  setOrgShareAction: vi.fn(),
  setShareRoleAction: vi.fn(),
}));
// Kerangka Back/Forward dikendalikan uji; sisanya (useDashboardEditor, viewCanvasKey) modul asli.
vi.mock("@/components/dashboards/use-dashboard-editor", async (orig) => ({
  ...(await orig<typeof import("@/components/dashboards/use-dashboard-editor")>()),
  useFreshAfterHistory: () => m.ready,
}));
// Select kustom tipis: props daftar pilihan dicatat (Radix tidak merender daftar tertutup di SSR).
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactElement }) => children,
  SelectTrigger: ({ children, ...p }: Record<string, unknown> & { children: ReactElement }) =>
    createElement("button", p, children),
  SelectValue: () => null,
  SelectContent: (p: Record<string, unknown> & { children: ReactElement }) => {
    m.content.push(p);
    return createElement("div", null, p.children);
  },
  SelectItem: ({ children }: { children: ReactElement }) => createElement("div", null, children),
}));
// Pemilih asli, props-nya dicatat (pesan "pilih pengguna" dari ShareAdd).
vi.mock("@/components/sharing/share-picker", async (orig) => {
  const real = await orig<typeof import("@/components/sharing/share-picker")>();
  return {
    SharePicker: (p: Parameters<typeof real.SharePicker>[0]) => {
      m.picker.push(p);
      return createElement(real.SharePicker, p);
    },
  };
});

const { useShareState } = await import("@/components/sharing/use-share-state");
const { AccessRefreshProvider, createAccessGuard, useAccessLost } =
  await import("@/components/widgets/access-refresh");
const canvas = await import("@/components/dashboards/dashboard-canvas");
const { useDashboardEditor } = await import("@/components/dashboards/use-dashboard-editor");
const { RoleSelect, keepEnterInList } = await import("@/components/sharing/role-select");
const { SharePicker } = await import("@/components/sharing/share-picker");
const { ShareAdd } = await import("@/components/sharing/share-add");
const { ShareGrants, focusRowControl } = await import("@/components/sharing/share-grants");
const { ShareOptions } = await import("@/components/sharing/share-options");

const html = (el: ReactElement) => renderToStaticMarkup(el);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  m.ready = true;
  m.content.length = 0;
  m.picker.length = 0;
});

describe("R5-DI-1: aksi share ditolak NOT_FOUND memuat ulang daftar akses", () => {
  const state: ShareState = {
    orgShared: false,
    grants: [],
    warnings: { editor: false, filterColumns: [] },
  };
  const hook = () => {
    const box: { s?: ReturnType<typeof useShareState> } = {};
    html(
      createElement(function Probe() {
        box.s = useShareState("d1");
        return null;
      }),
    );
    return box.s!;
  };
  const fail = (code: string) => async () => ({ ok: false as const, code, message: "x" });

  it("orang sudah dicabut di tab lain → daftar dimuat ulang sebelum aksi selesai (masih sibuk)", async () => {
    let answer!: (v: unknown) => void;
    m.listShares.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const s = hook();
    expect(m.listShares).not.toHaveBeenCalled(); // SSR: muatan awal (effect) tidak berjalan
    let settled = false;
    const done = s
      .run("role:u2", "grants", fail("NOT_FOUND"), () => "")
      .then((ok) => {
        settled = true;
        return ok;
      });
    await flush();
    expect(m.listShares).toHaveBeenCalledTimes(1);
    expect(m.listShares).toHaveBeenCalledWith("d1");
    expect(settled).toBe(false); // sibuk sampai daftar baru tiba (fokus dipulihkan sesudahnya)
    answer({ ok: true, data: state });
    expect(await done).toBe(false);
  });

  it("galat lain (INVALID, BUSY) atau jaringan → daftar tidak dimuat ulang", async () => {
    const s = hook();
    expect(await s.run("role:u2", "grants", fail("INVALID"), () => "")).toBe(false);
    expect(await s.run("add", "add", fail("BUSY"), () => "")).toBe(false);
    const offline = async () => Promise.reject(new Error("offline"));
    expect(await s.run("org", "org", offline, () => "")).toBe(false);
    expect(m.listShares).not.toHaveBeenCalled();
  });
});

describe("R5-CL-1: widget yang ditambahkan sesi ini tidak memakai jatah refresh bersama", () => {
  it("404 widget sesi ini → refresh sendiri; props sama sesudahnya → pencabutan tetap terdeteksi", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a", "b"], "7|a:v1,b:v1");
    // 'Lokal E' (hanya di state editor) dihapus pemilik → query 404 → satu refresh.
    expect(g.lost("lokal")).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Refresh membawa props server yang sama (widget itu memang tidak pernah ada di sana).
    g.sync(["a", "b"], "7|a:v1,b:v1");
    // Filter berikutnya: 404 widget itu lagi → tidak berulang.
    expect(g.lost("lokal")).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Akses dicabut: widget server dan slicer 404 → tetap satu refresh (halaman jadi 404).
    expect(g.lost("a")).toBe(true);
    expect(g.lost("b")).toBe(false);
    expect(g.lost()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("paling banyak satu refresh per widget sesi ini (terbatas, tanpa loop)", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a"]);
    expect(g.lost("baru1")).toBe(true);
    expect(g.lost("baru2")).toBe(true);
    expect(g.lost("baru1")).toBe(false);
    expect(g.lost("baru2")).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(g.lost()).toBe(true); // jatah bersama masih utuh
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("widget sesi ini yang sudah tersimpan di props server lalu dihapus di tempat lain → diabaikan", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a"]);
    g.sync(["a", "baru"], "2");
    g.sync(["a"], "3");
    expect(g.lost("baru")).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("R5-CL-2: mode lihat mengisi ulang props server tanpa memasang ulang kanvas", () => {
  const widget = (id: string, version: string) =>
    ({ id, version, title: id, type: "empty", spec: null }) as WidgetView;
  const props = (editing: boolean, widgets: WidgetView[], revision: number) => ({
    dashboardId: "d1",
    role: "VIEWER" as const,
    widgets,
    layout: widgets.map((w, i) => ({ i: w.id, x: i * 4, y: 0, w: 4, h: 3 })),
    revision,
    editing,
    datasetId: "s1",
    sources: [],
    filterColumns: [],
    crossFilterColumns: [],
  });
  const keyOf = (p: ReturnType<typeof props>) =>
    (canvas.DashboardCanvas(p) as ReactElement | null)?.key;

  it("key kanvas hanya per mode: versi/daftar widget/revisi baru tidak memasang ulang bilah filter", () => {
    const before = props(false, [widget("a", "v1"), widget("b", "v1")], 3);
    const after = props(false, [widget("a", "v2")], 4);
    expect(keyOf(before)).toBe("view");
    expect(keyOf(after)).toBe("view");
    expect(keyOf(props(true, before.widgets, 3))).toBe("edit");
  });

  /** Kanvas menerima props awal lalu props segar (refresh) dalam satu pemasangan. */
  const reseed = (
    editing: boolean,
    next: (first: WidgetView[]) => WidgetView[],
    revision: number,
  ) => {
    const first = props(editing, [widget("a", "v1"), widget("b", "v1")], 3);
    const fresh = props(editing, next(first.widgets), revision);
    const out: { widgets?: string[]; layout?: string[]; kept?: boolean } = {};
    html(
      createElement(function Probe() {
        const [p, setP] = useState(first);
        const ed = useDashboardEditor(p);
        if (p === first) setP(fresh);
        out.widgets = ed.widgets.map((w) => `${w.id}:${w.version}`);
        out.layout = ed.layout.map((it) => it.i);
        out.kept = ed.widgets[0] === first.widgets[0];
        return null;
      }),
    );
    return out;
  };

  it("mode lihat: widget dihapus/diubah di tempat lain → state editor dari props baru", () => {
    expect(reseed(false, () => [widget("a", "v2")], 4)).toMatchObject({
      widgets: ["a:v2"],
      layout: ["a"],
    });
  });

  it("mode lihat: props sama dari refresh (objek baru) → state tidak diganti", () => {
    expect(reseed(false, (w) => w.map((x) => ({ ...x })), 3)).toMatchObject({
      widgets: ["a:v1", "b:v1"],
      kept: true,
    });
  });

  it("mode edit: props baru tidak pernah mengganti state lokal (tata letak tertunda, panel)", () => {
    expect(reseed(true, () => [widget("a", "v2")], 4)).toMatchObject({
      widgets: ["a:v1", "b:v1"],
      layout: ["a", "b"],
    });
  });

  it("penjaga refresh akses dipasang lagi bila props server berubah walau daftar id sama", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a"], "3|a:v1");
    expect(g.lost("a")).toBe(true);
    g.sync(["a"], "3|a:v1"); // props sama → tanpa loop
    expect(g.lost()).toBe(false);
    g.sync(["a"], "3|a:v2"); // keadaan halaman baru (dulu: kanvas dipasang ulang)
    expect(g.lost()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("provider menerima kunci keadaan halaman; nilai konteks tetap sekali per keadaan", () => {
    let lost: ReturnType<typeof useAccessLost> = null;
    function Probe() {
      lost = useAccessLost();
      return null;
    }
    function Canvas() {
      return AccessRefreshProvider({
        serverWidgetIds: ["a"],
        stateKey: "3|a:v1",
        children: createElement(Probe),
      });
    }
    html(createElement(Canvas));
    expect(lost!("a")).toBe(true);
    expect(lost!()).toBe(false);
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("R5-UI-1: Enter di daftar peran tidak mengeklik tombol konfirmasi yang baru difokus", () => {
  const key = (k: string) => ({ key: k, preventDefault: vi.fn() });

  it("Enter → aksi bawaan dicegah; Spasi/panah/Escape/huruf tidak disentuh", () => {
    const enter = key("Enter");
    keepEnterInList(enter);
    expect(enter.preventDefault).toHaveBeenCalledTimes(1);
    for (const k of [" ", "ArrowDown", "ArrowUp", "Escape", "Tab", "b"]) {
      const e = key(k);
      keepEnterInList(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
  });

  it("dipasang di daftar pilihan (bubbling setelah item Radix memilih), bukan di item", () => {
    html(
      createElement(RoleSelect, {
        value: "VIEWER",
        onChange: () => {},
        "aria-label": "Peran budi@pcp.co.id",
        "data-testid": "share-grant-role",
      }),
    );
    expect(m.content).toHaveLength(1);
    expect(m.content[0]!.onKeyDown).toBe(keepEnterInList);
  });
});

describe("R5-UI-2: pesan 'pilih pengguna' tepat di bawah kolom cari", () => {
  const picker = (errorId?: string, errorText?: string) =>
    html(
      createElement(SharePicker, {
        dashboardId: "d1",
        selectedId: null,
        disabled: false,
        granted: new Map(),
        onSelect: () => {},
        onResults: () => {},
        inputRef: { current: null },
        errorId,
        errorText,
      }),
    );

  it("setelah kolom cari, sebelum petunjuk dan hasil; terhubung lewat aria-describedby", () => {
    const out = picker("miss", "Pilih pengguna dari hasil pencarian dulu.");
    const input = out.indexOf('data-testid="share-search"');
    const msg = out.indexOf('<p id="miss" role="alert"');
    const hint = out.indexOf("Hanya pengguna aktif dengan email terverifikasi.");
    expect(input).toBeGreaterThan(-1);
    expect(msg).toBeGreaterThan(input);
    expect(hint).toBeGreaterThan(msg);
    expect(out.indexOf('role="status"')).toBeGreaterThan(msg);
    expect(out).toContain("Pilih pengguna dari hasil pencarian dulu.");
    expect(out).toMatch(/aria-describedby="miss [^"]+-hint"/);
    expect(out).toContain('aria-invalid="true"');
  });

  it("tanpa galat → tanpa pesan", () => {
    expect(picker(undefined, "Pilih pengguna dari hasil pencarian dulu.")).not.toContain(
      'role="alert"',
    );
  });

  it("ShareAdd menyerahkan pesannya ke pemilih (tidak lagi di bawah daftar hasil)", () => {
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
    expect(m.picker[0]!.errorText).toBe("Pilih pengguna dari hasil pencarian dulu.");
    expect(m.picker[0]!.errorId).toBeUndefined(); // belum menekan "Bagikan"
    expect(out).not.toContain("Pilih pengguna dari hasil pencarian dulu.");
  });
});

describe("R5-UI-3: fokus setelah konfirmasi 'Jadikan editor' tidak jatuh ke <body>", () => {
  const SEL = '[data-user-id="u2"] [data-testid=share-grant-role]';
  const setup = (control: { disabled: boolean } | null) => {
    const el = control ? { ...control, focus: vi.fn() } : null;
    const box = { focus: vi.fn() };
    const list = {
      querySelector: vi.fn(() => el),
      closest: vi.fn(() => box),
    } as unknown as HTMLElement;
    return { el, box, list };
  };

  it("simpanan masih berjalan (Select disabled) → kotak dialog share", () => {
    const { el, box, list } = setup({ disabled: true });
    focusRowControl(list, SEL);
    expect(list.querySelector).toHaveBeenCalledWith(SEL);
    expect(list.closest).toHaveBeenCalledWith('[role="dialog"]');
    expect(box.focus).toHaveBeenCalledTimes(1);
    expect(el!.focus).not.toHaveBeenCalled();
  });

  it("sudah selesai (Select aktif) → Select baris itu", () => {
    const { el, box, list } = setup({ disabled: false });
    focusRowControl(list, SEL);
    expect(el!.focus).toHaveBeenCalledTimes(1);
    expect(box.focus).not.toHaveBeenCalled();
  });

  it("barisnya sudah hilang → kotak dialog; tanpa daftar → tidak melempar", () => {
    const { box, list } = setup(null);
    focusRowControl(list, SEL);
    expect(box.focus).toHaveBeenCalledTimes(1);
    expect(() => focusRowControl(null, SEL)).not.toThrow();
  });
});

describe("R5-UI-4: nama panjang di dialog share membungkus, tanpa tooltip title saja", () => {
  const NAME = "Gregorius Bartholomeus Situmorang Hutapea Analis Keuangan";

  it("baris 'Orang dengan akses'", () => {
    const grants: ShareGrantView[] = [
      { userId: "u1", name: NAME, email: "greg@pcp.co.id", role: "VIEWER", active: true },
    ];
    const out = html(
      createElement(ShareGrants, {
        grants,
        orgShared: false,
        busy: null,
        error: null,
        revokeError: null,
        onRole: () => {},
        onRevoke: async () => true,
        onRevokeCancel: () => {},
      }),
    );
    expect(out).toContain(
      `<p class="text-muted-foreground [overflow-wrap:anywhere]"><bdi>${NAME}</bdi></p>`,
    );
    expect(out).not.toContain(`title="${NAME}"`);
  });

  it("hasil pencarian pengguna", () => {
    const out = html(
      createElement(ShareOptions, {
        name: "u",
        labelledBy: "lbl",
        items: [{ id: "u1", name: NAME, email: "greg@pcp.co.id" }],
        selectedId: null,
        granted: new Map(),
        disabled: false,
        loading: false,
        onSelect: () => {},
      }),
    );
    expect(out).toContain(
      `<span class="block text-muted-foreground [overflow-wrap:anywhere]"><bdi>${NAME}</bdi></span>`,
    );
    expect(out).not.toContain(`title="${NAME}"`);
    expect(out).not.toContain("truncate");
  });
});
