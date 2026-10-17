"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ChartBadge } from "@/components/widgets/chart-widget";
import { cn } from "@/lib/utils";
import { badgeMode, headRoom } from "./badge-fit";

/** Lencana kategori di kepala kartu (penuh/ringkas): satu gaya. */
const BADGE =
  "shrink-0 rounded-sm bg-muted px-1 text-xs leading-5 whitespace-nowrap tabular-nums text-foreground";

/**
 * Tampilkan/sembunyikan satu bentuk lencana langsung di DOM; test id hanya pada yang tampil. Ditulis
 * hanya bila berubah: banyak kartu → tanpa penulisan sia-sia di sela pembacaan tata letak kartu lain.
 */
function show(el: HTMLElement | null, on: boolean, testId: string) {
  if (!el || el.hidden === !on) return;
  el.hidden = !on;
  if (on) el.dataset.testid = testId;
  else delete el.dataset.testid;
}

/**
 * Lencana "N dari M" kategori di kepala kartu grafik (T-032, T-7ke3, T-2jwv). Bentuk yang tampil (penuh,
 * ringkas, atau tidak ada) dipilih sebelum paint di layout effect dan di callback ResizeObserver, dan
 * diterapkan langsung ke DOM (T-qrxf): tanpa render React di dalam callback — flushSync ikut menjalankan
 * efek tertunda komponen lain (mis. resize grafik) sehingga sempat memicu galat "ResizeObserver loop",
 * dan banyak kartu yang melewati ambang bersamaan tidak lagi merender ulang apa pun. Diukur ulang saat
 * kepala, tombol kepala (jenis pointer 32 ↔ 44 px), atau span ukur (font selesai dimuat) berubah ukuran,
 * dan saat isi kepala berubah (`layoutKey`).
 */
export function HeadBadge({
  headRef,
  badge,
  layoutKey,
}: {
  headRef: RefObject<HTMLDivElement | null>;
  badge: ChartBadge;
  layoutKey: string;
}) {
  const fullRef = useRef<HTMLSpanElement>(null);
  const compactRef = useRef<HTMLSpanElement>(null);
  const shownFullRef = useRef<HTMLSpanElement>(null);
  const shownCompactRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const width = (el: HTMLElement | null) => el?.getBoundingClientRect().width ?? 0;
    const apply = () => {
      const { room, gap } = headRoom(head);
      const fit = badgeMode({
        room,
        gap,
        full: width(fullRef.current),
        compact: width(compactRef.current),
      });
      show(shownFullRef.current, fit === "full", "chart-badge");
      show(shownCompactRef.current, fit === "compact", "chart-badge-compact");
    };
    apply();
    const ro = new ResizeObserver(apply);
    const controls = head.querySelectorAll<HTMLElement>(":scope > [data-head-control]");
    for (const el of [head, fullRef.current, compactRef.current, ...controls])
      if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [headRef, badge, layoutKey]);
  return (
    <>
      {/* Pengukur lebar lencana (tak terlihat, di luar alur tata letak). */}
      <span ref={fullRef} aria-hidden data-badge className={cn(BADGE, "invisible absolute")}>
        {badge.short}
      </span>
      <span ref={compactRef} aria-hidden data-badge className={cn(BADGE, "invisible absolute")}>
        {badge.compact}
      </span>
      {/* Bentuk yang tampil diatur apply() (hidden + data-testid); pembaca layar mendapat ringkasan
          lengkap dari grafiknya sendiri. Jangan jadikan `hidden` bersyarat atau tambah prop
          data-testid di sini: React akan menimpa yang ditulis apply() setiap prop itu berubah. */}
      <span ref={shownFullRef} hidden aria-hidden data-badge className={BADGE} title={badge.full}>
        {badge.short}
      </span>
      <span
        ref={shownCompactRef}
        hidden
        aria-hidden
        data-badge
        className={BADGE}
        title={badge.full}
      >
        {badge.compact}
      </span>
    </>
  );
}
