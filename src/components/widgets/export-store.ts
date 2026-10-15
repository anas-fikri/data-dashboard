/*
 * Ekspor per widget di luar pohon React (review R1 CL-1). Kartu widget dipasang ulang tanpa memuat
 * ulang halaman: ponsel diputar melintasi 768 px (tumpukan ↔ grid) atau pindah mode lihat ↔ edit.
 * Status ekspor (export-model.ts) disimpan di sini per user + widget (exportKey) sehingga kartu yang
 * dipasang ulang membaca ekspor yang sama: yang masih berjalan dilanjutkan polling-nya, yang selesai saat
 * kartu tidak terpasang diunduh otomatis begitu statusnya terbaca. Unduhan otomatis diklaim per ekspor
 * (claimDownload) sehingga tidak pernah terulang lintas pemasangan. Isi hilang saat halaman dimuat
 * ulang (diterima: ekspor tidak dipulihkan setelah reload).
 * User ikut di kunci (review R2-CL-1): keluar lalu masuk sebagai user lain di tab yang sama adalah
 * navigasi lunak — modul ini tidak dimuat ulang, dan ekspor user sebelumnya tidak boleh terlihat.
 * Sasaran (T-018): id widget, atau dashboardExportTarget(id) untuk PDF dashboard di kepala halaman —
 * PDF dan ekspor widget di dashboard yang sama tidak saling menimpa.
 */
import { EXPORT_IDLE, exportReducer, type ExportEvent, type ExportJob } from "./export-model";

interface Entry {
  job: ExportJob;
  /** Id ekspor yang sudah diunduh otomatis (null = belum ada). */
  downloaded: string | null;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/** Kunci store: id user yang masuk (props server, export-user.tsx) + sasaran (id widget / PDF). */
export const exportKey = (userId: string, target: string) => `${userId}:${target}`;

/** Snapshot stabil (objek yang sama sampai ada perubahan) untuk useSyncExternalStore. */
export function exportJobOf(key: string): ExportJob {
  return entries.get(key)?.job ?? EXPORT_IDLE;
}

export function dispatchExport(key: string, event: ExportEvent): ExportJob {
  const prev = entries.get(key);
  const job = exportReducer(prev?.job ?? EXPORT_IDLE, event);
  if (prev?.job === job) return job;
  entries.set(key, { job, downloaded: prev?.downloaded ?? null });
  listeners.get(key)?.forEach((notify) => notify());
  return job;
}

/** true tepat SEKALI per ekspor yang selesai: pemanggil memulai unduhan otomatis. */
export function claimDownload(key: string, id: string): boolean {
  const entry = entries.get(key);
  if (!entry || entry.job.phase !== "done" || entry.job.id !== id) return false;
  if (entry.downloaded === id) return false;
  entry.downloaded = id;
  return true;
}

export function subscribeExport(key: string, notify: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  listeners.set(key, set);
  set.add(notify);
  return () => {
    set.delete(notify);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Hanya untuk unit test: mulai dari keadaan kosong. */
export function resetExportStore(): void {
  entries.clear();
  listeners.clear();
}
