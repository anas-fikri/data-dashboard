/*
 * Data halaman /render (T-018, D3/D4), tanpa I/O langsung (dependensi diinjeksi; perakitan produksi di
 * render-data.ts). Urutan:
 *  1. sesi render dari cookie diambil SEKALI (GETDEL) — halaman tidak bisa dimuat ulang;
 *  2. user masih aktif + ekspor PDF yang ditunjuk masih RUNNING miliknya untuk dashboard itu;
 *  3. dashboard dibaca dengan peran SEKARANG (getDashboard: tanpa akses → null);
 *  4. status filter token disaring LAGI terhadap kolom filter dashboard sekarang (D9);
 *  5. semua widget di-query di SERVER lewat runWidgetQuery (resolver, D6, cache, dan bentuk jawaban per
 *     peran yang sama dengan /api/query; jam preset = waktu ekspor diminta), paling banyak 2 bersamaan,
 *     QUERY_BUSY (data parquet sedang diunduh — cache dingin, sheet kedua menunggu unduhan sheet
 *     pertama; slot penuh) dicoba ulang sampai batas tunggu BERSAMA satu render (T-rb6x). Batas itu
 *     juga membatasi tiap percobaan (waitMs = sisa waktu → lama menunggu unduhan), jadi lewat batas
 *     widget langsung menjadi kartu galat dan halaman siap jauh sebelum batas siap renderer
 *     (RENDER_READY_TIMEOUT_MS, bawaan 30 s). Browser renderer tidak memanggil /api apa pun.
 * Gagal di langkah 1–4 → null (halaman menjawab 404 polos). Galat satu widget = jawaban galat widget
 * itu (kartu galat di PDF), bukan kegagalan seluruh halaman.
 */
import { filtersFor, type PivotFilter } from "@/components/dashboards/filters/filter-model";
import type { LayoutItem } from "@/features/dashboards/validation";
import type { WidgetModeResult } from "@/features/query/service";
import { filterSummary, parsePdfFilter, sanitizePdfFilter, type FilterTarget } from "./pdf-filter";
import type { RenderClaims } from "./render-token";

/** Persis body JSON /api/query mode widget untuk widget itu (ok atau galat, sudah dibentuk per peran). */
export type WidgetQueryJson = WidgetModeResult;

export interface RenderWidget {
  id: string;
  type: string;
  title: string;
  spec: unknown;
  result: WidgetQueryJson;
}

export interface RenderData {
  dashboard: {
    id: string;
    name: string;
    datasetName: string;
    layout: LayoutItem[];
    /** Ringkasan filter yang berlaku ("Kolom: isi; …"), "Tanpa filter" bila tidak ada. */
    filterSummary: string;
    /** ISO; waktu ekspor diminta (juga jam preset tanggal). Ditampilkan WIB oleh halaman. */
    exportedAt: string;
  };
  widgets: RenderWidget[];
}

/** Bagian DashboardView yang dibutuhkan (getDashboard memenuhinya). */
export interface RenderDashboard extends FilterTarget {
  id: string;
  name: string;
  dataset: { name: string };
  layout: LayoutItem[];
}

export interface RenderSessionDeps {
  /** consumeRenderSessionClaims (GETDEL sesi). */
  consumeClaims(sessionId: string): Promise<RenderClaims | null>;
  /** User aktif + ekspor PDF masih RUNNING miliknya (repo.renderSubjectLive). */
  subjectLive(claims: RenderClaims): Promise<boolean>;
  /** getDashboard(userId, dashboardId): null = tanpa akses. */
  dashboard(userId: string, dashboardId: string): Promise<RenderDashboard | null>;
  /**
   * runWidgetQuery dengan jam `now`, hasil berbentuk JSON. `waitMs` = sisa batas tunggu render (≥ 0):
   * paling lama menunggu data disiapkan (unduhan parquet) di percobaan ini. Melempar = galat tak terduga.
   */
  query(userId: string, body: unknown, now: Date, waitMs: number): Promise<WidgetQueryJson>;
  sleep?(ms: number): Promise<void>;
  /** Jam (ms), bawaan Date.now; diinjeksi test bersama `sleep`. */
  clock?(): number;
  /** Batas tunggu bersama QUERY_BUSY per render (ms), bawaan BUSY_WAIT_MS. */
  busyWaitMs?: number;
}

/** Query widget bersamaan per render (sama dengan MAX_ACTIVE kartu di layar). */
export const RENDER_QUERY_PARALLEL = 2;
/**
 * Batas tunggu data per render (unduhan parquet + ulang QUERY_BUSY). Halaman /render dimuat di dalam
 * page.goto renderer, jadi harus jauh di bawah RENDER_READY_TIMEOUT_MS renderer (bawaan 30 s): sisanya
 * untuk tukar token, query yang sedang berjalan, dan sinyal siap halaman.
 */
export const BUSY_WAIT_MS = 15_000;
/** Jeda ulang QUERY_BUSY: 0,4 s berlipat, paling lama 2 s per jeda. */
const BUSY_BACKOFF_MAX_MS = 2_000;

/** Jawaban /api/query untuk galat tak terduga (500), dipakai bila query melempar. */
const QUERY_FAILED: WidgetQueryJson = {
  ok: false,
  code: "QUERY_FAILED",
  message: "Query gagal diproses. Coba lagi beberapa saat lagi.",
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Body query widget sama dengan kartu di layar (widgetRequest): tabel halaman 0, urutan bawaan. */
export function renderQueryBody(
  w: { id: string; type: string },
  filters: ReturnType<typeof filtersFor>,
  pivot: PivotFilter[] = [],
): Record<string, unknown> {
  const dash = filters.length ? { dashboardFilters: filters } : {};
  if (w.type === "table") return { widgetId: w.id, page: 0, ...dash };
  return w.type === "pivot" && pivot.length
    ? { widgetId: w.id, ...dash, pivotFilters: pivot }
    : { widgetId: w.id, ...dash };
}

async function queryWithRetry(
  deps: RenderSessionDeps,
  userId: string,
  body: unknown,
  now: Date,
  deadline: number,
): Promise<WidgetQueryJson> {
  const sleep = deps.sleep ?? defaultSleep;
  const clock = deps.clock ?? Date.now;
  for (let attempt = 0; ; attempt++) {
    let r: WidgetQueryJson;
    try {
      r = await deps.query(userId, body, now, Math.max(0, deadline - clock()));
    } catch {
      return QUERY_FAILED;
    }
    if (r.ok || r.code !== "QUERY_BUSY") return r;
    const wait = Math.min(400 * 2 ** attempt, BUSY_BACKOFF_MAX_MS);
    // Batas bersama: unduhan yang tak kunjung selesai tidak menahan render (kartu galat, bukan hang).
    if (clock() + wait > deadline) return r;
    await sleep(wait);
  }
}

/** map dengan paling banyak `limit` pekerjaan bersamaan; urutan hasil = urutan masukan. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

export async function loadRenderSession(
  sessionId: unknown,
  deps: RenderSessionDeps,
): Promise<RenderData | null> {
  if (typeof sessionId !== "string" || !sessionId) return null;
  const claims = await deps.consumeClaims(sessionId);
  if (!claims) return null;
  if (!(await deps.subjectLive(claims))) return null;
  const d = await deps.dashboard(claims.userId, claims.dashboardId);
  if (!d || d.id !== claims.dashboardId) return null;
  const parsed = parsePdfFilter(claims.f);
  if (!parsed) return null;
  const state = sanitizePdfFilter(parsed, d);
  const now = new Date(claims.requestedAt);
  const deadline = (deps.clock ?? Date.now)() + (deps.busyWaitMs ?? BUSY_WAIT_MS);
  const results = await mapLimit(d.widgets, RENDER_QUERY_PARALLEL, (w) =>
    queryWithRetry(
      deps,
      claims.userId,
      renderQueryBody(w, filtersFor(state, w.id), state.pivot?.[w.id]),
      now,
      deadline,
    ),
  );
  return {
    dashboard: {
      id: d.id,
      name: d.name,
      datasetName: d.dataset.name,
      layout: d.layout,
      filterSummary: filterSummary(state, d),
      exportedAt: now.toISOString(),
    },
    widgets: d.widgets.map((w, i) => ({
      id: w.id,
      type: w.type,
      title: w.title,
      spec: w.spec,
      result: results[i]!,
    })),
  };
}
