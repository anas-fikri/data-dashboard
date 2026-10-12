import type { WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";

/* Panggilan API kanvas dari browser (T-010). Semua mengembalikan hasil berbentuk tetap, tidak melempar. */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string; status: number };

async function call<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
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
      message:
        res.status === 401
          ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
          : (json?.message ?? "Perubahan belum tersimpan. Coba lagi beberapa saat lagi."),
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
  saveLayout: (id: string, baseRevision: number, items: LayoutItem[]) =>
    call<{ layoutRevision: number }>(`${base(id)}/layout`, "PUT", { baseRevision, items }),
  addWidget: (id: string, restore?: { title: string; at: Omit<LayoutItem, "i"> }) =>
    call<{ widget: WidgetView; item: LayoutItem; layoutRevision: number }>(
      `${base(id)}/widgets`,
      "POST",
      restore ?? {},
    ),
  deleteWidget: (id: string, widgetId: string) =>
    call<{ layoutRevision: number }>(`${base(id)}/widgets/${widgetId}`, "DELETE"),
  renameWidget: (id: string, widgetId: string, title: string) =>
    call<{ title: string }>(`${base(id)}/widgets/${widgetId}`, "PATCH", { title }),
};
