"use client";

import { useEffect, useState } from "react";
import { isAccessLost, useAccessLost } from "@/components/widgets/access-refresh";
import type { FilterValue } from "./filter-model";

/*
 * Nilai unik satu kolom filter untuk slicer (T-012): POST /api/dashboards/:id/filter-values
 * { column, sheet, q? } (sheet: nama kolom yang sama bisa dipilih dari dua sheet). Server
 * mengembalikan maks. 1.000 nilai (+ truncated) dan menyaring sendiri — tidak peka besar/kecil dan
 * aksen. Ketikan ditunda 250 ms; permintaan lama dibatalkan (AbortController)
 * sehingga hanya jawaban kata kunci terakhir yang dipakai. Daftar lama tetap tampil selama memuat.
 * `full`: daftar lengkap terakhir (tanpa kata cari, tidak terpotong) — tetap diingat selama mencari,
 * agar kunci "minimal satu nilai" mode kecualikan juga berlaku pada hasil cari (slicer-model.ts).
 * HTTP 404 (akses dashboard dicabut, T-016) → halaman dimuat ulang dari server sekali, penjaga yang
 * sama dengan query widget (access-refresh.tsx).
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
  | { ok: true; values: FilterValue[]; truncated: boolean }
  | { ok: false; message: string; status: number; code?: string };

/**
 * Galat yang tidak pulih dengan mengulang permintaan yang sama: INVALID (kolom filter yang sudah
 * dihapus/disembunyikan pemilik dijawab "bukan kolom filter dashboard") dan sesi berakhir. Aksinya
 * "Muat ulang" halaman (kolom filter terbaru dari server), bukan "Coba lagi" (review T-016 R4-CC-1).
 */
export const needsReload = (r: { ok: boolean; status?: number; code?: string }) =>
  !r.ok && (r.code === "INVALID" || r.status === 401);

export async function fetchValues(
  dashboardId: string,
  body: { column: string; sheet: string; q?: string; months?: true },
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
    return {
      ok: false,
      status: 0,
      message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
    };
  }
  const json = (await res.json().catch(() => null)) as
    | { ok: true; values?: unknown; truncated?: unknown }
    | { ok: false; code?: string; message?: string }
    | null;
  if (json?.ok && Array.isArray(json.values)) {
    return { ok: true, values: json.values as FilterValue[], truncated: json.truncated === true };
  }
  return {
    ok: false,
    status: res.status,
    code: json && !json.ok && typeof json.code === "string" ? json.code : undefined,
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
  const accessLost = useAccessLost();
  const key = JSON.stringify([column, sheet, q, attempt]);
  const [res, setRes] = useState<{
    key: string;
    data: Loaded | null;
    error: string | null;
    /** Galat ini butuh muat ulang halaman, bukan coba lagi (needsReload). */
    reload: boolean;
    full: FilterValue[] | null;
  }>({ key: "", data: null, error: null, reload: false, full: null });

  useEffect(() => {
    const ctl = new AbortController();
    // Kata kunci kosong (dibuka / kolom cari dikosongkan) langsung; ketikan menunggu jeda.
    const t = setTimeout(
      () => {
        fetchValues(dashboardId, q ? { column, sheet, q } : { column, sheet }, ctl.signal).then(
          (r) => {
            if (ctl.signal.aborted) return;
            // Akses dashboard dicabut: halaman dari server lagi (sekali, bersama query widget).
            if (isAccessLost(r)) accessLost?.();
            setRes((prev) =>
              r.ok
                ? {
                    key,
                    data: { values: r.values, truncated: r.truncated, q },
                    error: null,
                    reload: false,
                    full: q ? prev.full : r.truncated ? null : r.values,
                  }
                : { ...prev, key, error: r.message, reload: needsReload(r) },
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
    // accessLost stabil (satu penjaga per pemasangan kanvas).
  }, [dashboardId, column, sheet, q, key, accessLost]);

  return {
    loading: res.key !== key,
    data: res.data,
    error: res.key === key ? res.error : null,
    reload: res.key === key && res.reload,
    full: res.full,
    retry: () => setAttempt((n) => n + 1),
  };
}

/**
 * Bulan yang ada di kolom tanggal filter (T-9gs1: pilihan "Pilih periode"): POST filter-values
 * { months: true } sekali per kolom; null = memuat, { error } = gagal (bagian periode disembunyikan,
 * preset dan rentang sendiri tetap bisa dipakai).
 */
export function usePeriodMonths(
  dashboardId: string,
  column: string,
  sheet: string,
): { months: string[] } | { error: string } | null {
  type Months = { months: string[] } | { error: string };
  // Jawaban dikunci per kolom: kolom lain → null (memuat) tanpa reset state di dalam effect.
  const key = `${dashboardId}\u0000${sheet}\u0000${column}`;
  const [state, setState] = useState<{ key: string; value: Months } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetchValues(dashboardId, { column, sheet, months: true }, ctl.signal).then(
      (r) =>
        !ctl.signal.aborted &&
        setState({
          key,
          value: r.ok
            ? { months: r.values.filter((v): v is string => typeof v === "string") }
            : { error: r.message },
        }),
      () => {},
    );
    return () => ctl.abort();
  }, [key, dashboardId, column, sheet]);
  return state?.key === key ? state.value : null;
}
