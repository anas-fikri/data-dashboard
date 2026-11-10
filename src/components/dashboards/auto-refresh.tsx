"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatWibTime } from "@/components/admin/backup-format";

/*
 * Muat ulang otomatis dashboard (T-nn87): interval per dashboard disimpan di browser (localStorage) dan
 * dibagi antara menu "Lainnya" (di header halaman, di luar kanvas) dan kanvas lewat store kecil. Setiap
 * interval: data server dashboard disegarkan (router.refresh — versi data baru, widget diubah rekan) dan
 * semua widget mengambil ulang datanya (tick) tanpa memuat ulang halaman. Tab tersembunyi → ditunda sampai
 * terlihat lagi.
 */

/** Pilihan interval (menit); 0 = mati. */
export const REFRESH_OPTIONS = [0, 1, 5, 15, 30] as const;
export type RefreshMinutes = (typeof REFRESH_OPTIONS)[number];
/** Mode TV tanpa pilihan tersimpan: 5 menit (monitor operasional tidak boleh basi tanpa disadari). */
export const TV_DEFAULT_MINUTES: RefreshMinutes = 5;

export const refreshLabel = (m: RefreshMinutes) => (m === 0 ? "Mati" : `Tiap ${m} menit`);

const key = (dashboardId: string) => `dd:refresh:${dashboardId}`;
const listeners = new Set<() => void>();
/** Cadangan bila localStorage tidak bisa ditulis (pilihan berlaku selama halaman terbuka). */
const memory = new Map<string, RefreshMinutes>();

function read(dashboardId: string): RefreshMinutes | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key(dashboardId));
  } catch {
    // Diblokir: pakai cadangan memori.
  }
  const n = raw === null ? NaN : Number(raw);
  if ((REFRESH_OPTIONS as readonly number[]).includes(n)) return n as RefreshMinutes;
  return memory.get(dashboardId) ?? null;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Tab lain mengubah pilihan untuk dashboard yang sama.
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

/**
 * Interval tersimpan dashboard: null = belum pernah dipilih (pemanggil memilih bawaan: mati, atau 5 menit
 * di mode TV). Server → null (tanpa localStorage), jadi render server dan hidrasi pertama sama.
 */
export function useRefreshMinutes(
  dashboardId: string,
): [RefreshMinutes | null, (m: RefreshMinutes) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(dashboardId),
    () => null,
  );
  const set = (m: RefreshMinutes) => {
    memory.set(dashboardId, m);
    try {
      window.localStorage.setItem(key(dashboardId), String(m));
    } catch {
      // Penyimpanan diblokir (mode privat): cadangan memori berlaku sampai halaman ditutup.
    }
    for (const fn of listeners) fn();
  };
  return [value, set];
}

const TickContext = createContext(0);

/** Naik setiap muat ulang otomatis: widget mengambil ulang datanya (useWidgetQuery). */
export function useRefreshTick(): number {
  return useContext(TickContext);
}

export const RefreshTickProvider = TickContext.Provider;

/**
 * Penggerak muat ulang otomatis di kanvas (mode lihat). Mengembalikan tick (untuk RefreshTickProvider)
 * dan waktu pembaruan terakhir (null sampai pembaruan pertama). `minutes` 0 = mati.
 */
export function useAutoRefresh(minutes: number): { tick: number; lastAt: number | null } {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const due = useRef(false);

  useEffect(() => {
    if (!minutes) return;
    const run = () => {
      due.current = false;
      // Props server (widget, tata letak, versi data aktif) lalu data setiap widget.
      router.refresh();
      setTick((t) => t + 1);
      setLastAt(Date.now());
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") due.current = true;
      else run();
    }, minutes * 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && due.current) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [minutes, router]);

  return { tick, lastAt };
}

/** Keterangan muat ulang otomatis di atas kanvas (mode lihat biasa; mode TV memakai bilah TV). */
export function RefreshStatus({
  minutes,
  lastAt,
  tv,
}: {
  minutes: number;
  lastAt: number | null;
  tv: boolean;
}) {
  if (tv) return null;
  const at = lastAt ? formatWibTime(new Date(lastAt).toISOString()) : null;
  return (
    <p
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="refresh-status"
    >
      <IconRefresh aria-hidden className="size-4 shrink-0" />
      <span>
        Muat ulang otomatis tiap {minutes} menit{at ? ` · diperbarui ${at}` : ""}
      </span>
    </p>
  );
}
