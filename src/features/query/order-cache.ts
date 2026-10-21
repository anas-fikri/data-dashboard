/*
 * Cache urutan "Lihat data" (T-062, rencana G-6 §3.4 butir 3 / P-30): berkas di disk lokal proses ini
 * untuk satu tampilan terurut (kunci = sheet + versi + revisi skema + file typed segmen + urut + saring +
 * cari + periode):
 *  - `perm.parquet`: permutasi `_row` hasil urut/saring (posisi tampilan = file_row_number);
 *  - `chunk-<k>-<n>.parquet`: potongan posisi [k·chunkRows, (k+1)·chunkRows) yang sudah diambil isinya
 *    (kolom keluaran grid, teks sudah dipotong) dalam urutan tampilan — mengambil 200 `_row` acak dari
 *    sumber mendekompresi hampir semua row group (±2–3 s pada 10 jt baris, T-061), jadi isi diambil
 *    sekali per potongan, bukan per blok.
 * Batas: total byte ≤ maxBytes (GRID_ORDER_CACHE_BYTES; entri yang paling lama tidak dipakai dibuang
 * dulu, yang sedang dibaca tidak pernah), entri tidak dipakai > ttlMs (30 menit) dibuang. Kunci memuat
 * versi + revisi, dan invalidate() membuang entri sheet yang versi/revisinya sudah berganti — entri
 * tidak pernah dipakai untuk versi lain. Direktori dikosongkan saat cache dibuat (indeks hanya di memori,
 * satu proses per direktori cache seperti ParquetCache).
 */
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/** Identitas data di balik satu entri (untuk invalidasi). */
export interface OrderMeta {
  sheetId: string;
  versionId: string;
  schemaRevision: number;
  /** File typed segmen sumber (forget saat data dihapus). */
  typedKeys: string[];
}

export interface OrderChunk {
  file: string;
  bytes: number;
  /** Posisi kolom yang ada di file (urut naik). */
  cols: number[];
  pins: number;
  lastUsed: number;
}

export interface OrderEntry {
  key: string;
  meta: OrderMeta;
  dir: string;
  perm: string;
  /** Jumlah baris tampilan (= filteredTotal) dan total sheet tanpa saringan. */
  rows: number;
  total: number;
  chunkRows: number;
  chunks: Map<number, OrderChunk[]>;
  bytes: number;
  pins: number;
  lastUsed: number;
  dropped: boolean;
}

export interface OrderCacheOptions {
  dir: string;
  maxBytes: number;
  ttlMs: number;
  now?: () => number;
}

/** TTL bawaan entri (rencana G-6 §5.2). */
export const ORDER_CACHE_TTL_MS = 30 * 60 * 1000;

const fileBytes = (f: string) => {
  try {
    return statSync(f).size;
  } catch {
    return 0;
  }
};

export class OrderCache {
  private readonly entries = new Map<string, OrderEntry>();
  /** Pekerjaan yang sedang berjalan per kunci (perm) atau kunci+potongan (single-flight). */
  private readonly jobs = new Map<string, Promise<unknown>>();
  private used = 0;
  private seq = 0;
  private readonly now: () => number;

  constructor(readonly o: OrderCacheOptions) {
    this.now = o.now ?? Date.now;
    rmSync(o.dir, { recursive: true, force: true });
    mkdirSync(o.dir, { recursive: true });
  }

  /** Total byte berkas yang tercatat. */
  get bytes() {
    return this.used;
  }

  get size() {
    return this.entries.size;
  }

  /** Ada pembangunan permutasi yang sedang berjalan (dibatasi satu per proses). */
  get buildingPerm() {
    for (const k of this.jobs.keys()) if (!k.includes("#")) return true;
    return false;
  }

  /** Entri siap untuk kunci ini (TTL diperiksa, waktu pakai diperbarui) atau null. */
  lookup(key: string): OrderEntry | null {
    this.sweep();
    const e = this.entries.get(key);
    if (!e) return null;
    e.lastUsed = this.now();
    return e;
  }

  /** Sedang dibangun (perm) untuk kunci ini. */
  pending(key: string) {
    return this.jobs.has(key);
  }

  /**
   * Buang entri sheet ini yang versi atau revisi skemanya berbeda dengan yang sedang dilayani
   * (versi/revisi berganti). `versionId` null = sheet tidak lagi bisa dilayani → buang semua entrinya.
   */
  invalidate(sheetId: string, versionId: string | null, schemaRevision?: number) {
    for (const e of [...this.entries.values()]) {
      if (e.meta.sheetId !== sheetId) continue;
      if (versionId === null || e.meta.versionId !== versionId) this.drop(e);
      else if (schemaRevision !== undefined && e.meta.schemaRevision !== schemaRevision) {
        this.drop(e);
      }
    }
  }

  /** Data dihapus: buang entri yang dibangun dari file typed ini. */
  forget(typedKeys: string[]) {
    const gone = new Set(typedKeys);
    for (const e of [...this.entries.values()]) {
      if (e.meta.typedKeys.some((k) => gone.has(k))) this.drop(e);
    }
  }

  /**
   * Bangun permutasi untuk `key` (single-flight): `build(file)` menulis perm.parquet dan mengembalikan
   * jumlah baris + total; null = jangan simpan. Galat → entri tidak dibuat (dilempar ke pemanggil).
   */
  buildPerm(
    key: string,
    meta: OrderMeta,
    chunkRows: number,
    build: (file: string) => Promise<{ rows: number; total: number } | null>,
  ): Promise<OrderEntry | null> {
    const running = this.jobs.get(key) as Promise<OrderEntry | null> | undefined;
    if (running) return running;
    const job = (async () => {
      const dir = join(this.o.dir, `${key.slice(0, 32)}-${++this.seq}`);
      mkdirSync(dir, { recursive: true });
      const perm = join(dir, "perm.parquet");
      let r: { rows: number; total: number } | null = null;
      try {
        r = await build(perm);
      } finally {
        if (!r) rmSync(dir, { recursive: true, force: true });
      }
      if (!r) return null;
      const bytes = fileBytes(perm);
      // Lebih besar dari seluruh anggaran: tidak disimpan.
      if (bytes > this.o.maxBytes) {
        rmSync(dir, { recursive: true, force: true });
        return null;
      }
      const old = this.entries.get(key);
      if (old) this.drop(old);
      const e: OrderEntry = {
        key,
        meta,
        dir,
        perm,
        rows: r.rows,
        total: r.total,
        chunkRows,
        chunks: new Map(),
        bytes,
        pins: 0,
        lastUsed: this.now(),
        dropped: false,
      };
      this.entries.set(key, e);
      this.used += bytes;
      this.evict();
      return e.dropped ? null : e;
    })();
    this.jobs.set(key, job);
    const clear = () => {
      if (this.jobs.get(key) === job) this.jobs.delete(key);
    };
    job.then(clear, clear);
    return job;
  }

  /** Potongan `k` yang memuat semua kolom `cols` (posisi), dipin untuk pemanggil (`unpin`), atau null. */
  chunk(e: OrderEntry, k: number, cols: number[]): OrderChunk | null {
    const c = (e.chunks.get(k) ?? []).find((x) => cols.every((p) => x.cols.includes(p)));
    if (!c) return null;
    c.lastUsed = this.now();
    c.pins++;
    return c;
  }

  /**
   * Bangun potongan `k` dengan kolom `cols` (single-flight per entri+potongan+kolom). Hasil dipin untuk
   * pemanggil; panggil `unpin` setelah dibaca. Entri dibuang selagi membangun → file dihapus, null.
   */
  async buildChunk(
    e: OrderEntry,
    k: number,
    cols: number[],
    build: (file: string) => Promise<void>,
  ): Promise<OrderChunk | null> {
    const sorted = [...new Set(cols)].sort((a, b) => a - b);
    const jobKey = `${e.key}#${k}#${sorted.join(",")}`;
    let job = this.jobs.get(jobKey) as Promise<OrderChunk | null> | undefined;
    if (!job) {
      job = (async () => {
        const file = join(e.dir, `chunk-${k}-${++this.seq}.parquet`);
        try {
          await build(file);
        } catch (err) {
          rmSync(file, { force: true });
          throw err;
        }
        if (e.dropped) {
          rmSync(file, { force: true });
          return null;
        }
        const c: OrderChunk = {
          file,
          bytes: fileBytes(file),
          cols: sorted,
          pins: 0,
          lastUsed: this.now(),
        };
        e.chunks.set(k, [...(e.chunks.get(k) ?? []), c]);
        e.bytes += c.bytes;
        this.used += c.bytes;
        return c;
      })();
      this.jobs.set(jobKey, job);
      const clear = () => {
        if (this.jobs.get(jobKey) === job) this.jobs.delete(jobKey);
      };
      job.then(clear, clear);
    }
    const c = await job;
    if (!c || e.dropped || !(e.chunks.get(k) ?? []).includes(c)) return null;
    c.pins++;
    // Pin dulu, baru buang yang lain: potongan yang baru dibangun tidak ikut terbuang.
    this.evict();
    return c;
  }

  /**
   * Pegang entri selama dibaca: tidak dibuang LRU/TTL; bila dibuang karena invalidasi, berkasnya
   * dihapus setelah pin terakhir dilepas. Fungsi yang dikembalikan melepas pin (sekali).
   */
  pin(e: OrderEntry): () => void {
    e.pins++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      e.pins--;
      if (e.dropped && e.pins === 0) rmSync(e.dir, { recursive: true, force: true });
      else this.evict();
    };
  }

  unpin(c: OrderChunk) {
    c.pins = Math.max(0, c.pins - 1);
  }

  /** Tunggu semua pekerjaan berjalan selesai (uji, perf). */
  async idle() {
    while (this.jobs.size) await Promise.allSettled([...this.jobs.values()]);
  }

  /** Buang entri yang tidak dipakai > ttlMs (yang sedang dibaca menunggu dilepas). */
  sweep() {
    const t = this.now();
    for (const e of [...this.entries.values()]) {
      if (e.pins === 0 && t - e.lastUsed > this.o.ttlMs) this.drop(e);
    }
  }

  /** Buang semua entri (penutupan proses, uji). */
  clear() {
    for (const e of [...this.entries.values()]) this.drop(e);
  }

  private drop(e: OrderEntry) {
    if (this.entries.get(e.key) === e) this.entries.delete(e.key);
    if (e.dropped) return;
    e.dropped = true;
    this.used -= e.bytes;
    // Yang sedang dibaca: berkas dihapus setelah pin terakhir dilepas.
    if (e.pins === 0) rmSync(e.dir, { recursive: true, force: true });
  }

  /**
   * Di atas anggaran: buang entri LRU yang tidak sedang dibaca; bila masih di atas (entri yang dibaca
   * besar), buang potongan LRU tanpa pin di entri mana pun.
   */
  private evict() {
    if (this.used <= this.o.maxBytes) return;
    const lru = [...this.entries.values()].sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of lru) {
      if (this.used <= this.o.maxBytes) return;
      if (e.pins === 0) this.drop(e);
    }
    const chunks = [...this.entries.values()]
      .flatMap((e) => [...e.chunks.entries()].flatMap(([k, cs]) => cs.map((c) => ({ e, k, c }))))
      .filter(({ c }) => c.pins === 0)
      .sort((a, b) => a.c.lastUsed - b.c.lastUsed);
    for (const { e, k, c } of chunks) {
      if (this.used <= this.o.maxBytes) return;
      const left = (e.chunks.get(k) ?? []).filter((x) => x !== c);
      if (left.length) e.chunks.set(k, left);
      else e.chunks.delete(k);
      e.bytes -= c.bytes;
      this.used -= c.bytes;
      // Entri yang sedang dibaca bisa sedang memakai potongan lain; potongan ini tidak dipin.
      rmSync(c.file, { force: true });
    }
  }
}
