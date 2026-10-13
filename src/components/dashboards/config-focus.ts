"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/*
 * Fokus di panel pengaturan widget (T-011). Di mode dialog, FocusScope Radix menarik fokus ke
 * kontainer bila ada node yang dilepas saat fokus sedang di <body> — mis. pesan yang berganti saat
 * blur (fokus belum sampai di kontrol berikutnya) atau tombol yang hilang setelah diklik.
 */

/**
 * Satu tugas yang ditunda ke giliran berikutnya (setTimeout 0, setelah fokus berpindah); jadwal baru
 * menggantikan yang lama. `flush` menjalankan tugas yang masih menunggu sekarang juga — dipakai saat
 * komponen dilepas agar isian yang ditinggalkan tepat sebelum panel ditutup tetap tersimpan.
 */
export function deferredTask() {
  let id: ReturnType<typeof setTimeout> | undefined;
  let job: (() => void) | undefined;
  const flush = () => {
    clearTimeout(id);
    const run = job;
    job = undefined;
    run?.();
  };
  return {
    schedule: (run: () => void) => {
      clearTimeout(id);
      job = run;
      id = setTimeout(flush, 0);
    },
    flush,
  };
}

/**
 * Pindahkan fokus ke kotak centang aktif pertama di dalam `ref` tepat setelah render berikutnya
 * (layout effect: sebelum FocusScope melihat fokus di body). Panggil `arm()` sebelum mengubah state.
 */
export function useFocusAfterRender<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const armed = useRef(false);
  useLayoutEffect(() => {
    if (!armed.current) return;
    armed.current = false;
    const root = ref.current;
    const target =
      root?.querySelector<HTMLElement>("input:checked:not(:disabled)") ??
      root?.querySelector<HTMLElement>("input:not(:disabled)") ??
      root;
    target?.focus();
  });
  const arm = useCallback(() => {
    armed.current = true;
  }, []);
  return [ref, arm] as const;
}
