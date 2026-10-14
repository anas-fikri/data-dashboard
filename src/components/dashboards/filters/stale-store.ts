/*
 * Widget yang sedang menampilkan angka dari filter lain (penanda "Memperbarui…", widget-body.tsx),
 * T-012. Bilah filter membaca jumlahnya untuk SATU pengumuman per perubahan filter ("Memperbarui 8
 * widget…"), bukan satu per kartu. Di luar state React: laporan kartu tidak merender ulang seluruh
 * dashboard — hanya bilah filter yang berlangganan (useSyncExternalStore).
 */
export interface StaleStore {
  set: (widgetId: string, stale: boolean) => void;
  count: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createStaleStore(): StaleStore {
  const ids = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    set: (id, stale) => {
      if (ids.has(id) === stale) return;
      if (stale) ids.add(id);
      else ids.delete(id);
      listeners.forEach((l) => l());
    },
    count: () => ids.size,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
