import type { FilterColumnView, WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";

/* Panggilan API kanvas dari browser (T-010). Semua mengembalikan hasil berbentuk tetap, tidak melempar. */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string; status: number };

async function call<T>(
  url: string,
  method: string,
  body?: unknown,
  init?: { keepalive?: boolean },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      { ok: true; data: T } | { ok: false; code?: string; message?: string } | null;
    if (json?.ok) return json;
    return {
      ok: false,
      status: res.status,
      code: json?.code ?? "UNAVAILABLE",
      // Pesan cadangan menyebut penyebab, bukan akibat: pemanggil sudah menulis "Belum tersimpan".
      message:
        res.status === 401
          ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
          : (json?.message ?? "Server sedang bermasalah. Coba lagi beberapa saat lagi."),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "OFFLINE",
      message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
    };
  }
}

const base = (dashboardId: string) => `/api/dashboards/${dashboardId}`;

export const api = {
  /** keepalive: terkirim walau halaman sedang ditutup (body ≤ 64 KB; 50 widget ≈ 3 KB). */
  saveLayout: (
    id: string,
    baseRevision: number,
    items: LayoutItem[],
    init?: { keepalive?: boolean },
  ) => call<{ layoutRevision: number }>(`${base(id)}/layout`, "PUT", { baseRevision, items }, init),
  addWidget: (
    id: string,
    baseRevision: number,
    restore?: { title: string; at: Omit<LayoutItem, "i">; type: string; spec: unknown },
  ) =>
    call<{
      widget: WidgetView;
      layout: LayoutItem[];
      layoutRevision: number;
      configDropped?: true;
    }>(`${base(id)}/widgets`, "POST", { baseRevision, ...restore }),
  deleteWidget: (id: string, widgetId: string, baseRevision: number) =>
    call<{ layout: LayoutItem[]; layoutRevision: number }>(
      `${base(id)}/widgets/${widgetId}?baseRevision=${baseRevision}`,
      "DELETE",
    ),
  /**
   * Ubah widget (judul / jenis + isi) membawa `version` pengaturan yang dilihat tab ini (T-016): server
   * menolak STALE bila widget sudah diubah di tempat lain; berhasil → versi baru untuk disimpan lokal.
   */
  renameWidget: (id: string, widgetId: string, title: string, version?: string) =>
    call<{ title: string; version: string }>(`${base(id)}/widgets/${widgetId}`, "PATCH", {
      title,
      version,
    }),
  /** Kolom filter global (T-012); hasil = tampilan kolom filter yang baru. */
  setFilterColumns: (id: string, filterColumns: { sheet: string; column: string }[]) =>
    call<{ filterColumns: FilterColumnView[] }>(`${base(id)}/filter-columns`, "PATCH", {
      filterColumns,
    }),
  configureWidget: (id: string, widgetId: string, type: string, spec: unknown, version?: string) =>
    call<{ type: string; spec: unknown; version: string }>(
      `${base(id)}/widgets/${widgetId}`,
      "PATCH",
      { type, spec, version },
    ),
};
