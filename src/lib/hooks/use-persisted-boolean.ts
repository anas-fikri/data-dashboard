"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Boolean per-viewer di localStorage tanpa setState-dalam-effect dan tanpa mismatch hidrasi
 * (snapshot server selalu false; klien membaca nilai tersimpan saat hidrasi).
 */
export function usePersistedBoolean(key: string): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* penyimpanan tidak tersedia */
      }
      emit();
    },
    [key],
  );
  return [value, set];
}

/** true setelah hidrasi di klien, false saat SSR; tanpa effect. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
