/*
 * Ambil satu blok baris dari POST /api/sheets/:id/rows (T-041) untuk grid "Lihat data" (T-043).
 * Kolom > 64 dipecah per potongan lalu digabung per baris; semua potongan wajib dari versi dan revisi
 * skema yang sama dengan halaman — kalau tidak, blok ditolak (baris dua versi tidak pernah tercampur,
 * AC 4). AbortSignal diteruskan ke fetch agar blok yang sudah digulir lewat bisa dibatalkan.
 */
import { chunkCols, colIdOf } from "./grid-model";

export interface BlockRequest {
  sheetId: string;
  versionId: string;
  schemaRevision: number;
  rowStart: number;
  rowCount: number;
  /** Posisi kolom yang diminta (tanpa kolom yang disembunyikan pengguna). */
  cols: number[];
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
  | { ok: true; total: number; rows: RowData[] }
  | { ok: false; kind: "version"; activeVersionId?: string | null }
  | { ok: false; kind: "aborted" }
  /** Slot query grid per pengguna/global penuh (429 QUERY_BUSY) setelah coba ulang: muat lagi nanti. */
  | { ok: false; kind: "busy" }
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

async function fetchChunk(
  req: BlockRequest,
  cols: number[],
  fetcher: typeof fetch,
): Promise<{ ok: true; body: RowsResponse } | Exclude<BlockResult, { ok: true }>> {
  let res: Response;
  try {
    res = await fetcher(`/api/sheets/${encodeURIComponent(req.sheetId)}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: req.versionId,
        rowStart: req.rowStart,
        rowCount: req.rowCount,
        cols,
      }),
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    if (req.signal?.aborted) return { ok: false, kind: "aborted" };
    return { ok: false, kind: "error", message: "Koneksi terputus. Coba lagi.", status: 0 };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (req.signal?.aborted) return { ok: false, kind: "aborted" };
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (res.status === 409 && b.code === "VERSION_CHANGED") {
    return {
      ok: false,
      kind: "version",
      activeVersionId: typeof b.activeVersionId === "string" ? b.activeVersionId : null,
    };
  }
  if (res.status === 429 && b.code === "QUERY_BUSY") return { ok: false, kind: "busy" };
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
    if (b.total !== first.total || b.rows.length !== first.rows.length) {
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
  return { ok: true, total: first.total, rows };
}
