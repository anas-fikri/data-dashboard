"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/*
 * Akses dicabut di tengah sesi (T-016): query widget atau nilai slicer (/filter-values) menjawab 404 →
 * halaman diambil ulang dari server (router.refresh) sehingga menjadi 404 / mode lihat sesuai akses
 * terbaru. Paling banyak SEKALI per keadaan halaman, bersama untuk semua widget dan slicer (8 widget
 * yang gagal bersamaan = satu refresh) — tanpa loop.
 * Mode edit tidak dipasang ulang setelah refresh (review T-016 R3-CL-1): penjaga dipasang lagi bila
 * refresh membawa daftar widget server yang berbeda (mis. widget dihapus di tempat lain), dan 404 dari
 * widget yang sudah tidak ada di props server diabaikan — refresh berikutnya tetap tersedia untuk
 * akses yang dicabut kemudian.
 */

/** Jawaban gagal yang berarti akses dashboard hilang: HTTP 404 (query widget dan nilai slicer). */
export const isAccessLost = (r: { ok: boolean; status?: number }) => !r.ok && r.status === 404;

export function createAccessGuard(refresh: () => void, serverIds: readonly string[] = []) {
  let done = false;
  let current = new Set(serverIds);
  /** Semua id yang pernah ada di props server; yang kini hilang = sudah dihapus di server. */
  const seen = new Set(serverIds);
  return {
    /** Props server terbaru. Daftar berubah = refresh membawa halaman baru → penjaga dipasang lagi. */
    sync(ids: readonly string[]) {
      if (ids.length === current.size && ids.every((id) => current.has(id))) return;
      for (const id of ids) seen.add(id);
      current = new Set(ids);
      done = false;
    },
    /**
     * 404 dari query widget (dengan id) atau slicer (tanpa id) → true bila refresh dikirim. Widget yang
     * dihapus di server tidak memakai jatah; widget yang ditambahkan sesi ini (belum pernah di props
     * server) tetap dihitung.
     */
    lost(widgetId?: string) {
      if (widgetId && seen.has(widgetId) && !current.has(widgetId)) return false;
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
  children,
}: {
  /** id widget dari props server (bukan state editor lokal). */
  serverWidgetIds: readonly string[];
  children: ReactNode;
}) {
  const router = useRouter();
  // Satu penjaga per pemasangan; router dari useRouter stabil selama halaman terbuka. Nilai konteks
  // (guard.lost) stabil → effect query widget / slicer tidak berjalan ulang karenanya.
  const [guard] = useState(() => createAccessGuard(() => router.refresh(), serverWidgetIds));
  const sig = JSON.stringify(serverWidgetIds);
  useEffect(() => guard.sync(JSON.parse(sig) as string[]), [guard, sig]);
  return <AccessLost.Provider value={guard.lost}>{children}</AccessLost.Provider>;
}

/**
 * Dipanggil saat query widget / nilai slicer menjawab 404 (query widget memberi id widgetnya); null di
 * luar kanvas dashboard (tidak ada yang dimuat ulang).
 */
export const useAccessLost = () => useContext(AccessLost);
