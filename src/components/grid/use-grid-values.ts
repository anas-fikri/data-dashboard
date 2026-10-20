"use client";

import { useEffect, useState } from "react";
import type { SlicerValues } from "@/components/dashboards/filters/slicer-panel";
import type { FilterValue } from "@/components/dashboards/filters/filter-model";
import { slotFetch } from "./grid-fetch";

/*
 * Daftar nilai satu kolom untuk menu saring "Lihat data" (T-044): POST /api/sheets/:id/values
 * { versionId, pos, q? } → ≤ 1.000 nilai + truncated (server mencari tanpa peka besar/kecil dan
 * aksen). Ketikan ditunda 250 ms, permintaan lama dibatalkan; lewat jatah klien grid yang sama
 * dengan blok baris (gridSlots) agar tidak melewati 2 in-flight per pengguna di server.
 * Bentuk hasil = SlicerValues (isi slicer dashboard dipakai ulang).
 */
const DEBOUNCE_MS = 250;

type Result =
  | { ok: true; values: FilterValue[]; truncated: boolean }
  | { ok: false; message: string; reload: boolean };

export async function fetchGridValues(
  sheetId: string,
  body: { versionId: string; pos: number; q?: string },
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Result | null> {
  const got = await slotFetch(
    `/api/sheets/${encodeURIComponent(sheetId)}/values`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    },
    fetcher,
  );
  if (!got.ok) {
    return got.aborted
      ? null
      : { ok: false, message: "Tidak bisa menghubungi server. Coba lagi.", reload: false };
  }
  const b = (got.body ?? {}) as Record<string, unknown>;
  if (b.ok === true && Array.isArray(b.values)) {
    return { ok: true, values: b.values as FilterValue[], truncated: b.truncated === true };
  }
  const status = got.res.status;
  // Versi berganti atau sesi berakhir: mengulang permintaan yang sama tidak menolong.
  const reload = status === 401 || b.code === "VERSION_CHANGED";
  return {
    ok: false,
    reload,
    message:
      status === 401
        ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
        : typeof b.message === "string" && b.message
          ? b.message
          : "Nilai kolom belum bisa dimuat. Coba lagi.",
  };
}

export function useGridValues(
  sheetId: string,
  versionId: string,
  pos: number,
  query: string,
): SlicerValues {
  const q = query.trim();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([sheetId, versionId, pos, q, attempt]);
  const [res, setRes] = useState<{
    key: string;
    data: SlicerValues["data"];
    error: string | null;
    reload: boolean;
    full: FilterValue[] | null;
  }>({ key: "", data: null, error: null, reload: false, full: null });

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(
      () => {
        void fetchGridValues(
          sheetId,
          q ? { versionId, pos, q } : { versionId, pos },
          ctl.signal,
        ).then((r) => {
          if (!r || ctl.signal.aborted) return;
          setRes((prev) =>
            r.ok
              ? {
                  key,
                  data: { values: r.values, truncated: r.truncated, q },
                  error: null,
                  reload: false,
                  full: q ? prev.full : r.truncated ? null : r.values,
                }
              : { ...prev, key, error: r.message, reload: r.reload },
          );
        });
      },
      q ? DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [sheetId, versionId, pos, q, key]);

  return {
    loading: res.key !== key,
    data: res.data,
    error: res.key === key ? res.error : null,
    reload: res.key === key && res.reload,
    full: res.full,
    retry: () => setAttempt((n) => n + 1),
  };
}
