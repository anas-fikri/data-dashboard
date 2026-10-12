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

/** Layar sentuh: hanya pegangan kecil yang menyeret, sisa kepala kartu tetap bisa di-scroll. */
export const useIsCoarsePointer = () => useMediaQuery("(pointer: coarse)");

/** ≥ 1280 px: panel pengaturan widget menempel di samping kanvas (di bawahnya: lembar dialog). */
export const useIsWide = () => useMediaQuery("(min-width: 1280px)");
