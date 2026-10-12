"use client";

import { useSyncExternalStore } from "react";

/*
 * Lebar layar < 768 px (satu kolom, tanpa menyeret). Server/hydration: false (grid), lalu klien membaca
 * media query tanpa mismatch dan mengikuti perubahan ukuran jendela/rotasi.
 */
const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
