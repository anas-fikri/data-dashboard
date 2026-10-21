"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lebar isi kontainer grid (px) — pengganti `useContainerWidth` react-grid-layout (T-1zdf). Hook pustaka
 * hanya mengukur dan memasang ResizeObserver saat komponen dipasang; di dashboard kosong kontainernya
 * belum ada, jadi setelah widget pertama ditambah grid tetap memakai lebar bawaan 1280 px (kartu w=4
 * selebar 416 px di kanvas 816 px) dan tidak mengikuti perubahan ukuran sampai halaman dimuat ulang.
 * Di sini ref berupa callback: setiap elemen kontainer baru diukur lalu diamati. `containerRef` tetap
 * tersedia untuk membaca posisi grid; awal 1280 px sama dengan pustaka (render server).
 */
export function useGridWidth(initialWidth = 1280) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initialWidth);
  const ref = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setNode(el);
  }, []);

  // `node` hanya pemicu jalan ulang saat kontainer berganti; elemen dibaca dari containerRef (sudah terisi
  // sebelum effect pertama), jadi pengukuran pertama terjadi di effect yang sama dengan pustaka — tidak
  // satu render terlambat, sehingga kotak KPI tidak sempat mengukur kartu selebar 1280 px.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Diukur langsung seperti pustaka (bukan menunggu ResizeObserver satu bingkai kemudian). Tanpa padding.
    setWidth(Math.round(el.getBoundingClientRect().width));
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [node]);

  return { width, ref, containerRef };
}
