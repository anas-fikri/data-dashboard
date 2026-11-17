"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * Heartbeat kehadiran (T-h807): selama tab aplikasi terlihat, kirim POST /api/presence { path } tiap
 * HEARTBEAT_MS, segera saat tab kembali terlihat, dan saat pindah halaman. Paling cepat sekali tiap
 * MIN_GAP_MS: pindah halaman di dalam jeda itu dikirim di akhir jeda (halaman terakhir tetap tercatat, review
 * #3). Tab tersembunyi tidak mengirim apa pun. Jawaban 401 (sesi habis) tidak menghentikan beacon untuk
 * selamanya — heartbeat berikutnya mencoba lagi (login ulang di tab lain berlaku, review #2); biayanya satu
 * permintaan per menit. Hanya pathname yang dikirim (server tetap menyaring). Tidak merender apa pun.
 */
export const HEARTBEAT_MS = 60_000;
const MIN_GAP_MS = 15_000;

export function PresenceBeacon() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const sendRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let last = 0;
    let pending: number | null = null;
    const post = () => {
      last = Date.now();
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathRef.current }),
      }).catch(() => undefined);
    };
    /** Kirim sekarang, atau di akhir jeda bila heartbeat terakhir terlalu dekat. */
    const send = () => {
      if (document.visibilityState !== "visible") return;
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait <= 0) {
        if (pending !== null) window.clearTimeout(pending);
        pending = null;
        post();
      } else if (pending === null) {
        pending = window.setTimeout(() => {
          pending = null;
          if (document.visibilityState === "visible") post();
        }, wait);
      }
    };
    sendRef.current = send;
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    send();
    const timer = window.setInterval(send, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sendRef.current = null;
      window.clearInterval(timer);
      if (pending !== null) window.clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Pindah halaman: path baru dicatat (sekarang, atau di akhir jeda MIN_GAP_MS).
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    sendRef.current?.();
  }, [pathname]);

  return null;
}
