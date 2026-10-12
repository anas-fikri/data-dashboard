/*
 * Cache lokal typed.parquet untuk mesin query aplikasi (T-009). File typed tidak pernah berubah
 * (kunci baru per revisi), jadi cache hanya perlu LRU berdasarkan byte:
 *  - unduhan bersamaan untuk kunci yang sama digabung; file ditulis ke tmp lalu rename (tidak pernah
 *    ada file setengah jadi di nama final);
 *  - total byte ≤ maxBytes: file paling lama tidak dipakai dibuang lebih dulu, yang sedang dipakai
 *    query (refs > 0) tidak pernah dibuang;
 *  - satu file lebih besar dari maxBytes tetap bisa dipakai (diunduh, dipakai, dihapus setelah selesai).
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
  /** Lebih besar dari maxBytes: dihapus saat tidak dipakai lagi. */
  transient: boolean;
}

export interface ParquetLease {
  path: string;
  release(): void;
}

export class ParquetCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Entry>>();
  private clock = 0;

  constructor(
    readonly dir: string,
    readonly maxBytes: number,
    private readonly download: (key: string, dest: string) => Promise<void>,
  ) {
    mkdirSync(dir, { recursive: true });
    // File dari proses sebelumnya tetap dipakai (nama = hash kunci); sisa unduhan setengah jadi dibuang.
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
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
    this.evict();
  }

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
        if (entry.refs === 0 && entry.transient) {
          this.entries.delete(name);
          rmSync(entry.file, { force: true });
        }
        this.evict();
      },
    };
  }

  private async fetch(name: string, key: string): Promise<Entry> {
    const tmp = join(this.dir, `tmp-${randomBytes(8).toString("hex")}.parquet`);
    try {
      await this.download(key, tmp);
      const bytes = statSync(tmp).size;
      const file = join(this.dir, name);
      renameSync(tmp, file);
      const e: Entry = { file, bytes, lastUsed: 0, refs: 0, transient: bytes > this.maxBytes };
      this.touch(e);
      this.entries.set(name, e);
      this.evict(e);
      return e;
    } catch (err) {
      rmSync(tmp, { force: true });
      throw err;
    }
  }

  /** Buang file paling lama tidak dipakai (refs 0) sampai total ≤ maxBytes. */
  private evict(keep?: Entry) {
    while (this.totalBytes > this.maxBytes) {
      let victim: [string, Entry] | null = null;
      for (const kv of this.entries) {
        const e = kv[1];
        if (e.refs > 0 || e === keep || e.transient) continue;
        if (!victim || e.lastUsed < victim[1].lastUsed) victim = kv;
      }
      if (!victim) return; // semua sedang dipakai; dicoba lagi saat release
      this.entries.delete(victim[0]);
      rmSync(victim[1].file, { force: true });
    }
  }
}
