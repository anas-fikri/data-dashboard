"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

/*
 * Akses dicabut di tengah sesi (T-016): query widget atau nilai slicer (/filter-values) menjawab 404 →
 * halaman diambil ulang dari server (router.refresh) sehingga menjadi 404 / mode lihat sesuai akses
 * terbaru. Paling banyak SEKALI per pemasangan kanvas, bersama untuk semua widget dan slicer (8 widget
 * yang gagal bersamaan = satu refresh); 404 berikutnya (mis. widget yang memang sudah dihapus) tidak
 * memicu refresh lagi — tanpa loop.
 */

/** Jawaban gagal yang berarti akses dashboard hilang: HTTP 404 (query widget dan nilai slicer). */
export const isAccessLost = (r: { ok: boolean; status?: number }) => !r.ok && r.status === 404;
export function createRefreshOnce(refresh: () => void) {
  let done = false;
  return () => {
    if (done) return false;
    done = true;
    refresh();
    return true;
  };
}

const AccessLost = createContext<(() => void) | null>(null);

export function AccessRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Satu penjaga per pemasangan; router dari useRouter stabil selama halaman terbuka.
  const [refreshOnce] = useState(() => createRefreshOnce(() => router.refresh()));
  return <AccessLost.Provider value={refreshOnce}>{children}</AccessLost.Provider>;
}

/**
 * Dipanggil saat query widget / nilai slicer menjawab 404; null di luar kanvas dashboard (tidak ada
 * yang dimuat ulang).
 */
export const useAccessLost = () => useContext(AccessLost);
