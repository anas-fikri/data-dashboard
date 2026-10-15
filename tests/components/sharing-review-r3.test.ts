import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Perbaikan review T-016 putaran 3 (klien): wilayah peringatan selalu ada + aria-describedby ke
 * peringatan editor (R3-UI-1), konfirmasi naik ke editor di daftar akses (R3-UI-2), galat baris
 * terakhir digulir ke pandangan (R3-UI-3), penjaga refresh mode edit (R3-CL-1), email pemilik
 * (R3-CC-1), hapus dashboard yang dibagikan (R3-CC-2), daftar "Dibagikan ke saya" terpotong per
 * pemilik (R3-SEC-2).
 */
const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  roleProps: [] as Record<string, unknown>[],
  dialogs: [] as Record<string, unknown>[],
  requireUser: vi.fn(async () => ({ id: "u1", isAdmin: false })),
  listDashboards: vi.fn(async () => [] as unknown[]),
  listSharedDashboards: vi.fn(),
  listDatasets: vi.fn(async () => [] as unknown[]),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
  // Tautan peringatan share membawa ?f= (R4-CL-3).
  useSearchParams: () => new URLSearchParams(),
}));
// Pemilih pengguna memanggil Server Action; di sini cukup penanda.
vi.mock("@/components/sharing/share-picker", () => ({
  SharePicker: () => createElement("i", { "data-testid": "share-search" }),
}));
// Select peran asli (aria-* sampai ke trigger) + props-nya dicatat untuk memanggil onChange.
vi.mock("@/components/sharing/role-select", async (orig) => {
  const real = await orig<typeof import("@/components/sharing/role-select")>();
  return {
    RoleSelect: (p: Parameters<typeof real.RoleSelect>[0]) => {
      m.roleProps.push(p);
      return createElement(real.RoleSelect, p);
    },
  };
});
// Dialog konfirmasi tertutup di SSR: props-nya dicatat (judul, isi, tombol aksi).
vi.mock("@/components/ui/confirm-dialog", () => ({
  DIALOG_CTA: "cta",
  ConfirmDialog: (p: Record<string, unknown>) => {
    m.dialogs.push(p);
    return null;
  },
}));
vi.mock("@/features/auth/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/features/dashboards/service", () => ({
  listDashboards: m.listDashboards,
  listSharedDashboards: m.listSharedDashboards,
  SHARED_PER_OWNER_MAX: 20,
}));
vi.mock("@/features/datasets/service", () => ({ listDatasets: m.listDatasets }));

const { ShareWarnings } = await import("@/components/sharing/share-warnings");
const { ShareAdd } = await import("@/components/sharing/share-add");
const { PromoteDescription, ShareGrants, revealRowError } =
  await import("@/components/sharing/share-grants");
const model = await import("@/components/sharing/share-model");
const { SharedDashboardList } = await import("@/components/sharing/shared-dashboard-list");
const { AccessRefreshProvider, createAccessGuard, useAccessLost } =
  await import("@/components/widgets/access-refresh");
const { default: DashboardsPage } = await import("@/app/(app)/dashboards/page");

const html = (el: ReactElement) => renderToStaticMarkup(el);

beforeEach(() => {
  vi.clearAllMocks();
  m.roleProps.length = 0;
  m.dialogs.length = 0;
});

describe("R3-UI-1: peringatan editor selalu terjangkau pembaca layar", () => {
  it("wilayah aria-live tetap ada saat kosong (tinggi nol, bukan display:none)", () => {
    const out = html(
      createElement(ShareWarnings, { dashboardId: "d1", editor: false, filterColumns: [] }),
    );
    const region = /<div aria-live="polite" class="([^"]*)"><\/div>/.exec(out)?.[1];
    expect(region).toBeDefined();
    expect(region!.split(" ")).not.toContain("empty:hidden");
    expect(region!.split(" ")).not.toContain("hidden");
    // Margin negatif menetralkan gap-3 form tambah orang.
    expect(region!.split(" ")).toContain("empty:-mt-3");
  });

  it("peringatan editor membawa id untuk aria-describedby", () => {
    const out = html(
      createElement(ShareWarnings, {
        dashboardId: "d1",
        editor: true,
        editorId: "warn-1",
        filterColumns: [],
      }),
    );
    expect(out).toContain('id="warn-1" data-testid="share-warning-editor"');
    expect(out).toContain(model.EDITOR_WARNING);
  });

  const add = (describedBy?: string) =>
    html(
      createElement(ShareAdd, {
        dashboardId: "d1",
        role: "EDITOR",
        onRole: () => {},
        granted: new Map(),
        busy: null,
        error: null,
        inputRef: { current: null },
        onAdd: async () => false,
        warnings: null,
        describedBy,
      }),
    );

  it("Select peran dan tombol Bagikan dideskripsikan oleh peringatan editor", () => {
    const out = add("warn-1");
    expect(out).toMatch(/aria-describedby="warn-1"[^>]*data-testid="share-role"/);
    expect(out).toMatch(/<button[^>]*aria-describedby="warn-1"[^>]*data-testid="share-add"/);
  });

  it("tanpa peringatan editor → tanpa aria-describedby", () => {
    expect(add()).not.toContain("aria-describedby");
  });
});

describe("R3-UI-2: naik ke editor di daftar akses lewat konfirmasi", () => {
  const list = [
    { userId: "u1", name: "Ani", email: "ani@pcp.co.id", role: "EDITOR" as const, active: true },
    { userId: "u2", name: null, email: "budi@pcp.co.id", role: "VIEWER" as const, active: true },
  ];
  const render = (onRole = vi.fn()) => {
    html(
      createElement(ShareGrants, {
        grants: list,
        orgShared: false,
        busy: null,
        error: null,
        revokeError: null,
        onRole,
        onRevoke: async () => true,
        onRevokeCancel: () => {},
      }),
    );
    return onRole;
  };
  const rowSelect = (email: string) =>
    m.roleProps.find((p) => p["aria-label"] === `Peran ${email}`) as {
      onChange: (r: "VIEWER" | "EDITOR") => void;
    };

  it("langkah: sama → tidak ada; ke EDITOR → konfirmasi; ke VIEWER → langsung simpan", () => {
    expect(model.roleChangeStep("VIEWER", "VIEWER")).toBe("none");
    expect(model.roleChangeStep("EDITOR", "EDITOR")).toBe("none");
    expect(model.roleChangeStep("VIEWER", "EDITOR")).toBe("confirm");
    expect(model.roleChangeStep("EDITOR", "VIEWER")).toBe("save");
  });

  it("VIEWER → EDITOR tidak langsung disimpan; EDITOR → VIEWER disimpan", () => {
    const onRole = render();
    rowSelect("budi@pcp.co.id").onChange("EDITOR");
    expect(onRole).not.toHaveBeenCalled();
    rowSelect("ani@pcp.co.id").onChange("VIEWER");
    expect(onRole).toHaveBeenCalledTimes(1);
    expect(onRole).toHaveBeenCalledWith(list[0], "VIEWER");
    rowSelect("ani@pcp.co.id").onChange("EDITOR"); // peran sama
    expect(onRole).toHaveBeenCalledTimes(1);
  });

  it("dialog 'Jadikan editor?' tertutup sampai dipilih; isinya memuat email + peringatan editor", () => {
    render();
    const dialog = m.dialogs.find((d) => d.title === "Jadikan editor?");
    expect(dialog).toBeDefined();
    expect(dialog!.open).toBe(false);
    expect(dialog!["data-testid"]).toBe("share-promote-confirm");
    expect(typeof dialog!.onCloseAutoFocus).toBe("function");
    const out = html(createElement(PromoteDescription, { email: "budi@pcp.co.id" }));
    expect(out).toContain("budi<wbr/>@pcp.co.id");
    expect(out).toContain(
      `<span data-testid="share-promote-warning" class="font-medium text-foreground">${model.EDITOR_WARNING}</span>`,
    );
    const action = html(dialog!.action as ReactElement);
    expect(action).toContain("Jadikan editor");
    expect(action).toContain('data-testid="share-promote"');
  });
});

describe("R3-UI-3: galat ganti peran baris terakhir digulir ke pandangan", () => {
  it("callback ref tingkat modul: gulir 'nearest' (seperlunya), tanpa memindah fokus", () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    revealRowError({ scrollIntoView, focus } as unknown as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(focus).not.toHaveBeenCalled();
    expect(() => revealRowError(null)).not.toThrow(); // dilepas saat galat hilang
  });
});

describe("R3-CL-1: penjaga refresh mode edit setelah widget dihapus di tempat lain", () => {
  it("widget dihapus → satu refresh; props server tanpa widget itu → penjaga dipasang lagi", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a", "b", "c"]);
    // (3) c dihapus pemilik: query c 404 → satu refresh.
    expect(g.lost("c")).toBe(true);
    expect(g.lost("c")).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Refresh membawa props server tanpa c (kanvas edit tidak dipasang ulang).
    g.sync(["a", "b"]);
    // c masih di state editor: 404-nya pada filter berikutnya tidak memakai jatah.
    expect(g.lost("c")).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    // (5) akses dicabut: widget yang masih ada 404 → refresh lagi (halaman jadi 404).
    expect(g.lost("a")).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("tanpa loop: props server sama setelah refresh → penjaga tidak dipasang lagi", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a", "b"]);
    expect(g.lost("a")).toBe(true);
    g.sync(["b", "a"]); // urutan lain, isi sama
    expect(g.lost("a")).toBe(false);
    expect(g.lost()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("widget baru sesi ini (belum pernah di props server) dan slicer tetap memakai penjaga", () => {
    const refresh = vi.fn();
    const g = createAccessGuard(refresh, ["a"]);
    expect(g.lost("baru")).toBe(true);
    g.sync(["a", "baru"]); // simpanan widget baru membawa props baru
    expect(g.lost()).toBe(true); // slicer (tanpa id)
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("provider: nilai konteks memanggil router.refresh paling banyak sekali", () => {
    let lost: ReturnType<typeof useAccessLost> = null;
    function Probe() {
      lost = useAccessLost();
      return null;
    }
    // Dipanggil sebagai fungsi di dalam komponen pembungkus (hook-nya milik pembungkus).
    function Canvas() {
      return AccessRefreshProvider({ serverWidgetIds: ["a"], children: createElement(Probe) });
    }
    html(createElement(Canvas));
    expect(lost).toBeTypeOf("function");
    expect(lost!("a")).toBe(true);
    expect(lost!("a")).toBe(false);
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("R3-CC-1: email pemilik di 'Dibagikan ke saya'", () => {
  const at = new Date("2026-10-15T03:00:00Z");
  const named = {
    id: "d1",
    name: "Target Q4 – resmi",
    datasetName: "Rekap",
    ownerName: "Anas Fikri",
    ownerEmail: "peniru@pcp.co.id",
    role: "VIEWER" as const,
    widgetCount: 1,
    updatedAt: at,
  };

  for (const compact of [false, true]) {
    it(`nama + email di baris sendiri; email tidak pernah terpotong (compact=${compact})`, () => {
      const out = html(createElement(SharedDashboardList, { dashboards: [named], compact }));
      const cell = /<span class="[^"]*" data-testid="shared-owner">(.*?)<\/span><\/span>/.exec(
        out,
      )?.[1];
      expect(cell).toContain("<bdi>Anas Fikri</bdi>");
      const email = /<span class="([^"]*)"><bdi dir="ltr">peniru<wbr\/>@pcp.co.id<\/bdi>/.exec(
        out,
      )?.[1];
      expect(email).toBeDefined();
      expect(email).toContain("[overflow-wrap:anywhere]");
      expect(email).not.toContain("truncate");
    });
  }

  it("tanpa nama → email dengan label Pemilik, tanpa frasa 'pengguna tanpa nama'", () => {
    const out = html(
      createElement(SharedDashboardList, {
        dashboards: [{ ...named, ownerName: null }],
        compact: true,
      }),
    );
    expect(out).toContain('Pemilik: </span><bdi dir="ltr">peniru<wbr/>@pcp.co.id</bdi>');
    expect(out).not.toContain("tanpa nama");
    expect(out.match(/peniru/g)).toHaveLength(1);
  });
});

describe("R3-CC-2: hapus dashboard yang dibagikan menyebut yang kehilangan akses", () => {
  it("orang / organisasi / keduanya; tidak dibagikan atau bukan pemilik → null", () => {
    expect(model.deleteLostAccess({ orgShared: false, shareCount: 3 })).toBe(
      "3 orang kehilangan akses ke dashboard ini.",
    );
    expect(model.deleteLostAccess({ orgShared: true, shareCount: 0 })).toBe(
      "Seluruh organisasi kehilangan akses ke dashboard ini.",
    );
    expect(model.deleteLostAccess({ orgShared: true, shareCount: 1200 })).toBe(
      "1.200 orang dan seluruh organisasi kehilangan akses ke dashboard ini.",
    );
    expect(model.deleteLostAccess({ orgShared: false, shareCount: 0 })).toBeNull();
    expect(model.deleteLostAccess(null)).toBeNull();
    expect(model.deleteLostAccess(undefined)).toBeNull();
  });
});

describe("R3-SEC-2: share langsung yang terpotong batas per pemilik disebut", () => {
  const item = {
    id: "d1",
    name: "Penjualan",
    datasetName: "Rekap",
    ownerName: "Sari",
    ownerEmail: "sari@pcp.co.id",
    role: "VIEWER" as const,
    widgetCount: 1,
    updatedAt: new Date("2026-10-15T03:00:00Z"),
  };
  // R4: hiddenDirect → hidden (share langsung + organisasi dihitung bersama).
  const render = async (hidden: number) => {
    m.listSharedDashboards.mockResolvedValue({ items: [item], hidden });
    return html((await DashboardsPage({ searchParams: Promise.resolve({}) })) as ReactElement);
  };

  it("teks: jumlah + batas per pemilik (format id-ID) + langkah berikutnya (R4-UI-2)", () => {
    expect(model.hiddenSharedText(1500, 20)).toBe(
      "1.500 dashboard lain yang dibagikan kepada Anda tidak ditampilkan karena daftar terlalu panjang (paling banyak 20 per pemilik). Buka lewat tautan dari pemiliknya.",
    );
  });

  it("/dashboards: hidden > 0 → catatan redup di bagian 'Dibagikan ke saya'", async () => {
    const out = await render(7);
    const section = out.slice(out.indexOf('aria-labelledby="dibagikan-ke-saya"'));
    expect(section).toContain(
      '<p class="text-sm text-muted-foreground" data-testid="shared-hidden">7 dashboard lain',
    );
    expect(section).toContain('data-testid="shared-row"');
  });

  it("/dashboards: hidden 0 → tanpa catatan", async () => {
    expect(await render(0)).not.toContain('data-testid="shared-hidden"');
  });
});
