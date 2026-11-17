import type { FilterColumnView } from "@/features/dashboards/filter-columns";

/*
 * Daftar kolom filter terakhir yang diketahui server per dashboard (T-4q8n, review #7). Dua tempat menyimpan
 * kolom filter (Atur kolom filter, Jadikan filter aktif sebagai bawaan); props keduanya baru diperbarui
 * setelah router.refresh tiba. Tanpa ini, simpanan di satu tempat membuat simpanan berikutnya di tempat
 * lain (sebelum refresh) dianggap basi (STALE) padahal perubahannya milik user sendiri. Jawaban simpan
 * dicatat bersama props yang berlaku saat itu; props baru dari server menggantikannya.
 */
const saved = new Map<string, { props: FilterColumnView[]; columns: FilterColumnView[] }>();

export function rememberSavedColumns(
  dashboardId: string,
  props: FilterColumnView[],
  columns: FilterColumnView[],
): void {
  saved.set(dashboardId, { props, columns });
}

/** Daftar acuan `expected`: jawaban simpan terakhir bila props belum diperbarui sejak itu, selain itu props. */
export function knownColumns(dashboardId: string, props: FilterColumnView[]): FilterColumnView[] {
  const s = saved.get(dashboardId);
  return s && s.props === props ? s.columns : props;
}
