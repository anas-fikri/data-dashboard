"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Ukuran kotak elemen (px, dibulatkan) dari ResizeObserver; null sebelum diukur. Pembaruan digabung per
 * frame dan hanya bila berubah ≥ 2 px agar grafik tidak dirender ulang terus-menerus.
 */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        setSize((s) =>
          s && Math.abs(s.width - width) < 2 && Math.abs(s.height - height) < 2
            ? s
            : { width, height },
        );
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [ref]);
  return size;
}
