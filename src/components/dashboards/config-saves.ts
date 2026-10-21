import type { WidgetView } from "@/features/dashboards/service";

/*
 * Catatan simpanan pengaturan widget di editor kanvas (T-013 review putaran 10). Per widget:
 * - sedang dikirim (sudah masuk antrean, belum ada jawaban): panel yang dibuka ulang selama itu mulai
 *   dari spec ini, bukan spec lama kartu — suntingan berikutnya tidak membatalkan perubahan tadi;
 * - gagal (bukan STALE): toolbar tetap "Belum tersimpan", panel menampilkan alasannya, dan flush()
 *   ("Coba lagi" / "Selesai") mengirimnya ulang. Hilang saat simpanan widget itu berhasil atau
 *   widgetnya dihapus.
 * Murni (tanpa React) agar bisa diuji; editor memegang satu instans selama halaman terbuka.
 */
export type ConfigSave = {
  type: string;
  spec: unknown;
  /** Widget terikat pivot tersimpan (T-074): `spec` = tampilan saja. Tanpa = widget mandiri. */
  savedPivotId?: string;
};

export function createConfigSaves() {
  const sending = new Map<string, ConfigSave>();
  const failed = new Map<string, { save: ConfigSave; message: string; retry: boolean }>();
  return {
    start(widgetId: string, save: ConfigSave) {
      sending.set(widgetId, save);
    },
    /**
     * Jawaban server untuk `save`. failure = alasan gagal; null = tersimpan (atau tidak ada yang
     * disimpan). retry=false: ditolak permanen (tidak valid / sudah dihapus) — alasan tetap tampil di panel, tetapi
     * tidak dikirim ulang dan tidak menahan "Selesai". Tanda "dikirim" hanya dilepas oleh simpanan
     * pemiliknya: simpanan yang lebih baru untuk widget yang sama tetap tercatat.
     */
    finish(widgetId: string, save: ConfigSave, failure: string | null, retry = true) {
      if (sending.get(widgetId) === save) sending.delete(widgetId);
      if (failure === null) failed.delete(widgetId);
      else failed.set(widgetId, { save, message: failure, retry });
    },
    forget(widgetId: string) {
      sending.delete(widgetId);
      failed.delete(widgetId);
    },
    /** Spec terbaru yang belum tersimpan: sedang dikirim, atau gagal. */
    unsaved: (widgetId: string): ConfigSave | undefined =>
      sending.get(widgetId) ?? failed.get(widgetId)?.save,
    /** Simpanan gagal yang layak dikirim ulang, urut waktu pertama gagal. */
    retries: () =>
      [...failed].filter(([, f]) => f.retry).map(([widgetId, f]) => [widgetId, f.save] as const),
    /** Alasan gagal per widget (objek baru tiap panggilan, untuk state React). */
    errors: (): Partial<Record<string, string>> =>
      Object.fromEntries([...failed].map(([widgetId, f]) => [widgetId, f.message])),
  };
}

/**
 * Widget untuk form panel: spec yang belum tersimpan menggantikan spec kartu (yang dikirim = dipilih).
 * Simpanan terikat (T-074) menggantikan sumber (jenis + tampilan) dan membiarkan spec efektif kartu;
 * simpanan mandiri melepas sumber dari tampilan panel.
 */
export const withUnsaved = (w: WidgetView, save: ConfigSave | undefined): WidgetView => {
  if (!save) return w;
  if (save.savedPivotId) {
    const same = w.source?.savedPivotId === save.savedPivotId;
    return {
      ...w,
      retargeted: undefined,
      sourceError: undefined,
      source: {
        savedPivotId: save.savedPivotId,
        name: same ? w.source!.name : "",
        revision: same ? w.source!.revision : 0,
        type: save.type,
        display: save.spec,
      },
    };
  }
  return {
    ...w,
    type: save.type,
    spec: save.spec,
    retargeted: undefined,
    sourceError: undefined,
    source: undefined,
  };
};
