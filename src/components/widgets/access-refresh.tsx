"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/*
 * Akses dicabut di tengah sesi (T-016): query widget atau nilai slicer (/filter-values) menjawab 404 →
 * halaman diambil ulang dari server (router.refresh) sehingga menjadi 404 / mode lihat sesuai akses
 * terbaru. Paling banyak SEKALI per keadaan halaman, bersama untuk semua widget dan slicer (8 widget
 * yang gagal bersamaan = satu refresh) — tanpa loop.
 * Kanvas tidak dipasang ulang setelah refresh (mode edit, review T-016 R3-CL-1; mode lihat sejak
 * R5-CL-2): penjaga dipasang lagi bila refresh membawa props server yang berbeda (daftar widget, versi,
 * atau revisi tata letak), dan 404 dari widget yang sudah tidak ada di props server diabaikan — refresh
 * berikutnya tetap tersedia untuk akses yang dicabut kemudian. Widget yang ditambahkan sesi ini (belum
 * pernah di props server) mendapat satu refresh sendiri per id dan tidak memakai jatah bersama
 * (R5-CL-1): refresh-nya membawa props yang sama, jadi jatah bersama tidak akan dipasang lagi.
 */

/** Jawaban gagal yang berarti akses dashboard hilang: HTTP 404 (query widget dan nilai slicer). */
export const isAccessLost = (r: { ok: boolean; status?: number }) => !r.ok && r.status === 404;

export function createAccessGuard(
  refresh: () => void,
  serverIds: readonly string[] = [],
  stateKey = "",
) {
  let done = false;
  let current = new Set(serverIds);
  let state = stateKey;
  /** Semua id yang pernah ada di props server; yang kini hilang = sudah dihapus di server. */
  const seen = new Set(serverIds);
  /** Widget sesi ini yang sudah memakai satu refresh-nya sendiri. */
  const tried = new Set<string>();
  return {
    /**
     * Props server terbaru: id widget + kunci keadaan halaman (versi widget, revisi tata letak). Berubah
     * = refresh membawa halaman baru → penjaga dipasang lagi.
     */
    sync(ids: readonly string[], key = "") {
      const same = ids.length === current.size && ids.every((id) => current.has(id));
      if (same && key === state) return;
      for (const id of ids) seen.add(id);
      current = new Set(ids);
      state = key;
      done = false;
    },
    /**
     * 404 dari query widget (dengan id) atau slicer (tanpa id) → true bila refresh dikirim. Widget yang
     * dihapus di server tidak memakai jatah; widget yang ditambahkan sesi ini (belum pernah di props
     * server) mendapat satu refresh sendiri — bila aksesnya memang dicabut, refresh itu sudah membuat
     * halaman 404; bila hanya widgetnya yang dihapus di tempat lain, jatah bersama tetap utuh.
     */
    lost(widgetId?: string) {
      if (widgetId && !current.has(widgetId)) {
        if (seen.has(widgetId) || tried.has(widgetId)) return false;
        tried.add(widgetId);
        refresh();
        return true;
      }
      if (done) return false;
      done = true;
      refresh();
      return true;
    },
  };
}

const AccessLost = createContext<((widgetId?: string) => boolean) | null>(null);

export function AccessRefreshProvider({
  serverWidgetIds,
  stateKey = "",
  children,
}: {
  /** id widget dari props server (bukan state editor lokal). */
  serverWidgetIds: readonly string[];
  /** Kunci keadaan halaman dari props server (versi widget + revisi tata letak). */
  stateKey?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  // Satu penjaga per pemasangan; router dari useRouter stabil selama halaman terbuka. Nilai konteks
  // (guard.lost) stabil → effect query widget / slicer tidak berjalan ulang karenanya.
  const [guard] = useState(() =>
    createAccessGuard(() => router.refresh(), serverWidgetIds, stateKey),
  );
  const sig = JSON.stringify(serverWidgetIds);
  useEffect(() => guard.sync(JSON.parse(sig) as string[], stateKey), [guard, sig, stateKey]);
  return <AccessLost.Provider value={guard.lost}>{children}</AccessLost.Provider>;
}

/**
 * Dipanggil saat query widget / nilai slicer menjawab 404 (query widget memberi id widgetnya); null di
 * luar kanvas dashboard (tidak ada yang dimuat ulang).
 */
export const useAccessLost = () => useContext(AccessLost);
