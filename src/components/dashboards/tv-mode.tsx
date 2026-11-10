"use client";

import { IconArrowsMaximize, IconArrowsMinimize, IconX } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useSyncExternalStore } from "react";
import { formatWibTime } from "@/components/admin/backup-format";
import { Button } from "@/components/ui/button";
import {
  REFRESH_OPTIONS,
  refreshLabel,
  useRefreshFailures,
  useRefreshMinutes,
  type RefreshMinutes,
} from "./auto-refresh";

/** URL dashboard tanpa mode TV (filter ?f= dan parameter lain tetap). */
export function withoutTv(pathname: string, params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("tv");
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** URL dashboard dalam mode TV (mode lihat; ?mode=edit dibuang). */
export function withTv(pathname: string, params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("mode");
  next.set("tv", "1");
  return `${pathname}?${next.toString()}`;
}

function onFullscreen(fn: () => void) {
  document.addEventListener("fullscreenchange", fn);
  return () => document.removeEventListener("fullscreenchange", fn);
}

/** Masuk mode TV dari klik pengguna: layar penuh diminta di dalam gestur yang sama (syarat browser). */
export function enterTv(go: (url: string) => void, pathname: string, params: URLSearchParams) {
  void document.documentElement.requestFullscreen?.().catch(() => {});
  go(withTv(pathname, params));
}

/**
 * Bilah mode TV (T-nn87): nama dashboard (judul halaman), waktu pembaruan terakhir, pilihan muat ulang
 * otomatis, layar penuh, dan keluar. Selama terpasang, sidebar/header/footer aplikasi disembunyikan
 * (globals.css, :root[data-tv]). Esc di luar layar penuh (dan tanpa dialog terbuka) keluar dari mode TV.
 */
export function TvBar({
  dashboardId,
  name,
  minutes,
  lastAt,
}: {
  dashboardId: string;
  name: string;
  minutes: number;
  lastAt: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, setMinutes] = useRefreshMinutes(dashboardId);
  const full = useSyncExternalStore(
    onFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  // Dukungan layar penuh baru diketahui di browser (render server = tanpa tombol, hidrasi sama).
  const canFull = useSyncExternalStore(
    onFullscreen,
    () => document.fullscreenEnabled === true,
    () => false,
  );
  const selectId = useId();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-tv", "");
    return () => root.removeAttribute("data-tv");
  }, []);

  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    router.replace(withoutTv(pathname, new URLSearchParams(params.toString())));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc pertama di layar penuh ditangani browser (keluar layar penuh); dialog/popover menangani Esc-nya.
      if (e.key !== "Escape" || e.defaultPrevented || document.fullscreenElement) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      router.replace(withoutTv(pathname, new URLSearchParams(params.toString())));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, params]);

  const at = lastAt ? formatWibTime(new Date(lastAt).toISOString()) : null;
  const failures = useRefreshFailures();
  const ctl = "h-(--control-h-sm)";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3" data-testid="tv-bar">
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold" title={name}>
        {name}
      </h1>
      <p
        className={`text-sm ${failures ? "font-medium text-destructive" : "text-muted-foreground"}`}
        aria-live="polite"
        data-testid="tv-updated"
      >
        {failures
          ? `${failures} widget gagal diperbarui — menampilkan data terakhir`
          : minutes > 0
            ? at
              ? `Diperbarui ${at}`
              : `Muat ulang otomatis tiap ${minutes} menit`
            : "Muat ulang otomatis mati"}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm">
          Muat ulang
        </label>
        <select
          id={selectId}
          className={`${ctl} rounded-md border bg-background px-2 text-sm`}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value) as RefreshMinutes)}
        >
          {REFRESH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {refreshLabel(m)}
            </option>
          ))}
        </select>
      </div>
      {canFull ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          leadingIcon={
            full ? <IconArrowsMinimize aria-hidden /> : <IconArrowsMaximize aria-hidden />
          }
          onClick={() =>
            full
              ? void document.exitFullscreen().catch(() => {})
              : void document.documentElement.requestFullscreen?.().catch(() => {})
          }
        >
          {full ? "Keluar layar penuh" : "Layar penuh"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        leadingIcon={<IconX aria-hidden />}
        onClick={exit}
        data-testid="tv-exit"
      >
        Keluar mode TV
      </Button>
    </div>
  );
}
