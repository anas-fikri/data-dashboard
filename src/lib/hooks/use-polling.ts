"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Polling GET JSON sampai `done(data)` benar. Satu permintaan pada satu waktu (AbortController saat
 * unmount/URL berganti), jeda saat tab tidak terlihat, dan kegagalan jaringan tidak diam-diam: `error`
 * menyala setelah 2 kegagalan beruntun, polling tetap mencoba dengan jeda lebih panjang, dan
 * `retry()` memaksa percobaan segera. Data, error, dan status selesai terikat ke URL: URL baru
 * (mis. job berikutnya) mulai bersih.
 */
export function usePolling<T>(opts: {
  url: string | null;
  intervalMs: number;
  /** Data awal untuk URL awal (mis. dari render server) — layar tidak pernah kosong. */
  initial: T | null;
  done: (data: T) => boolean;
  /** Dipanggil sekali per URL saat `done` pertama kali benar. */
  onDone?: (data: T) => void;
}) {
  const { url, intervalMs } = opts;
  const [result, setResult] = useState<{ url: string | null; data: T | null }>({
    url,
    data: opts.initial,
  });
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const finished = useRef<string | null>(
    opts.initial !== null && opts.done(opts.initial) ? url : null,
  );

  useEffect(() => {
    if (!url || finished.current === url) return;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const schedule = () => {
      const wait = failures >= 2 ? Math.min(intervalMs * 4, 20_000) : intervalMs;
      timer = setTimeout(run, wait);
    };
    async function run() {
      if (document.visibilityState === "hidden") {
        document.addEventListener("visibilitychange", run, { once: true, signal: ctl.signal });
        return;
      }
      try {
        const res = await fetch(url!, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as T;
        failures = 0;
        setErrorUrl(null);
        setResult({ url, data: next });
        if (latest.current.done(next)) {
          finished.current = url;
          latest.current.onDone?.(next);
          return;
        }
      } catch {
        if (ctl.signal.aborted) return;
        failures += 1;
        if (failures >= 2) setErrorUrl(url);
      }
      schedule();
    }
    schedule();
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [url, intervalMs, tick]);

  const retry = useCallback(() => {
    setErrorUrl(null);
    setTick((t) => t + 1);
  }, []);

  return {
    data: result.url === url ? result.data : null,
    error: url !== null && errorUrl === url,
    retry,
  };
}
