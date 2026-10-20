/*
 * Ambil satu blok baris dari POST /api/sheets/:id/rows (T-041) untuk grid "Lihat data" (T-043).
 * Kolom > 64 dipecah per potongan lalu digabung per baris; semua potongan wajib dari versi dan revisi
 * skema yang sama dengan halaman — kalau tidak, blok ditolak (baris dua versi tidak pernah tercampur,
 * AC 4). AbortSignal diteruskan ke fetch agar blok yang sudah digulir lewat bisa dibatalkan.
 * T-044: urut/saring/cari ikut dikirim di setiap potongan; semua permintaan grid halaman ini (blok +
 * daftar nilai menu saring) lewat satu jatah klien GRID_CLIENT_SLOTS = jatah in-flight per pengguna
 * di server (2), jadi menu saring yang dibuka saat dua blok dimuat menunggu, bukan kena 429.
 */
import { chunkCols, colIdOf, type GridQuery } from "./grid-model";

/** Permintaan grid bersamaan dari satu halaman (server: 2 in-flight per pengguna, T-042). */
export const GRID_CLIENT_SLOTS = 2;

const abortError = () => new DOMException("Dibatalkan", "AbortError");

/** Semafor kecil dengan dukungan AbortSignal: antrean yang dibatalkan tidak memakan slot. */
export class Slots {
  private busy = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}

  get active() {
    return this.busy;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.busy--;
      this.waiting.shift()?.();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.busy < this.max) {
      this.busy++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener("abort", stop);
        this.busy++;
        resolve();
      };
      const stop = () => {
        const i = this.waiting.indexOf(go);
        if (i >= 0) this.waiting.splice(i, 1);
        reject(abortError());
      };
      this.waiting.push(go);
      signal?.addEventListener("abort", stop, { once: true });
    });
  }
}

/** Jatah bersama semua permintaan grid di halaman (satu grid per halaman). */
export const gridSlots = new Slots(GRID_CLIENT_SLOTS);

export interface BlockRequest {
  sheetId: string;
  versionId: string;
  schemaRevision: number;
  rowStart: number;
  rowCount: number;
  /** Posisi kolom yang diminta (tanpa kolom yang disembunyikan pengguna). */
  cols: number[];
  /** Urut/saring/cari aktif (T-044); kosong = jalur tanpa urut. */
  query?: GridQuery;
  signal?: AbortSignal;
}

/** Satu baris data grid: n (nomor tampil 1-based), c<pos> = nilai, cut = colId yang teksnya dipotong. */
export interface RowData {
  n: number;
  _row: number;
  cut?: string[];
  /** Baris sentinel "Akhir data" (ADR-0007 mitigasi 2). */
  end?: true;
  [colId: string]: unknown;
}

export type BlockResult =
  /** total = baris sheet; filteredTotal = baris yang lolos saring/cari (= total bila tanpa saringan). */
  | { ok: true; total: number; filteredTotal: number; rows: RowData[] }
  | { ok: false; kind: "version"; activeVersionId?: string | null }
  | { ok: false; kind: "aborted" }
  /** Slot query grid per pengguna/global penuh (429 QUERY_BUSY) setelah coba ulang: muat lagi nanti. */
  | { ok: false; kind: "busy" }
  /** Urut/saring/cari melewati batas waktu server (504 QUERY_TIMEOUT, T-044 AC4). */
  | { ok: false; kind: "timeout"; message: string }
  | { ok: false; kind: "error"; message: string; status: number };

interface RowsResponse {
  ok: true;
  versionId: string;
  schemaRevision: number;
  total: number;
  filteredTotal: number;
  rows: { n: number; _row: number; cells: unknown[]; cut: number[] }[];
}

const GENERIC = "Baris gagal dimuat. Coba lagi.";

/** Bagian body urut/saring/cari: hanya field yang terisi (jalur 1 tetap dipakai bila kosong). */
export function queryBody(q: GridQuery | undefined): Record<string, unknown> {
  if (!q) return {};
  return {
    ...(q.sort.length ? { sort: q.sort } : {}),
    ...(q.filters.length ? { filters: q.filters } : {}),
    ...(q.search ? { search: q.search } : {}),
  };
}

type Fetched = { ok: true; res: Response; body: unknown } | { ok: false; aborted: boolean };

/** fetch + baca JSON di dalam jatah klien (slot dilepas setelah jawaban selesai dibaca). */
export async function slotFetch(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
  slots: Slots = gridSlots,
): Promise<Fetched> {
  const signal = init.signal ?? undefined;
  try {
    return await slots.run(async () => {
      const res = await fetcher(url, init);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        if (signal?.aborted) throw abortError();
      }
      return { ok: true as const, res, body };
    }, signal);
  } catch {
    return { ok: false, aborted: Boolean(signal?.aborted) };
  }
}

async function fetchChunk(
  req: BlockRequest,
  cols: number[],
  fetcher: typeof fetch,
): Promise<{ ok: true; body: RowsResponse } | Exclude<BlockResult, { ok: true }>> {
  const got = await slotFetch(
    `/api/sheets/${encodeURIComponent(req.sheetId)}/rows`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: req.versionId,
        rowStart: req.rowStart,
        rowCount: req.rowCount,
        cols,
        ...queryBody(req.query),
      }),
      signal: req.signal,
      cache: "no-store",
    },
    fetcher,
  );
  if (!got.ok) {
    if (got.aborted) return { ok: false, kind: "aborted" };
    return { ok: false, kind: "error", message: "Koneksi terputus. Coba lagi.", status: 0 };
  }
  const { res, body } = got;
  const b = (body ?? {}) as Record<string, unknown>;
  if (res.status === 409 && b.code === "VERSION_CHANGED") {
    return {
      ok: false,
      kind: "version",
      activeVersionId: typeof b.activeVersionId === "string" ? b.activeVersionId : null,
    };
  }
  if (res.status === 429 && b.code === "QUERY_BUSY") return { ok: false, kind: "busy" };
  if (b.code === "QUERY_TIMEOUT") {
    const message = typeof b.message === "string" && b.message ? b.message : GENERIC;
    return { ok: false, kind: "timeout", message };
  }
  if (!res.ok || b.ok !== true) {
    const message = typeof b.message === "string" && b.message ? b.message : GENERIC;
    return { ok: false, kind: "error", message, status: res.status };
  }
  const r = b as unknown as RowsResponse;
  // Versi/revisi lain dari yang dimuat halaman: skema (kolom, tipe) bisa sudah berubah → muat ulang.
  if (r.versionId !== req.versionId || r.schemaRevision !== req.schemaRevision) {
    return { ok: false, kind: "version", activeVersionId: r.versionId };
  }
  return { ok: true, body: r };
}

/** Jeda coba ulang saat QUERY_BUSY (slot permintaan yang baru dibatalkan bisa belum dilepas server). */
export const BUSY_BACKOFF_MS = [150, 400, 900];

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

async function fetchChunkRetry(
  req: BlockRequest,
  cols: number[],
  fetcher: typeof fetch,
  backoff: readonly number[],
) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetchChunk(req, cols, fetcher);
    if (r.ok || r.kind !== "busy" || attempt >= backoff.length) return r;
    await sleep(backoff[attempt]!, req.signal);
    if (req.signal?.aborted) return { ok: false as const, kind: "aborted" as const };
  }
}

/**
 * Potongan kolom diambil BERURUTAN, bukan paralel: server membatasi 2 permintaan grid in-flight per
 * pengguna (T-042) dan grid sendiri memuat ≤ 2 blok bersamaan, jadi satu blok tidak boleh memakai lebih
 * dari satu slot — kalau tidak, sheet > 64 kolom selalu kena 429 QUERY_BUSY (review T-043 H1).
 */
export async function fetchBlock(
  req: BlockRequest,
  fetcher: typeof fetch = fetch,
  backoff: readonly number[] = BUSY_BACKOFF_MS,
): Promise<BlockResult> {
  const chunks = req.cols.length > 0 ? chunkCols(req.cols) : [[]];
  const parts: { ok: true; body: RowsResponse }[] = [];
  for (const c of chunks) {
    const p = await fetchChunkRetry(req, c, fetcher, backoff);
    if (!p.ok) return p;
    parts.push(p);
  }
  const bodies = parts.map((p) => (p as { ok: true; body: RowsResponse }).body);
  const first = bodies[0]!;
  // Potongan harus menunjuk baris yang sama (urutan tanpa urut/saring deterministik per `_row`).
  for (const b of bodies) {
    if (
      b.total !== first.total ||
      b.filteredTotal !== first.filteredTotal ||
      b.rows.length !== first.rows.length
    ) {
      return { ok: false, kind: "error", message: GENERIC, status: 0 };
    }
  }
  const rows: RowData[] = first.rows.map((r, i) => {
    const out: RowData = { n: r.n, _row: r._row };
    const cut: string[] = [];
    chunks.forEach((cols, k) => {
      const src = bodies[k]!.rows[i]!;
      cols.forEach((pos, j) => {
        out[colIdOf(pos)] = src.cells[j] ?? null;
      });
      for (const j of src.cut) if (cols[j] !== undefined) cut.push(colIdOf(cols[j]));
    });
    if (cut.length) out.cut = cut;
    return out;
  });
  for (const b of bodies) {
    for (const [i, r] of b.rows.entries()) {
      if (r._row !== rows[i]!._row)
        return { ok: false, kind: "error", message: GENERIC, status: 0 };
    }
  }
  return { ok: true, total: first.total, filteredTotal: first.filteredTotal, rows };
}

/* ---------- T-045: isi sel dan ringkasan kolom (lewat jatah klien yang sama) ---------- */

export interface CellInfo {
  value: unknown;
  raw: string | null;
  castFailed: boolean;
  source: { fileName: string | null; srcRow: number; period: string | null };
}

export interface ColumnStats {
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

/** Gagal: pesan siap tampil; `reload` = versi berganti/sesi habis (mengulang tidak menolong). */
export type Fetch<T> = { ok: true; data: T } | { ok: false; message: string; reload: boolean };

async function gridJson<T>(
  url: string,
  init: RequestInit,
  pick: (b: Record<string, unknown>) => T | null,
  fallback: string,
  fetcher: typeof fetch,
): Promise<Fetch<T> | null> {
  const got = await slotFetch(url, { ...init, cache: "no-store" }, fetcher);
  if (!got.ok) {
    return got.aborted
      ? null
      : { ok: false, message: "Tidak bisa menghubungi server. Coba lagi.", reload: false };
  }
  const b = (got.body ?? {}) as Record<string, unknown>;
  const data = b.ok === true ? pick(b) : null;
  if (data) return { ok: true, data };
  const status = got.res.status;
  return {
    ok: false,
    reload: status === 401 || b.code === "VERSION_CHANGED",
    message:
      status === 401
        ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
        : b.code === "VERSION_CHANGED"
          ? "Data sudah diperbarui. Muat ulang untuk melihat versi terbaru."
          : typeof b.message === "string" && b.message
            ? b.message
            : fallback,
  };
}

/** GET /api/sheets/:id/cell — `row` = `_row` (identitas baris). null = dibatalkan. */
export function fetchCell(
  sheetId: string,
  q: { versionId: string; row: number; pos: number },
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Fetch<CellInfo> | null> {
  const qs = new URLSearchParams({
    versionId: q.versionId,
    row: String(q.row),
    pos: String(q.pos),
  });
  return gridJson(
    `/api/sheets/${encodeURIComponent(sheetId)}/cell?${qs}`,
    { signal },
    (b) => (b.versionId === q.versionId && b.source ? (b as unknown as CellInfo) : null),
    "Isi sel gagal dimuat. Coba lagi.",
    fetcher,
  );
}

/** POST /api/sheets/:id/stats — ringkasan kolom angka di bawah saringan/cari tampilan. */
export function fetchStats(
  sheetId: string,
  body: { versionId: string; pos: number; query?: GridQuery },
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Fetch<ColumnStats> | null> {
  const { sort: _s, ...rest } = queryBody(body.query);
  return gridJson(
    `/api/sheets/${encodeURIComponent(sheetId)}/stats`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: body.versionId, pos: body.pos, ...rest }),
      signal,
    },
    (b) => (b.versionId === body.versionId ? (b as unknown as ColumnStats) : null),
    "Ringkasan kolom gagal dihitung.",
    fetcher,
  );
}
