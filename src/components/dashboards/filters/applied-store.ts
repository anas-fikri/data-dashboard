/*
 * Status filter yang sudah DITERAPKAN ke widget, per dashboard (T-018 D9). DashboardFiltersProvider
 * hidup di dalam kanvas; tombol "Ekspor PDF" di kepala halaman berada di luarnya, jadi provider
 * menerbitkan status `applied`-nya ke sini dan tombol membacanya saat ekspor dimulai (tanpa langganan
 * — tidak ada render ulang per perubahan filter). Status yang terlalu panjang untuk URL (urlTooLong)
 * hanya ada di sini; tanpa entri (kanvas belum terpasang) pemanggil kembali ke ?f=. Store modul di
 * luar state React (pola export-store.ts); isi hilang saat halaman dimuat ulang.
 */
import { useEffect } from "react";
import type { FilterState } from "./filter-model";

const applied = new Map<string, FilterState>();

/** DashboardFiltersProvider: terbitkan `applied` selama terpasang (objek baru = status baru). */
export function usePublishApplied(dashboardId: string, state: FilterState): void {
  useEffect(() => {
    publishAppliedFilters(dashboardId, state);
    return () => withdrawAppliedFilters(dashboardId, state);
  }, [dashboardId, state]);
}

/** Provider: status yang berlaku sekarang (dipanggil tiap `applied` berubah). */
export function publishAppliedFilters(dashboardId: string, state: FilterState): void {
  applied.set(dashboardId, state);
}

/**
 * Provider dilepas (pindah mode/halaman): entrinya dibuang hanya bila masih miliknya — provider baru
 * untuk dashboard yang sama bisa sudah menerbitkan lebih dulu.
 */
export function withdrawAppliedFilters(dashboardId: string, state: FilterState): void {
  if (applied.get(dashboardId) === state) applied.delete(dashboardId);
}

/** Status terakhir yang diterbitkan untuk dashboard ini; null = belum ada provider yang terpasang. */
export function appliedFiltersOf(dashboardId: string): FilterState | null {
  return applied.get(dashboardId) ?? null;
}

/** Hanya untuk unit test: mulai dari keadaan kosong. */
export function resetAppliedFilters(): void {
  applied.clear();
}
