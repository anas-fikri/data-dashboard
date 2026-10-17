"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Baris tab tautan yang bergulir horizontal (T-exfc): saat tampil, tab aria-current="page" digulir ke
 * tengah bila terpotong — 5 tab peran di 320 px, tab Admin/Umum tidak lagi tersembunyi di kanan. Hanya
 * scrollLeft nav yang diubah (halaman tidak ikut bergulir).
 */
export function TabStrip({
  label,
  active,
  children,
}: {
  label: string;
  /** Kunci tab aktif; berubah = periksa ulang (navigasi lunak antar-tab). */
  active: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !tab) return;
    const n = nav.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left >= n.left && t.right <= n.right) return;
    nav.scrollLeft += t.left - n.left - (n.width - t.width) / 2;
  }, [active]);
  return (
    <nav ref={ref} aria-label={label} className="-mx-1 overflow-x-auto px-1">
      {children}
    </nav>
  );
}

/**
 * Tanda memuat di tab yang baru diklik (anak <Link>, useLinkStatus): garis bawah berdenyut di posisi
 * garis tab aktif, tanpa menggeser tata letak. data-pending juga dipakai wadah tab (RoleTabsView) untuk
 * meredupkan daftar lama dan mengumumkan "Memuat artikel…".
 */
export function TabPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 bg-primary transition-opacity",
        // Muncul setelah 100 ms (saran dokumen useLinkStatus): pindah tab yang cepat tidak berkedip.
        pending ? "delay-100 motion-safe:animate-pulse" : "opacity-0",
      )}
    />
  );
}
