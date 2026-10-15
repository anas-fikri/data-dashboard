"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

/*
 * Akses dicabut di tengah sesi (T-016): query widget menjawab 404 → halaman diambil ulang dari server
 * (router.refresh) sehingga menjadi 404 / mode lihat sesuai akses terbaru. Paling banyak SEKALI per
 * pemasangan kanvas, bersama untuk semua widget (8 widget yang gagal bersamaan = satu refresh); 404
 * berikutnya (mis. widget yang memang sudah dihapus) tidak memicu refresh lagi — tanpa loop.
 */
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

/** Dipanggil saat query widget menjawab 404; null di luar kanvas dashboard (tidak ada yang dimuat ulang). */
export const useAccessLost = () => useContext(AccessLost);
