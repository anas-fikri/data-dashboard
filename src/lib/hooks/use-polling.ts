"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Polling GET JSON sampai `done(data)` benar. Satu permintaan pada satu waktu (AbortController saat
 * unmount/URL berganti), jeda saat tab tidak terlihat, dan kegagalan jaringan tidak diam-diam: `error`
 * menyala setelah 2 kegagalan beruntun, polling tetap mencoba dengan jeda lebih panjang, dan
 * `retry()` memaksa percobaan segera. Data, error, dan status selesai terikat ke URL: URL baru
 * (mis. job berikutnya) mulai bersih.
 */
/**
 * Data awal yang sudah final untuk URL ini (polling tidak perlu), atau null. Data itu tetap dilaporkan
 * sekali lewat `onDone`: render server bisa membaca status di antara dua bacaan (mis. ingest selesai
 * ~50 ms setelah badge "Memproses" dibaca) dan pemanggil harus merender ulang, bukan diam di panel basi.
 */
export function finalInitial<T>(
  initial: T | null,
  url: string | null,
  done: (data: T) => boolean,
): T | null {
  return url !== null && initial !== null && done(initial) ? initial : null;
}

export function usePolling<T>(opts: {
  url: string | null;
  intervalMs: number;
  /** Data awal untuk URL awal (mis. dari render server) — layar tidak pernah kosong. */
  initial: T | null;
  done: (data: T) => boolean;
  /** Dipanggil sekali per URL saat `done` pertama kali benar (juga bila data awal sudah final). */
  onDone?: (data: T) => void;
  /**
   * Respons 401/403/404/410: polling berhenti (bukan diulang selamanya) dan pemanggil memutuskan
   * langkah berikutnya, mis. render ulang halaman (review T-008 L2).
   */
  onStop?: (status: number) => void;
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
    finalInitial(opts.initial, url, opts.done) !== null ? url : null,
  );
  useEffect(() => {
    const { initial, url: first, done, onDone } = latest.current;
    const data = finalInitial(initial, first, done);
    if (data !== null) onDone?.(data);
  }, []);

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
        if ([401, 403, 404, 410].includes(res.status)) {
          finished.current = url;
          latest.current.onStop?.(res.status);
          return;
        }
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
