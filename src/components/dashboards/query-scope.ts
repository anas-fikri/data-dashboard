/*
 * Lingkup query pratinjau di panel pivot/field terhitung (T-074): editor dashboard memakai mode
 * { dashboardId, spec } (pemilik/editor dashboard, D6), editor pivot tersimpan di halaman dataset memakai
 * query bebas pemilik { datasetId, spec }. Server tetap penentu akses keduanya; klien hanya memilih
 * bentuk body.
 */
export type QueryScope = { dashboardId: string } | { datasetId: string };

/** Kunci stabil untuk deps effect (objek lingkup baru tiap render tidak memicu query ulang). */
export const scopeKey = (s: QueryScope): string =>
  "dashboardId" in s ? `dashboard:${s.dashboardId}` : `dataset:${s.datasetId}`;

/** Kebalikan scopeKey (dipakai di dalam effect yang hanya bergantung pada kunci). */
export const scopeOf = (key: string): QueryScope => {
  const i = key.indexOf(":");
  const id = key.slice(i + 1);
  return key.slice(0, i) === "dataset" ? { datasetId: id } : { dashboardId: id };
};
