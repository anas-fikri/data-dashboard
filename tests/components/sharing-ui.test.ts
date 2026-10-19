import { Dialog } from "radix-ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasEmpty } from "@/components/dashboards/canvas-empty";
import { DashboardList } from "@/components/dashboards/dashboard-list";
import { WidgetConfigForm } from "@/components/dashboards/widget-config";
import { AccessBadges, SharedRoleBadge } from "@/components/sharing/access-badge";
import {
  EDITOR_WARNING,
  FILTER_WARNING,
  NETWORK_ERROR,
  accessLabels,
  announce,
  isShareRole,
  pickerStatus,
  roleLabel,
  searchable,
  shareErrorText,
  sharedRoleLabel,
  showEditorWarning,
  showFilterWarning,
} from "@/components/sharing/share-model";
import { ShareGrants } from "@/components/sharing/share-grants";
import { ShareOptions } from "@/components/sharing/share-options";
import { ShareOrg } from "@/components/sharing/share-org";
import { ShareWarnings } from "@/components/sharing/share-warnings";
import { SharedDashboardList } from "@/components/sharing/shared-dashboard-list";
import type { WidgetView } from "@/features/dashboards/service";
import type { ShareGrantView } from "@/features/sharing/types";

// Tautan peringatan share membaca ?f= (R4-CL-3); di luar App Router diganti (tanpa filter).
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(),
}));

/*
 * T-016 UI berbagi: kapan peringatan dialog share tampil, teks badge akses/peran, syarat pencarian,
 * pesan galat, daftar "Dibagikan ke saya", dan tautan milik pemilik yang disembunyikan dari non-pemilik.
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const none = { editor: false, filterColumns: [] as string[] };

describe("peringatan dialog share", () => {
  it("editor: tampil bila ada grant EDITOR, peran yang ditambahkan EDITOR, atau server menandainya", () => {
    expect(showEditorWarning([], none, "VIEWER")).toBe(false);
    expect(showEditorWarning([{ role: "VIEWER" }], none, "VIEWER")).toBe(false);
    expect(showEditorWarning([{ role: "VIEWER" }, { role: "EDITOR" }], none, "VIEWER")).toBe(true);
    expect(showEditorWarning([], none, "EDITOR")).toBe(true);
    expect(showEditorWarning([], { editor: true }, "VIEWER")).toBe(true);
  });

  it("kolom filter: hanya bila server menemukan nama kolom lintas sheet", () => {
    expect(showFilterWarning(none)).toBe(false);
    expect(showFilterWarning({ filterColumns: ["Cabang"] })).toBe(true);
  });

  const warnings = (editor: boolean, filterColumns: string[]) =>
    html(
      createElement(
        Dialog.Root,
        null,
        createElement(ShareWarnings, { dashboardId: "d1", editor, filterColumns }),
      ),
    );

  it("render: test id + teks wajib; nama kolom dan tautan ke pengaturan kolom filter mode edit", () => {
    const both = warnings(true, ["Cabang", "Tanggal"]);
    expect(both).toContain('data-testid="share-warning-editor"');
    expect(both).toContain(EDITOR_WARNING);
    expect(both).toContain('data-testid="share-warning-filters"');
    expect(both).toContain(FILTER_WARNING);
    expect(both).toContain("Cabang");
    expect(both).toContain("Tanggal");
    expect(both).toContain('href="/dashboards/d1?mode=edit#kolom-filter"');
    // Wilayah selalu terpasang dan sopan: peringatan yang muncul belakangan ikut dibacakan.
    expect(both).toContain('aria-live="polite"');
  });

  it("render: tanpa peringatan → tidak ada test id peringatan", () => {
    const out = warnings(false, []);
    expect(out).not.toContain("share-warning-editor");
    expect(out).not.toContain("share-warning-filters");
    expect(warnings(true, [])).not.toContain("share-warning-filters");
    expect(warnings(false, ["Kode"])).not.toContain("share-warning-editor");
  });
});

describe("label peran dan akses", () => {
  it("peran share: Select dan kepala halaman", () => {
    expect(roleLabel("VIEWER")).toBe("Hanya lihat");
    expect(roleLabel("EDITOR")).toBe("Bisa mengedit widget");
    expect(sharedRoleLabel("VIEWER")).toBe("Hanya lihat");
    expect(sharedRoleLabel("EDITOR")).toBe("Editor");
    expect(isShareRole("EDITOR")).toBe(true);
    expect(isShareRole("OWNER")).toBe(false);
  });

  it("akses dashboard sendiri: Pribadi / N orang / Organisasi (+ orang tertentu tetap terlihat)", () => {
    expect(accessLabels({ orgShared: false, shareCount: 0 })).toEqual([
      { kind: "private", text: "Pribadi" },
    ]);
    expect(accessLabels({ orgShared: false, shareCount: 3 })).toEqual([
      { kind: "people", text: "3 orang" },
    ]);
    expect(accessLabels({ orgShared: true, shareCount: 0 })).toEqual([
      { kind: "org", text: "Organisasi" },
    ]);
    expect(accessLabels({ orgShared: true, shareCount: 2 }).map((a) => a.text)).toEqual([
      "Organisasi",
      "2 orang",
    ]);
    expect(accessLabels({ orgShared: false, shareCount: 1200 })[0]!.text).toBe("1.200 orang");
  });

  it("render badge akses dan badge peran", () => {
    expect(html(createElement(AccessBadges, { orgShared: false, shareCount: 0 }))).toContain(
      "Pribadi",
    );
    const org = html(createElement(AccessBadges, { orgShared: true, shareCount: 1 }));
    expect(org).toContain("Organisasi");
    expect(org).toContain("1 orang");
    expect(html(createElement(SharedRoleBadge, { role: "VIEWER" }))).toContain("Hanya lihat");
    expect(html(createElement(SharedRoleBadge, { role: "EDITOR" }))).toContain("Editor");
  });
});

describe("pencarian pengguna, galat, pengumuman", () => {
  it("dicari mulai 3 karakter (spasi diabaikan)", () => {
    expect(searchable("")).toBe(false);
    expect(searchable("ab")).toBe(false);
    expect(searchable("  ab  ")).toBe(false);
    expect(searchable("abc")).toBe(true);
  });

  it("galat: pesan server apa adanya; aksi yang melempar → pesan jaringan", () => {
    expect(shareErrorText(null)).toBe(NETWORK_ERROR);
    expect(
      shareErrorText({
        ok: false,
        code: "NOT_FOUND",
        message: "Pengguna tidak ditemukan atau belum aktif.",
      }),
    ).toBe("Pengguna tidak ditemukan atau belum aktif.");
    expect(shareErrorText({ ok: false, code: "X", message: "" })).toMatch(/Coba lagi/);
  });

  it("pengumuman menyebut email (identitas) dan hasilnya", () => {
    expect(announce.grant("b@pcp.co.id", "VIEWER")).toBe(
      "b@pcp.co.id kini bisa melihat dashboard ini.",
    );
    expect(announce.grant("b@pcp.co.id", "EDITOR")).toContain("bisa mengedit widget");
    expect(announce.role("b@pcp.co.id", "EDITOR")).toBe(
      "Peran b@pcp.co.id diubah menjadi Bisa mengedit widget.",
    );
    expect(announce.revoke("b@pcp.co.id")).toBe("Akses b@pcp.co.id dicabut.");
    expect(announce.org(true)).toContain("seluruh organisasi");
    expect(announce.org(false)).toContain("dimatikan");
  });
});

describe("pemilih pengguna dan daftar akses (render)", () => {
  it("status pemilih: petunjuk 3 huruf, memuat, kosong, batas 10, jumlah; kosong saat galat", () => {
    expect(pickerStatus("idle", 0, "")).toBe("Ketik minimal 3 huruf email atau nama rekan.");
    expect(pickerStatus("loading", 2, "ani")).toBe("Mencari pengguna…");
    expect(pickerStatus("error", 0, "ani")).toBe("");
    expect(pickerStatus("done", 0, "zzz")).toContain("“zzz”");
    expect(pickerStatus("done", 10, "a@b")).toContain("10 hasil pertama");
    expect(pickerStatus("done", 3, "ani")).toBe("3 pengguna ditemukan.");
  });

  it("opsi: grup radio berlabel, test id + data-user-id, email dulu, tanda sudah punya akses", () => {
    const out = html(
      createElement(ShareOptions, {
        name: "u",
        labelledBy: "lbl",
        items: [
          { id: "u1", name: "Ani", email: "ani@pcp.co.id" },
          { id: "u2", name: null, email: "budi@pcp.co.id" },
        ],
        selectedId: "u2",
        granted: new Map([["u1", "EDITOR" as const]]),
        disabled: false,
        loading: true,
        onSelect: () => {},
      }),
    );
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-labelledby="lbl"');
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/data-testid="share-option"/g)).toHaveLength(2);
    expect(out).toContain('data-user-id="u1"');
    expect(out).toContain("Sudah punya akses: Bisa mengedit widget");
    expect(out.indexOf("ani@")).toBeLessThan(out.indexOf("Ani<"));
    expect(out).toMatch(/checked="" value="u2"/);
    expect(out).not.toMatch(/checked="" value="u1"/);
  });

  it("berbagi organisasi: sakelar berlabel + penjelasan terhubung", () => {
    const out = html(
      createElement(ShareOrg, { on: true, disabled: false, error: null, onChange: () => {} }),
    );
    expect(out).toContain('data-testid="share-org"');
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain("Bagikan ke seluruh organisasi");
    expect(out).toContain("Semua pengguna aktif dapat melihat dashboard ini (hanya lihat).");
    const help = /<p id="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`aria-describedby="${help}"`);
  });

  const grants = (list: ShareGrantView[], orgShared = false) =>
    html(
      createElement(ShareGrants, {
        grants: list,
        orgShared,
        busy: null,
        error: null,
        revokeError: null,
        onRole: () => {},
        onRevoke: async () => true,
        onRevokeCancel: () => {},
      }),
    );

  it("daftar akses: baris per orang dengan peran, Cabut berlabel email, badge Nonaktif", () => {
    const out = grants([
      { userId: "u1", name: "Ani", email: "ani@pcp.co.id", role: "EDITOR", active: true },
      { userId: "u2", name: null, email: "budi@pcp.co.id", role: "VIEWER", active: false },
    ]);
    expect(out.match(/data-testid="share-grant"/g)).toHaveLength(2);
    expect(out).toContain('data-user-id="u2"');
    expect(out.match(/data-testid="share-grant-role"/g)).toHaveLength(2);
    expect(out).toContain('aria-label="Peran ani@pcp.co.id"');
    expect(out).toContain('aria-label="Cabut akses budi@pcp.co.id"');
    expect(out.match(/data-testid="share-revoke"/g)).toHaveLength(2);
    // Hanya akun nonaktif yang diberi badge (teks peran Select baru terisi di klien, bukan SSR).
    expect(out.match(/Nonaktif/g)).toHaveLength(1);
  });

  it("daftar akses kosong: keterangan (+ catatan berbagi organisasi)", () => {
    expect(grants([])).toContain("Belum ada orang yang diberi akses.");
    expect(grants([])).not.toContain("organisasi");
    expect(grants([], true)).toContain("lewat berbagi organisasi");
  });
});

describe("daftar dashboard", () => {
  const at = new Date("2026-10-15T03:00:00Z");

  it("Dibagikan ke saya: test id, pemilik (fallback email), peran, tautan dashboard", () => {
    const out = html(
      createElement(SharedDashboardList, {
        dashboards: [
          {
            id: "d1",
            name: "Penjualan",
            datasetName: "Rekap 2026",
            ownerName: "Sari",
            ownerEmail: "sari@pcp.co.id",
            role: "VIEWER",
            widgetCount: 3,
            updatedAt: at,
          },
          {
            id: "d2",
            name: "Stok",
            datasetName: "Gudang",
            ownerName: null,
            ownerEmail: "gudang@pcp.co.id",
            role: "EDITOR",
            widgetCount: 0,
            updatedAt: at,
          },
        ],
      }),
    );
    expect(out).toContain('data-testid="shared-list"');
    expect(out.match(/data-testid="shared-row"/g)).toHaveLength(2);
    expect(out).toContain('href="/dashboards/d1"');
    expect(out).toContain("Rekap 2026");
    expect(out).toContain("Sari");
    expect(out).toContain("gudang<wbr/>@pcp.co.id");
    expect(out).toContain("Hanya lihat");
    expect(out).toContain("Editor");
  });

  it("Dashboard saya: badge akses per baris", () => {
    const out = html(
      createElement(DashboardList, {
        dashboards: [
          {
            id: "d1",
            name: "A",
            datasetId: "s1",
            datasetName: "X",
            widgetCount: 1,
            updatedAt: at,
            orgShared: true,
            shareCount: 0,
          },
          {
            id: "d2",
            name: "B",
            datasetId: "s1",
            datasetName: "X",
            widgetCount: 1,
            updatedAt: at,
            orgShared: false,
            shareCount: 0,
          },
        ],
      }),
    );
    expect(out).toContain("Organisasi");
    expect(out).toContain("Pribadi");
  });
});

describe("tautan milik pemilik tidak tampil untuk non-pemilik", () => {
  it("kanvas kosong mode lihat: viewer tanpa ajakan edit; pemilik/editor punya tautan edit", () => {
    const viewer = html(
      createElement(CanvasEmpty, { dashboardId: "d1", editing: false, canEdit: false }),
    );
    expect(viewer).not.toContain("mode=edit");
    expect(viewer).toContain("belum berisi widget");
    const editor = html(
      createElement(CanvasEmpty, { dashboardId: "d1", editing: false, canEdit: true }),
    );
    expect(editor).toContain('href="/dashboards/d1?mode=edit"');
  });

  it("panel widget tanpa data siap: tautan /datasets hanya untuk pemilik", () => {
    const widget: WidgetView = { id: "w1", type: "empty", title: "", spec: {}, version: "v1" };
    const props = {
      dashboardId: "cmv4kljx40009oczvdmpudash0",
      widget,
      sources: [],
      onSave: async () => true,
    };
    const owner = html(createElement(WidgetConfigForm, { ...props, datasetId: "ds1" }));
    expect(owner).toContain('href="/datasets/ds1"');
    const editor = html(createElement(WidgetConfigForm, { ...props, datasetId: null }));
    expect(editor).not.toContain("/datasets");
    expect(editor).toContain("diatur oleh pemiliknya");
  });
});
