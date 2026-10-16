"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Wilayah gulir yang bisa difokus hanya bila isinya meluap (T-032): keyboard perlu fokus untuk
 * menggulirnya dengan panah (WCAG 2.1.1), tetapi wilayah yang muat tidak menjadi tab stop kosong.
 * Callback ref: wilayah bisa muncul belakangan (setelah data dimuat). Ukuran kotak dan isinya diamati
 * (legenda berganti baris saat data/kartu berubah).
 */
export function useScrollFocus<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    if (!el) return;
    const check = () =>
      setOverflow(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, overflow ? 0 : undefined] as const;
}
