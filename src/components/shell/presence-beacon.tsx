"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * Heartbeat kehadiran (T-h807): selama tab aplikasi terlihat, kirim POST /api/presence { path } tiap
 * HEARTBEAT_MS, segera saat tab kembali terlihat, dan saat pindah halaman (paling cepat MIN_GAP_MS sekali).
 * Tab tersembunyi tidak mengirim apa pun. 401 (sesi habis/logout) → berhenti. Hanya pathname yang dikirim
 * (server tetap menyaring). Tidak merender apa pun.
 */
export const HEARTBEAT_MS = 60_000;
const MIN_GAP_MS = 15_000;

export function PresenceBeacon() {
  const pathname = usePathname();
  const last = useRef(0);
  const stopped = useRef(false);
  const pathRef = useRef(pathname);

  useEffect(() => {
    const send = (force = false) => {
      if (stopped.current || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!force && now - last.current < MIN_GAP_MS) return;
      last.current = now;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathRef.current }),
      })
        .then((r) => {
          if (r.status === 401) stopped.current = true;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    send(true);
    const timer = window.setInterval(() => send(true), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Pindah halaman: path baru dicatat (dibatasi MIN_GAP_MS agar navigasi cepat tidak membanjiri server).
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (stopped.current || document.visibilityState !== "visible") return;
    if (Date.now() - last.current < MIN_GAP_MS) return;
    last.current = Date.now();
    void fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
