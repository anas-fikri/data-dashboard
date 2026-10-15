/*
 * Ekspor per widget di luar pohon React (review R1 CL-1). Kartu widget dipasang ulang tanpa memuat
 * ulang halaman: ponsel diputar melintasi 768 px (tumpukan ↔ grid) atau pindah mode lihat ↔ edit.
 * Status ekspor (export-model.ts) disimpan di sini per widgetId sehingga kartu yang dipasang ulang
 * membaca ekspor yang sama: yang masih berjalan dilanjutkan polling-nya, yang selesai saat kartu
 * tidak terpasang diunduh otomatis begitu statusnya terbaca. Unduhan otomatis diklaim per ekspor
 * (claimDownload) sehingga tidak pernah terulang lintas pemasangan. Isi hilang saat halaman dimuat
 * ulang (diterima: ekspor tidak dipulihkan setelah reload).
 */
import { EXPORT_IDLE, exportReducer, type ExportEvent, type ExportJob } from "./export-model";

interface Entry {
  job: ExportJob;
  /** Id ekspor yang sudah diunduh otomatis (null = belum ada). */
  downloaded: string | null;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/** Snapshot stabil (objek yang sama sampai ada perubahan) untuk useSyncExternalStore. */
export function exportJobOf(widgetId: string): ExportJob {
  return entries.get(widgetId)?.job ?? EXPORT_IDLE;
}

export function dispatchExport(widgetId: string, event: ExportEvent): ExportJob {
  const prev = entries.get(widgetId);
  const job = exportReducer(prev?.job ?? EXPORT_IDLE, event);
  if (prev?.job === job) return job;
  entries.set(widgetId, { job, downloaded: prev?.downloaded ?? null });
  listeners.get(widgetId)?.forEach((notify) => notify());
  return job;
}

/** true tepat SEKALI per ekspor yang selesai: pemanggil memulai unduhan otomatis. */
export function claimDownload(widgetId: string, id: string): boolean {
  const entry = entries.get(widgetId);
  if (!entry || entry.job.phase !== "done" || entry.job.id !== id) return false;
  if (entry.downloaded === id) return false;
  entry.downloaded = id;
  return true;
}

export function subscribeExport(widgetId: string, notify: () => void): () => void {
  const set = listeners.get(widgetId) ?? new Set();
  listeners.set(widgetId, set);
  set.add(notify);
  return () => {
    set.delete(notify);
    if (set.size === 0) listeners.delete(widgetId);
  };
}

/** Hanya untuk unit test: mulai dari keadaan kosong. */
export function resetExportStore(): void {
  entries.clear();
  listeners.clear();
}
