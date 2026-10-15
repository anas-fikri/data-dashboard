import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/components/dashboards/dashboard-api";
import { DashboardList } from "@/components/dashboards/dashboard-list";
import { fetchValues } from "@/components/dashboards/filters/use-filter-values";
import { patchWidget } from "@/components/dashboards/use-dashboard-editor";
import { SHARE_DIALOG_BODY, SHARE_DIALOG_BOX } from "@/components/sharing/share-dialog";
import { ShareGrants } from "@/components/sharing/share-grants";
import { keepSelection, visibleResults } from "@/components/sharing/share-model";
import { SharedDashboardList } from "@/components/sharing/shared-dashboard-list";
import { isAccessLost } from "@/components/widgets/access-refresh";
import { WIDGET_CHANGED, bodyState, withChangeCheck } from "@/components/widgets/body-state";
import { WidgetError } from "@/components/widgets/widget-error";
import type { WidgetQueryState } from "@/components/widgets/widget-query";
import type { WidgetView } from "@/features/dashboards/service";
import type { ShareGrantView } from "@/features/sharing/types";

/*
 * Perbaikan review T-016 putaran 1 (klien): versi pengaturan widget (DI-1), pilihan tersembunyi di
 * pemilih share (CL-1), kolom daftar sejajar (UI-1), galat ganti peran di barisnya (UI-2), nama
 * panjang membungkus (UI-5), dialog share di layar pendek (UI-6), slicer 404 (Q-1), frasa pemilik
 * tanpa nama (Q-2).
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("T016-DI-1: data dari pengaturan widget yang diubah di tempat lain", () => {
  const data = (widgetVersion?: string) => ({
    columns: [{ key: "c0", label: "Total", type: "integer" as const }],
    rows: [[10]],
    ...(widgetVersion ? { widgetVersion } : {}),
  });
  const ok = (v?: string): WidgetQueryState => ({ status: "ok", data: data(v), filters: "[]" });

  it("versi tidak dikenal kartu → galat CHANGED tanpa data (data spec lain tidak ditampilkan)", () => {
    const s = withChangeCheck(ok("v2"), ["v1"]);
    expect(s).toEqual({ status: "error", code: "CHANGED", message: WIDGET_CHANGED, filters: "[]" });
    expect(s.data).toBeUndefined();
    expect(WIDGET_CHANGED).toBe("Widget ini sudah diubah. Muat ulang halaman.");
    // Kepala kartu sepakat: tidak ada baris (tombol data grafik tidak ditawarkan).
    expect(bodyState(s, true, true)).toBe("none");
  });

  it("memuat ulang / galat dengan data lama dari versi asing → tetap CHANGED", () => {
    expect(withChangeCheck({ status: "loading", data: data("v9") }, ["v1"]).status).toBe("error");
    const kept: WidgetQueryState = { status: "error", code: "X", message: "m", data: data("v9") };
    expect(withChangeCheck(kept, ["v1"])).toMatchObject({ code: "CHANGED" });
  });

  it("tab yang menyimpan tidak menandai dirinya: versi lama milik sendiri dan versi barunya diterima", () => {
    const known = ["v1", "v2"]; // awal dari server + hasil simpanan tab ini
    expect(withChangeCheck(ok("v1"), known)).toEqual(ok("v1"));
    expect(withChangeCheck(ok("v2"), known)).toEqual(ok("v2"));
    expect(withChangeCheck(ok("v3"), known).status).toBe("error");
  });

  it("tanpa versi di jawaban atau di kartu → tidak diperiksa", () => {
    expect(withChangeCheck(ok(), ["v1"])).toEqual(ok());
    expect(withChangeCheck(ok("v2"), [])).toEqual(ok("v2"));
    expect(withChangeCheck({ status: "loading" }, ["v1"])).toEqual({ status: "loading" });
  });

  it("galat CHANGED: tombol 'Muat ulang' (muat ulang halaman), bukan 'Coba lagi' / petunjuk panel", () => {
    const out = html(
      createElement(WidgetError, {
        title: "Omzet",
        code: "CHANGED",
        message: WIDGET_CHANGED,
        editing: true,
        onRetry: () => {},
      }),
    );
    expect(out).toContain('data-code="CHANGED"');
    expect(out).toContain(WIDGET_CHANGED);
    expect(out).toContain('data-testid="widget-reload"');
    expect(out).toContain("Muat ulang");
    expect(out).not.toContain("Coba lagi");
    expect(out).not.toContain("Ubah lewat tombol pengaturan widget.");
  });

  const fetchOk = (data: unknown) => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ ok: true, data }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };
  const sent = (fetch: ReturnType<typeof fetchOk>) =>
    JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as Record<string, unknown>;

  it("ganti judul dan atur isi mengirim versi yang dilihat tab ini; jawaban membawa versi baru", async () => {
    const f1 = fetchOk({ title: "Baru", version: "v2" });
    const r1 = await api.renameWidget("d1", "w1", "Baru", "v1");
    expect(f1.mock.calls[0]![0]).toBe("/api/dashboards/d1/widgets/w1");
    expect(sent(f1)).toEqual({ title: "Baru", version: "v1" });
    expect(r1).toEqual({ ok: true, data: { title: "Baru", version: "v2" } });

    const f2 = fetchOk({ type: "kpi", spec: { a: 1 }, version: "v3" });
    const r2 = await api.configureWidget("d1", "w1", "kpi", { a: 1 }, "v2");
    expect(sent(f2)).toEqual({ type: "kpi", spec: { a: 1 }, version: "v2" });
    expect(r2.ok && r2.data.version).toBe("v3");
  });

  it("STALE 409 dari PATCH widget → hasil gagal dengan pesan server (editor membeku lewat freezeOf)", async () => {
    const message = "Widget ini sudah berubah sejak halaman ini dimuat.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, code: "STALE", message }, { status: 409 })),
    );
    expect(await api.configureWidget("d1", "w1", "kpi", {}, "v1")).toEqual({
      ok: false,
      status: 409,
      code: "STALE",
      message,
    });
  });

  it("simpanan berhasil → widget lokal memegang versi baru (dikirim di ubahan berikutnya)", () => {
    const ws: WidgetView[] = [
      { id: "w1", type: "kpi", title: "A", spec: {}, version: "v1", retargeted: true },
      { id: "w2", type: "bar", title: "B", spec: {}, version: "x1" },
    ];
    const next = patchWidget(ws, "w1", {
      type: "table",
      spec: { b: 2 },
      version: "v2",
      retargeted: undefined,
    });
    expect(next[0]).toEqual({
      id: "w1",
      type: "table",
      title: "A",
      spec: { b: 2 },
      version: "v2",
      retargeted: undefined,
    });
    expect(next[1]).toBe(ws[1]);
    expect(patchWidget(next, "w1", { title: "C", version: "v3" })[0]).toMatchObject({
      title: "C",
      type: "table",
      version: "v3",
    });
  });
});

describe("T016-CL-1: pencarian gagal membuang pilihan yang tersembunyi", () => {
  const B = { id: "uB", name: "Budi", email: "b@pcp.co.id" };
  const C = { id: "uC", name: null, email: "c@pcp.co.id" };

  it("gagal (jaringan / RATE_LIMITED / BUSY) → hasil terlihat kosong → pilihan B batal", () => {
    expect(visibleResults(null)).toEqual([]);
    expect(visibleResults({ ok: false, code: "BUSY", message: "Sibuk" })).toEqual([]);
    expect(keepSelection(B, visibleResults(null))).toBeNull();
    expect(
      keepSelection(B, visibleResults({ ok: false, code: "RATE_LIMITED", message: "x" })),
    ).toBeNull();
  });

  it("berhasil → pilihan tetap hanya bila orangnya masih ada di hasil", () => {
    expect(visibleResults({ ok: true, data: [B, C] })).toEqual([B, C]);
    expect(keepSelection(B, visibleResults({ ok: true, data: [B, C] }))).toBe(B);
    expect(keepSelection(B, visibleResults({ ok: true, data: [C] }))).toBeNull();
    expect(keepSelection(null, [B])).toBeNull();
  });
});

describe("T016-UI-1: daftar 'Dashboard saya' sejajar dengan kepala kolom", () => {
  const at = new Date("2026-10-15T03:00:00Z");
  const row = (id: string, orgShared: boolean, shareCount: number) => ({
    id,
    name: id,
    datasetId: "s1",
    datasetName: "X",
    widgetCount: 1,
    updatedAt: at,
    orgShared,
    shareCount,
  });

  it("kepala dan semua baris memakai lajur yang sama dan tidak bergantung isi (tanpa auto)", () => {
    const out = html(
      createElement(DashboardList, {
        dashboards: [row("a", true, 3), row("b", false, 0)],
      }),
    );
    const templates = [...out.matchAll(/@3xl:grid-cols-\[([^\]]+)\]/g)].map((m) => m[1]!);
    expect(templates).toHaveLength(3); // kepala + 2 baris
    expect(new Set(templates).size).toBe(1);
    expect(templates[0]).not.toMatch(/auto|min-content|max-content|fit-content/);
    // Dua badge (Organisasi + 3 orang) di satu sel yang membungkus, bukan sel grid tambahan.
    expect(out).toContain("Organisasi");
    expect(out).toContain("3 orang");
    expect(
      out.match(/class="inline-flex flex-wrap gap-1" data-testid="dashboard-access"/g),
    ).toHaveLength(2);
  });
});

describe("T016-UI-2: ganti peran gagal tampil di baris itu", () => {
  const list: ShareGrantView[] = [
    { userId: "u1", name: "Ani", email: "ani@pcp.co.id", role: "EDITOR", active: true },
    { userId: "u2", name: null, email: "budi@pcp.co.id", role: "VIEWER", active: true },
  ];
  const grants = (error: string | null, errorUserId: string | null) =>
    html(
      createElement(ShareGrants, {
        grants: list,
        orgShared: false,
        busy: null,
        error,
        errorUserId,
        revokeError: null,
        onRole: () => {},
        onRevoke: async () => true,
        onRevokeCancel: () => {},
      }),
    );
  const rowOf = (out: string, userId: string) =>
    out.match(new RegExp(`<li[^>]*data-user-id="${userId}"[^>]*>.*?</li>`))?.[0] ?? "";

  it("alasan di dalam baris u2 (role=alert), terhubung ke Select-nya; tidak di bawah daftar", () => {
    const out = grants("Pengguna ini belum punya akses.", "u2");
    const row = rowOf(out, "u2");
    expect(row).toContain('data-testid="share-grant-error"');
    expect(row).toContain('role="alert"');
    expect(row).toContain("Pengguna ini belum punya akses.");
    const errId = /<div id="([^"]+)" data-testid="share-grant-error"/.exec(row)![1];
    expect(row).toMatch(
      new RegExp(`aria-describedby="${errId}"[^>]*data-testid="share-grant-role"`),
    );
    expect(rowOf(out, "u1")).not.toContain("share-grant-error");
    expect(rowOf(out, "u1")).not.toContain("aria-describedby");
    // Satu pesan saja (bukan juga di bawah daftar).
    expect(out.match(/Pengguna ini belum punya akses\./g)).toHaveLength(1);
    expect(out.slice(out.indexOf("</ul>"))).not.toContain('role="alert"');
  });

  it("baris sudah tidak ada / galat tanpa baris → tetap tampil di bawah daftar", () => {
    const out = grants("Gagal", "u9");
    expect(out).not.toContain('data-testid="share-grant-error"');
    expect(out.slice(out.indexOf("</ul>"))).toContain("Gagal");
    expect(grants("Gagal", null).slice(grants("Gagal", null).indexOf("</ul>"))).toContain("Gagal");
  });
});

describe("T016-UI-5 / Q-2: nama dataset/pemilik panjang dan pemilik tanpa nama", () => {
  const at = new Date("2026-10-15T03:00:00Z");
  const long = "Data pengiriman cabang Jabodetabek dan sekitarnya tahun 2026 revisi kedua";
  const owner = "Raden Ayu Kusumawardhani Prameswari Notonegoro";
  const dashboards = [
    {
      id: "d1",
      name: "Penjualan",
      datasetName: long,
      ownerName: owner,
      ownerEmail: "raden.ayu@pcp.co.id",
      role: "VIEWER" as const,
      widgetCount: 3,
      updatedAt: at,
    },
    {
      id: "d2",
      name: "Stok",
      datasetName: "Gudang",
      ownerName: null,
      ownerEmail: "gudang@pcp.co.id",
      role: "EDITOR" as const,
      widgetCount: 0,
      updatedAt: at,
    },
  ];
  const spanOf = (out: string, text: string) =>
    out.match(new RegExp(`<span class="([^"]*)" title="${text}">`))?.[1];

  it("bertumpuk: membungkus (overflow-wrap:anywhere); tabel lebar: terpotong + title", () => {
    const out = html(createElement(SharedDashboardList, { dashboards }));
    for (const text of [long, owner]) {
      const cls = spanOf(out, text);
      expect(cls).toContain("[overflow-wrap:anywhere]");
      expect(cls).toContain("@3xl:truncate");
      expect(cls!.split(" ")).not.toContain("truncate");
    }
  });

  it("kartu Beranda (ringkas): pemilik selalu membungkus, tidak pernah terpotong", () => {
    const out = html(createElement(SharedDashboardList, { dashboards, compact: true }));
    const cls = spanOf(out, owner);
    expect(cls).toContain("[overflow-wrap:anywhere]");
    expect(cls).not.toContain("truncate");
  });

  it("pemilik tanpa nama: emailnya setelah label (R3-CC-1 menggantikan frasa 'pengguna tanpa nama')", () => {
    const out = html(createElement(SharedDashboardList, { dashboards, compact: true }));
    expect(out).toContain(`Pemilik: </span><bdi dir="ltr">gudang<wbr/>@pcp.co.id</bdi>`);
    expect(out).not.toContain("tanpa nama");
  });
});

describe("T016-UI-6: dialog share di layar pendek", () => {
  it("≤ 480 px tinggi: seluruh dialog satu area gulir (kepala/kaki ikut bergulir)", () => {
    expect(SHARE_DIALOG_BOX).toContain("[@media(max-height:480px)]:overflow-y-auto");
    expect(SHARE_DIALOG_BODY).toContain("[@media(max-height:480px)]:min-h-fit");
    expect(SHARE_DIALOG_BODY).toContain("[@media(max-height:480px)]:overflow-visible");
    // Layar biasa tetap: isi bergulir sendiri, lembar setinggi layar < 768 px.
    expect(SHARE_DIALOG_BODY).toContain("overflow-y-auto");
    expect(SHARE_DIALOG_BOX).toContain("h-dvh");
  });
});

describe("Q-1: slicer 404 memakai penjaga muat ulang yang sama dengan widget", () => {
  const signal = new AbortController().signal;
  const body = { column: "Cabang", sheet: "Penjualan" };

  it("404 (akses dicabut) → status 404 = akses hilang", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { ok: false, code: "NOT_FOUND", message: "Dashboard tidak ditemukan." },
          { status: 404 },
        ),
      ),
    );
    const r = await fetchValues("d1", body, signal);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(isAccessLost(r)).toBe(true);
  });

  it("galat lain / jaringan / berhasil → bukan akses hilang", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, code: "BUSY" }, { status: 503 })),
    );
    expect(isAccessLost(await fetchValues("d1", body, signal))).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    const off = await fetchValues("d1", body, signal);
    expect(off).toMatchObject({ ok: false, status: 0 });
    expect(isAccessLost(off)).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, values: [], truncated: false })),
    );
    expect(isAccessLost(await fetchValues("d1", body, signal))).toBe(false);
  });

  it("query widget memakai aturan yang sama", () => {
    expect(isAccessLost({ ok: false, status: 404 })).toBe(true);
    expect(isAccessLost({ ok: false, status: 403 })).toBe(false);
    expect(isAccessLost({ ok: true })).toBe(false);
  });
});
