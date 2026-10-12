/*
 * Cache lokal typed.parquet untuk mesin query aplikasi (T-009). File typed tidak pernah berubah
 * (kunci baru per revisi), jadi cache hanya perlu LRU berdasarkan byte:
 *  - unduhan bersamaan untuk kunci yang sama digabung; file ditulis ke tmp lalu rename (tidak pernah
 *    ada file setengah jadi di nama final); unduhan dibatasi waktu (stream S3 macet tidak mengunci
 *    kunci itu selamanya);
 *  - ruang dipesan sebelum mengunduh (ukuran dari HEAD): total file + pesanan ≤ maxBytes; yang paling
 *    lama tidak dipakai dibuang lebih dulu; yang sedang dipakai query (refs > 0) tidak pernah dibuang —
 *    bila tidak ada ruang → CacheFullError (pemanggil menjawab "sibuk");
 *  - satu file lebih besar dari maxBytes tetap bisa dipakai (diunduh, dipakai, dihapus setelah selesai);
 *  - file yang tidak dipakai > idleMs dibuang, dan forget() menghapus file data yang sudah dihapus
 *    (review T-009 F12).
 * Proses aplikasi tunggal per direktori cache (QUERY_CACHE_DIR per replika).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

interface Entry {
  file: string;
  bytes: number;
  lastUsed: number;
  refs: number;
  /** Lebih besar dari maxBytes atau sudah di-forget: dihapus saat tidak dipakai lagi. */
  transient: boolean;
}

export interface ParquetLease {
  path: string;
  release(): void;
}

export class CacheFullError extends Error {
  constructor() {
    super("cache parquet lokal penuh oleh file yang sedang dipakai");
    this.name = "CacheFullError";
  }
}

export interface ParquetCacheOptions {
  dir: string;
  maxBytes: number;
  download(key: string, dest: string, signal: AbortSignal): Promise<void>;
  /** Ukuran objek sebelum diunduh (memesan ruang); tanpa ini ruang dicek setelah unduhan selesai. */
  sizeOf?(key: string, signal: AbortSignal): Promise<number>;
  /** Batas waktu satu unduhan (default 10 menit). */
  downloadTimeoutMs?: number;
  /** File yang tidak dipakai lebih lama dari ini dibuang (default 7 hari). */
  idleMs?: number;
}

export class ParquetCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Entry>>();
  private reserved = 0;
  private clock = 0;
  readonly dir: string;
  readonly maxBytes: number;

  constructor(private readonly o: ParquetCacheOptions) {
    this.dir = o.dir;
    this.maxBytes = o.maxBytes;
    mkdirSync(o.dir, { recursive: true });
    // File dari proses sebelumnya tetap dipakai (nama = hash kunci); sisa unduhan setengah jadi dibuang.
    for (const name of readdirSync(o.dir)) {
      const path = join(o.dir, name);
      if (name.endsWith(".parquet") && !name.startsWith("tmp-")) {
        const st = statSync(path);
        this.entries.set(name, {
          file: path,
          bytes: st.size,
          lastUsed: st.mtimeMs,
          refs: 0,
          transient: false,
        });
      } else {
        rmSync(path, { recursive: true, force: true });
      }
    }
    this.evict(0);
  }

  /** Byte file yang tersimpan (tanpa file sementara) — selalu ≤ maxBytes kecuali sedang dipakai. */
  get totalBytes(): number {
    let n = 0;
    for (const e of this.entries.values()) if (!e.transient) n += e.bytes;
    return n;
  }

  private nameOf(key: string) {
    return `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.parquet`;
  }

  private touch(e: Entry) {
    // Waktu monoton agar urutan LRU tidak seri dalam milidetik yang sama.
    e.lastUsed = Math.max(Date.now(), this.clock + 1);
    this.clock = e.lastUsed;
  }

  /** Pastikan file `key` ada di disk lokal; panggil release() setelah query selesai. */
  async acquire(key: string): Promise<ParquetLease> {
    const name = this.nameOf(key);
    let e = this.entries.get(name);
    if (!e) {
      let p = this.pending.get(name);
      if (!p) {
        p = this.fetch(name, key).finally(() => this.pending.delete(name));
        this.pending.set(name, p);
      }
      e = await p;
    }
    e.refs++;
    this.touch(e);
    let released = false;
    const entry = e;
    return {
      path: entry.file,
      release: () => {
        if (released) return;
        released = true;
        entry.refs--;
        if (entry.refs === 0 && entry.transient) this.drop(name, entry);
        this.evict(0);
      },
    };
  }

  /** Hapus file `key` (data dihapus): segera bila tidak dipakai, selain itu setelah query selesai. */
  forget(key: string) {
    const name = this.nameOf(key);
    const e = this.entries.get(name);
    if (!e) return;
    if (e.refs === 0) this.drop(name, e);
    else e.transient = true;
  }

  private drop(name: string, e: Entry) {
    this.entries.delete(name);
    rmSync(e.file, { force: true });
  }

  private async fetch(name: string, key: string): Promise<Entry> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.o.downloadTimeoutMs ?? 10 * 60 * 1000);
    const tmp = join(this.o.dir, `tmp-${randomBytes(8).toString("hex")}.parquet`);
    let hold = 0;
    try {
      if (this.o.sizeOf) {
        const size = await this.o.sizeOf(key, ctl.signal);
        if (size <= this.o.maxBytes) {
          if (!this.evict(size)) throw new CacheFullError();
          hold = size;
          this.reserved += size;
        }
      }
      await this.o.download(key, tmp, ctl.signal);
      const bytes = statSync(tmp).size;
      const file = join(this.o.dir, name);
      renameSync(tmp, file);
      const e: Entry = { file, bytes, lastUsed: 0, refs: 0, transient: bytes > this.o.maxBytes };
      this.touch(e);
      this.reserved -= hold;
      hold = 0;
      this.entries.set(name, e);
      this.evict(0, e);
      return e;
    } catch (err) {
      rmSync(tmp, { force: true });
      throw err;
    } finally {
      clearTimeout(timer);
      this.reserved -= hold;
    }
  }

  /**
   * Buang file menganggur > idleMs, lalu file paling lama tidak dipakai (refs 0) sampai total +
   * pesanan + `need` ≤ maxBytes. false = tidak bisa (semua sisa sedang dipakai).
   */
  private evict(need: number, keep?: Entry): boolean {
    const idleBefore = Date.now() - (this.o.idleMs ?? 7 * 24 * 60 * 60 * 1000);
    for (const [name, e] of this.entries) {
      if (e.refs === 0 && e !== keep && e.lastUsed < idleBefore) this.drop(name, e);
    }
    while (this.totalBytes + this.reserved + need > this.o.maxBytes) {
      let victim: [string, Entry] | null = null;
      for (const kv of this.entries) {
        const e = kv[1];
        if (e.refs > 0 || e === keep || e.transient) continue;
        if (!victim || e.lastUsed < victim[1].lastUsed) victim = kv;
      }
      if (!victim) return false; // semua sedang dipakai; dicoba lagi saat release
      this.drop(victim[0], victim[1]);
    }
    return true;
  }
}
