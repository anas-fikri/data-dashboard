"use client";

import { useMemo, useSyncExternalStore } from "react";

/*
 * Nilai JSON di sessionStorage sebagai store eksternal: render server dan hydration memakai null,
 * klien lalu membaca nilai tersimpan tanpa mismatch dan tanpa setState di effect. Penulisan lewat
 * writeSessionJson memberi tahu semua pembaca di tab ini. Penyimpanan tidak tersedia (mode privat,
 * diblokir) → selalu null; fitur tetap jalan selama halaman terbuka.
 */
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function readRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionJson(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan tidak tersedia */
  }
  for (const l of listeners) l();
}

export function useSessionJson<T>(key: string): T | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);
}
