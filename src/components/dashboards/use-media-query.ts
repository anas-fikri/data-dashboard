"use client";

import { useSyncExternalStore } from "react";

/*
 * Media query di klien tanpa mismatch hidrasi: server/hidrasi memakai false, lalu klien membaca
 * matchMedia dan mengikuti perubahan ukuran jendela/rotasi.
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** < 768 px: kanvas satu kolom, tanpa menyeret. */
export const useIsPhone = () => useMediaQuery("(max-width: 767px)");

/** 768–1023 px: grid tampilan 6 kolom tanpa menyeret (T-031); tata letak tersimpan tetap 12 kolom. */
export const useIsTablet = () => useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

/** Ada layar sentuh (termasuk laptop sentuh): hanya pegangan kecil yang menyeret, kepala kartu tetap bisa di-scroll. */
export const useIsCoarsePointer = () => useMediaQuery("(any-pointer: coarse)");

/** ≥ 1280 px: panel pengaturan widget menempel di samping kanvas (di bawahnya: lembar dialog). */
export const useIsWide = () => useMediaQuery("(min-width: 1280px)");
