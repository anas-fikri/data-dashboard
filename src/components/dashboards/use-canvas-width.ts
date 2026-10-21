"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Lebar isi kanvas grid (px) dari ResizeObserver. Pengganti useContainerWidth react-grid-layout: observer
 * pustaka hanya dipasang sekali saat mount, padahal dashboard kosong belum merender elemen kanvas —
 * widget pertama lalu ditata untuk lebar bawaan 1280 px (kartu w=4 selebar 416 px di kanvas 816 px
 * bila panel pengaturan terbuka) sampai halaman dimuat ulang. Callback ref memasang observer setiap kali
 * elemennya muncul. `ref` objek tetap tersedia untuk menghitung posisi gulir.
 */
export function useCanvasWidth(initial = 1280) {
  const [width, setWidth] = useState(initial);
  const ref = useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    let raf = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      ref.current = null;
    };
  }, []);
  return { width, containerRef, ref };
}
