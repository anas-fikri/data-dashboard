/*
 * Cache riwayat sheet untuk widget versi lama (T-011, review keamanan putaran 3): widget yang
 * menunjuk versi data lama dibaca ulang tiap muat dashboard. Dibatasi umur, jumlah entri, dan total
 * ukuran (jumlah kolom skema) — bukan hanya jumlah entri — dan entri kedaluwarsa dibuang saat
 * menulis. Urutan Map = urutan tulis, jadi entri terlama selalu di depan. Murni.
 */
export interface HistoryCacheOptions<T> {
  ttlMs: number;
  maxEntries: number;
  /** Batas total ukuran (mis. jumlah kolom skema yang disimpan). */
  maxSize: number;
  size: (value: T) => number;
  now?: () => number;
}

interface Entry<T> {
  at: number;
  value: Promise<T>;
  size: number;
}

export class HistoryCache<T> {
  private readonly map = new Map<string, Entry<T>>();
  private total = 0;
  private readonly now: () => number;

  constructor(private readonly o: HistoryCacheOptions<T>) {
    this.now = o.now ?? Date.now;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const hit = this.map.get(key);
    if (hit && hit.at > now - this.o.ttlMs) return hit.value;
    this.drop(key);
    const entry: Entry<T> = { at: now, value: load(), size: 1 };
    this.map.set(key, entry);
    this.total += entry.size;
    this.trim(now);
    entry.value.then(
      (v) => {
        if (this.map.get(key) !== entry) return;
        const size = Math.max(1, this.o.size(v));
        this.total += size - entry.size;
        entry.size = size;
        this.trim(this.now());
      },
      () => {
        if (this.map.get(key) === entry) this.drop(key);
      },
    );
    return entry.value;
  }

  stats() {
    return { entries: this.map.size, size: this.total };
  }

  private drop(key: string) {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.total -= e.size;
  }

  private trim(now: number) {
    for (const [key, e] of this.map) {
      const over = this.map.size > this.o.maxEntries || this.total > this.o.maxSize;
      if (!over && e.at > now - this.o.ttlMs) break;
      this.drop(key);
    }
  }
}
