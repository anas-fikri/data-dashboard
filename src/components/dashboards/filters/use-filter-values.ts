"use client";

import { useEffect, useState } from "react";
import type { FilterValue } from "./filter-model";

/*
 * Nilai unik satu kolom filter untuk slicer (T-012): POST /api/dashboards/:id/filter-values
 * { column, sheet, q? } (sheet: nama kolom yang sama bisa dipilih dari dua sheet). Server
 * mengembalikan maks. 1.000 nilai (+ truncated) dan menyaring sendiri — tidak peka besar/kecil dan
 * aksen. Ketikan ditunda 250 ms; permintaan lama dibatalkan (AbortController)
 * sehingga hanya jawaban kata kunci terakhir yang dipakai. Daftar lama tetap tampil selama memuat.
 * `full`: daftar lengkap terakhir (tanpa kata cari, tidak terpotong) — tetap diingat selama mencari,
 * agar kunci "minimal satu nilai" mode kecualikan juga berlaku pada hasil cari (slicer-model.ts).
 */
const DEBOUNCE_MS = 250;
export const VALUES_MAX = 1000;

interface Loaded {
  values: FilterValue[];
  truncated: boolean;
  /** Kata kunci milik daftar ini. */
  q: string;
}
type Result =
  { ok: true; values: FilterValue[]; truncated: boolean } | { ok: false; message: string };

async function fetchValues(
  dashboardId: string,
  body: { column: string; sheet: string; q?: string },
  signal: AbortSignal,
): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(`/api/dashboards/${dashboardId}/filter-values`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    return { ok: false, message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi." };
  }
  const json = (await res.json().catch(() => null)) as
    { ok: true; values?: unknown; truncated?: unknown } | { ok: false; message?: string } | null;
  if (json?.ok && Array.isArray(json.values)) {
    return { ok: true, values: json.values as FilterValue[], truncated: json.truncated === true };
  }
  return {
    ok: false,
    message:
      res.status === 401
        ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
        : ((json && !json.ok ? json.message : undefined) ??
          "Nilai filter belum bisa dimuat. Coba lagi beberapa saat lagi."),
  };
}

export function useFilterValues(
  dashboardId: string,
  { column, sheet }: { column: string; sheet: string },
  query: string,
) {
  const q = query.trim();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([column, sheet, q, attempt]);
  const [res, setRes] = useState<{
    key: string;
    data: Loaded | null;
    error: string | null;
    full: FilterValue[] | null;
  }>({ key: "", data: null, error: null, full: null });

  useEffect(() => {
    const ctl = new AbortController();
    // Kata kunci kosong (dibuka / kolom cari dikosongkan) langsung; ketikan menunggu jeda.
    const t = setTimeout(
      () => {
        fetchValues(dashboardId, q ? { column, sheet, q } : { column, sheet }, ctl.signal).then(
          (r) => {
            if (ctl.signal.aborted) return;
            setRes((prev) =>
              r.ok
                ? {
                    key,
                    data: { values: r.values, truncated: r.truncated, q },
                    error: null,
                    full: q ? prev.full : r.truncated ? null : r.values,
                  }
                : { ...prev, key, error: r.message },
            );
          },
          () => {},
        );
      },
      q ? DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [dashboardId, column, sheet, q, key]);

  return {
    loading: res.key !== key,
    data: res.data,
    error: res.key === key ? res.error : null,
    full: res.full,
    retry: () => setAttempt((n) => n + 1),
  };
}
