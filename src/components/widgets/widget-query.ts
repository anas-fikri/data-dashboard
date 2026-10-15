"use client";

import { useEffect, useState } from "react";
import type { DashFilter } from "@/components/dashboards/filters/filter-model";
import type { ValueType } from "@/features/widgets/format";
import { isAccessLost, useAccessLost } from "./access-refresh";

/*
 * Query widget dari browser (T-011). Mesin query mengantrekan query per user (antrean terbatas);
 * QUERY_BUSY berarti antrean penuh atau terlalu lama, jadi di sini paling banyak 2 query widget
 * berjalan sekaligus per halaman dan QUERY_BUSY dicoba ulang dua kali dengan jeda. Permintaan
 * dibatalkan saat widget berganti spec/halaman atau dilepas. HTTP 404 (akses dicabut, T-016) →
 * halaman dimuat ulang dari server sekali (access-refresh.tsx). Jawaban untuk non-pemilik tidak
 * memuat `cached`/`ms` (T-016): klien tidak bergantung pada keduanya. Jawaban berhasil membawa
 * `widgetVersion` (versi pengaturan yang dipakai server); WidgetBody tidak menampilkan data dari versi
 * yang tidak dikenal kartu (diubah di tab/perangkat lain — body-state.ts withChangeCheck). Jawaban gagal
 * untuk widget yang terotorisasi juga membawanya (review T-016 R2-CL-2): urutan/filter dari pengaturan
 * lama yang ditolak INVALID terbaca sebagai CHANGED + "Muat ulang", bukan galat yang berulang.
 */
export interface QueryColumn {
  key: string;
  label: string;
  type: ValueType;
}
export interface WidgetData {
  columns: QueryColumn[];
  rows: unknown[][];
  /** Grafik: jumlah kategori seluruhnya dan total ukuran seluruh kategori (sebelum batas N). */
  categories?: number;
  grandTotal?: number | null;
  /** Filter dashboard yang dilewati karena kolomnya tidak ada di sheet widget ini (T-012). */
  skippedFilters?: string[];
  /** Kolom yang dipakai widget dan kosong di versi data ini (kolom absent hasil pemetaan, T-014). */
  absent?: string[];
  /** Hanya tabel. */
  total?: number;
  page?: number;
  pageSize?: number;
  /** Versi pengaturan widget yang dibaca server untuk data ini (T-016); dibandingkan dengan kartu. */
  widgetVersion?: string;
}
/**
 * `filters`: filter dashboard (JSON) milik `data` — data lama dari filter lain tidak boleh tampil
 * seolah sudah tersaring (T-012).
 */
export type WidgetQueryState = { filters?: string } & (
  | { status: "loading"; data?: WidgetData }
  | { status: "ok"; data: WidgetData }
  | {
      status: "error";
      code: string;
      message: string;
      data?: WidgetData;
      /** Versi pengaturan widget dari jawaban gagal (bila server menyertakannya). */
      version?: string;
    }
);

const MAX_ACTIVE = 2;
const RETRIES = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function slot(signal: AbortSignal): Promise<() => void> {
  if (active >= MAX_ACTIVE) {
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal.removeEventListener("abort", stop);
        resolve();
      };
      const stop = () => {
        const i = waiting.indexOf(go);
        if (i >= 0) waiting.splice(i, 1);
        reject(signal.reason);
      };
      waiting.push(go);
      signal.addEventListener("abort", stop, { once: true });
    });
  }
  active++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active--;
    waiting.shift()?.();
  };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export interface WidgetRequest {
  widgetId: string;
  page?: number;
  sort?: { column: number; dir: "asc" | "desc" };
  /** Filter dashboard + filter silang (T-012); kolom lewat nama tampil. */
  dashboardFilters?: DashFilter[];
}

type WidgetResult =
  | { ok: true; data: WidgetData }
  | { ok: false; code: string; message: string; status: number; version?: string };

export async function fetchWidget(body: WidgetRequest, signal: AbortSignal): Promise<WidgetResult> {
  for (let attempt = 0; ; attempt++) {
    const release = await slot(signal);
    let res: Response;
    try {
      res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      release();
      if (signal.aborted) throw e;
      return {
        ok: false,
        code: "OFFLINE",
        message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
        status: 0,
      };
    }
    const json = (await res.json().catch(() => null)) as
      | ({ ok: true } & WidgetData)
      | { ok: false; code?: string; message?: string; widgetVersion?: unknown }
      | null;
    release();
    if (json?.ok) return { ok: true, data: json };
    const code = json?.code ?? "UNAVAILABLE";
    if (code === "QUERY_BUSY" && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt + Math.random() * 300, signal);
      continue;
    }
    return {
      ok: false,
      code,
      status: res.status,
      ...(typeof json?.widgetVersion === "string" ? { version: json.widgetVersion } : {}),
      message:
        res.status === 401
          ? "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi."
          : (json?.message ?? "Data widget belum bisa dimuat. Coba lagi beberapa saat lagi."),
    };
  }
}

/**
 * Data satu widget. `version` berubah setiap spec widget disimpan → query ulang. Data lama tetap
 * ditampilkan (redup) selama memuat halaman/urutan baru agar tabel tidak berkedip.
 */
export function useWidgetQuery(request: WidgetRequest | null, version: string) {
  const [state, setState] = useState<WidgetQueryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const accessLost = useAccessLost();
  const key = request ? JSON.stringify(request) : "";

  useEffect(() => {
    if (!key) return;
    // Request diturunkan dari key (string stabil), bukan objek baru tiap render.
    const req = JSON.parse(key) as WidgetRequest;
    const filters = JSON.stringify(req.dashboardFilters ?? []);
    const ctl = new AbortController();
    // Penanda memuat diset di callback async (bukan langsung di effect) — data lama tetap tampil.
    void Promise.resolve().then(() => {
      if (!ctl.signal.aborted) {
        setState((s) => ({ status: "loading", data: s.data, filters: s.filters }));
      }
    });
    fetchWidget(req, ctl.signal).then(
      (r) => {
        if (ctl.signal.aborted) return;
        // Akses dashboard dicabut (atau widgetnya dihapus di tempat lain): halaman dari server lagi.
        if (isAccessLost(r)) accessLost?.();
        setState((s) =>
          r.ok
            ? { status: "ok", data: r.data, filters }
            : {
                status: "error",
                code: r.code,
                message: r.message,
                data: s.data,
                filters: s.filters,
                version: r.version,
              },
        );
      },
      () => {},
    );
    return () => ctl.abort();
    // version (spec disimpan) dan attempt (tombol coba lagi) memicu query ulang; accessLost stabil.
  }, [key, version, attempt, accessLost]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
