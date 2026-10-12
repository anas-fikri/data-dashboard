/*
 * Cache lokal typed.parquet untuk mesin query aplikasi (T-009). File typed tidak pernah berubah
 * (kunci baru per revisi), jadi cache hanya perlu LRU berdasarkan byte:
 *  - unduhan bersamaan untuk kunci yang sama digabung; file ditulis ke tmp lalu rename (tidak pernah
 *    ada file setengah jadi di nama final); unduhan dibatasi waktu (stream S3 macet tidak mengunci
 *    kunci itu selamanya);
 *  - unduhan punya pembatas sendiri, terpisah dari slot query (review T-009 N2): ≤ maxDownloads
 *    berjalan bersamaan dan ≤ perOwnerDownloads yang dimulai satu user. Pemanggil menunggu paling
 *    lama waitMs; lewat itu DownloadPendingError, sedangkan unduhan berlanjut di background dan
 *    permintaan berikutnya memakai hasilnya;
 *  - ruang dipesan sebelum mengunduh (ukuran dari HEAD): total file + pesanan ≤ maxBytes; yang paling
 *    lama tidak dipakai dibuang lebih dulu; yang sedang dipakai query (refs > 0) tidak pernah dibuang —
 *    bila tidak ada ruang → CacheFullError (pemanggil menjawab "sibuk");
 *  - satu file lebih besar dari maxBytes tetap bisa dipakai (diunduh, dipakai, dihapus setelah selesai);
 *  - file yang tidak dipakai > idleMs dibuang; forget() menghapus file data yang sudah dihapus dan
 *    membatalkan unduhannya yang masih berjalan (review T-009 F12, N3).
 * Proses aplikasi tunggal per direktori cache (QUERY_CACHE_DIR per replika). forget() hanya menjangkau
 * proses yang menghapus; replika lain membuang salinannya lewat idleMs (data yang dihapus tidak pernah
 * dibaca lagi).
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

interface Job {
  ctl: AbortController;
  done: Promise<Entry>;
}

export interface ParquetLease {
  path: string;
  release(): void;
}

export interface AcquireOptions {
  /** User yang meminta: membatasi unduhan yang ia mulai (perOwnerDownloads). */
  owner?: string;
  /** Lama menunggu file yang sedang disiapkan; lewat → DownloadPendingError (unduhan berlanjut). */
  waitMs?: number;
}

export class CacheFullError extends Error {
  constructor() {
    super("cache parquet lokal penuh oleh file yang sedang dipakai");
    this.name = "CacheFullError";
  }
}

export class DownloadPendingError extends Error {
  constructor() {
    super("file parquet sedang disiapkan");
    this.name = "DownloadPendingError";
  }
}

export class ForgottenError extends Error {
  constructor() {
    super("data sudah dihapus");
    this.name = "ForgottenError";
  }
}

export interface ParquetCacheOptions {
  dir: string;
  maxBytes: number;
  download(key: string, dest: string, signal: AbortSignal): Promise<void>;
  /** Ukuran objek sebelum diunduh (memesan ruang); tanpa ini ruang dicek setelah unduhan selesai. */
  sizeOf?(key: string, signal: AbortSignal): Promise<number>;
  /** Batas waktu satu unduhan sejak mulai berjalan (default 10 menit). */
  downloadTimeoutMs?: number;
  /** File yang tidak dipakai lebih lama dari ini dibuang (default 3 hari). */
  idleMs?: number;
  /** Unduhan berjalan bersamaan di proses ini (default 2); sisanya antre. */
  maxDownloads?: number;
  /** Unduhan yang boleh dimulai satu owner sekaligus (default 1); lebih → DownloadPendingError. */
  perOwnerDownloads?: number;
}

export class ParquetCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Job>();
  /** Nama file yang di-forget saat unduhannya berjalan. */
  private readonly forgotten = new Set<string>();
  private readonly owners = new Map<string, number>();
  private downloading = 0;
  private readonly downloadQueue: (() => void)[] = [];
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

  /** Unduhan yang sedang berjalan (bukan yang antre). */
  get activeDownloads(): number {
    return this.downloading;
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
  async acquire(key: string, opts: AcquireOptions = {}): Promise<ParquetLease> {
    const name = this.nameOf(key);
    let e = this.entries.get(name);
    if (!e) {
      const job = this.pending.get(name) ?? this.start(name, key, opts.owner);
      e = await this.wait(job.done, opts.waitMs);
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
    const job = this.pending.get(name);
    if (job) {
      this.forgotten.add(name);
      job.ctl.abort();
    }
    const e = this.entries.get(name);
    if (!e) return;
    if (e.refs === 0) this.drop(name, e);
    else e.transient = true;
  }

  private start(name: string, key: string, owner?: string): Job {
    if (owner !== undefined) {
      const n = this.owners.get(owner) ?? 0;
      if (n >= (this.o.perOwnerDownloads ?? 1)) throw new DownloadPendingError();
      this.owners.set(owner, n + 1);
    }
    const ctl = new AbortController();
    const done = this.fetch(name, key, ctl).finally(() => {
      this.pending.delete(name);
      this.forgotten.delete(name);
      if (owner !== undefined) {
        const n = (this.owners.get(owner) ?? 1) - 1;
        if (n <= 0) this.owners.delete(owner);
        else this.owners.set(owner, n);
      }
    });
    // Unduhan berlanjut walau semua penunggu sudah menyerah (waitMs): kegagalannya tidak boleh
    // menjadi unhandled rejection, dan file sementara (> maxBytes) tanpa pemakai langsung dibuang.
    // setImmediate berjalan setelah semua penunggu yang masih ada sempat menaikkan refs.
    done.then(
      (e) =>
        setImmediate(() => {
          if (e.transient && e.refs === 0 && this.entries.get(name) === e) this.drop(name, e);
        }),
      () => {},
    );
    const job: Job = { ctl, done };
    this.pending.set(name, job);
    return job;
  }

  private async wait(done: Promise<Entry>, waitMs?: number): Promise<Entry> {
    if (waitMs === undefined) return done;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        done,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new DownloadPendingError()), waitMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Izin unduh (≤ maxDownloads). Izin diserahkan langsung ke antrean berikutnya saat dilepas. */
  private async permit(signal: AbortSignal): Promise<() => void> {
    if (this.downloading < (this.o.maxDownloads ?? 2)) {
      this.downloading++;
    } else {
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const i = this.downloadQueue.indexOf(wake);
          if (i >= 0) this.downloadQueue.splice(i, 1);
          reject(new Error("aborted"));
        };
        if (signal.aborted) return onAbort();
        this.downloadQueue.push(wake);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.downloadQueue.shift();
      if (next) next();
      else this.downloading--;
    };
  }

  private drop(name: string, e: Entry) {
    this.entries.delete(name);
    rmSync(e.file, { force: true });
  }

  private async fetch(name: string, key: string, ctl: AbortController): Promise<Entry> {
    const tmp = join(this.o.dir, `tmp-${randomBytes(8).toString("hex")}.parquet`);
    let hold = 0;
    let timer: NodeJS.Timeout | undefined;
    let release: (() => void) | undefined;
    try {
      release = await this.permit(ctl.signal);
      timer = setTimeout(() => ctl.abort(), this.o.downloadTimeoutMs ?? 10 * 60 * 1000);
      if (this.o.sizeOf) {
        const size = await this.o.sizeOf(key, ctl.signal);
        if (size <= this.o.maxBytes) {
          if (!this.evict(size)) throw new CacheFullError();
          hold = size;
          this.reserved += size;
        }
      }
      await this.o.download(key, tmp, ctl.signal);
      if (this.forgotten.has(name)) throw new ForgottenError();
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
      if (this.forgotten.has(name)) throw new ForgottenError();
      throw err;
    } finally {
      clearTimeout(timer);
      release?.();
      this.reserved -= hold;
    }
  }

  /**
   * Buang file menganggur > idleMs, lalu file paling lama tidak dipakai (refs 0) sampai total +
   * pesanan + `need` ≤ maxBytes. false = tidak bisa (semua sisa sedang dipakai).
   */
  private evict(need: number, keep?: Entry): boolean {
    const idleBefore = Date.now() - (this.o.idleMs ?? 3 * 24 * 60 * 60 * 1000);
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
