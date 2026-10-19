/*
 * Pemanasan cache parquet lokal app saat versi baru aktif (T-pvq8). Muat dashboard pertama setelah
 * ingest dulu menunggu unduhan typed.parquet ke cache app (T-024: xlsx 3 sheet ± 600 MB → 109 s di
 * HDD). Worker (ingest, pemetaan) dan app (rollback) mengumumkan id versi di kanal Redis
 * VERSION_ACTIVATED_CHANNEL setelah commit; setiap proses app mengunduh file versi itu ke cache-nya
 * sendiri di background (warm-runtime.ts). Aturan:
 *  - hanya versi yang SEDANG aktif, dibaca ulang dari DB saat gilirannya tiba dan sebelum setiap unduhan
 *    (rollback, hapus dataset, atau koreksi skema di tengah jalan menghentikan/melewati file lama);
 *    kunci = Sheet.typedKey persis seperti query, jadi nama file cache sama dan query yang datang saat
 *    pemanasan berjalan menunggu unduhan yang sama (tidak mengunduh dua kali);
 *  - pemicu ganda untuk versi yang sedang antre/berjalan memakai janji yang sama;
 *  - berurutan: satu versi dan satu file sekaligus per proses, jadi pemanasan memakai paling banyak satu
 *    slot unduhan cache (maxDownloads) dan sisanya tetap untuk query user; antrean ≤ MAX_QUEUED versi;
 *  - batas PER VERSI: total ≤ separuh maxBytes cache, file yang tidak muat dilewati. Satu versi tidak
 *    pernah menggeser lebih dari separuh cache dan tidak mengunduh file sementara (> maxBytes) yang
 *    langsung dibuang lagi; beberapa versi berturut-turut tunduk pada LRU biasa seperti unduhan query
 *    (yang paling lama tidak dipakai dibuang lebih dulu, yang sedang dipakai query tidak pernah);
 *  - setiap panggilan DB/storage dibatasi STEP_TIMEOUT_MS dan satu versi RUN_TIMEOUT_MS: dependensi yang
 *    menggantung dicatat dan antrean lanjut ke versi berikutnya;
 *  - gagal (cache penuh, storage, data dihapus) hanya dicatat di log dan tidak pernah melempar:
 *    aktivasi sudah commit, query pertama mengunduh sendiri seperti sebelumnya.
 */

export const VERSION_ACTIVATED_CHANNEL = "dataset:version-activated";
/** Versi yang boleh menunggu giliran pemanasan (termasuk yang berjalan); lebih → dilewati. */
export const MAX_QUEUED = 8;
/** Batas satu panggilan DB/storage (baca versi aktif, HEAD). */
export const STEP_TIMEOUT_MS = 30_000;
/** Batas satu versi; unduhan satu file sendiri dibatasi 10 menit oleh cache (downloadTimeoutMs). */
export const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export interface WarmLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface WarmCache {
  readonly maxBytes: number;
  acquire(key: string): Promise<{ release(): void }>;
  /** File sudah ada di cache (T-037): dilewati tanpa HEAD dan tanpa memakai anggaran versi. */
  has?(key: string): boolean;
}

export interface WarmDeps {
  /** typedKey sheet versi ini (urut sheet) bila versi itu READY dan aktif; null = tidak aktif. */
  activeKeys(versionId: string): Promise<string[] | null>;
  cache(): WarmCache;
  /** Ukuran objek di storage (HEAD); `signal` membatalkan permintaan yang lewat batas waktu. */
  sizeOf(key: string, signal: AbortSignal): Promise<number>;
  log: WarmLog;
}

export interface WarmOptions {
  stepTimeoutMs?: number;
  runTimeoutMs?: number;
}

export interface Warmer {
  /** Panaskan versi; selesai setelah gilirannya selesai. Tidak pernah melempar. */
  warm(versionId: string): Promise<void>;
}

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Tolak saat `signal` berakhir lebih dulu: dependensi yang mengabaikan signal pun tidak ditunggu. */
function until<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) onAbort();
  });
}

export function createWarmer(deps: WarmDeps, opts: WarmOptions = {}): Warmer {
  const stepMs = opts.stepTimeoutMs ?? STEP_TIMEOUT_MS;
  const runMs = opts.runTimeoutMs ?? RUN_TIMEOUT_MS;
  const jobs = new Map<string, Promise<void>>();
  let tail: Promise<void> = Promise.resolve();

  const run = async (versionId: string) => {
    const t0 = Date.now();
    const deadline = AbortSignal.timeout(runMs);
    const step = <T>(fn: (signal: AbortSignal) => Promise<T>) => {
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(stepMs)]);
      return until(fn(signal), signal);
    };
    let files = 0;
    let bytes = 0;
    let skipped = 0;
    let cached = 0;
    try {
      const keys = await step(() => deps.activeKeys(versionId));
      if (!keys) {
        deps.log.info({ versionId }, "pemanasan cache parquet dilewati: versi tidak aktif");
        return;
      }
      const cache = deps.cache();
      let budget = Math.floor(cache.maxBytes / 2);
      for (const key of keys) {
        // Segmen lama sheet periode sudah di cache: hanya segmen baru yang diunduh (T-037 AC 4). File
        // yang ada tetap disentuh (sewa + lepas, tanpa unduh/HEAD/anggaran) agar tidak paling dulu
        // tergusur LRU oleh unduhan segmen barunya.
        if (cache.has?.(key)) {
          (await cache.acquire(key)).release();
          cached++;
          continue;
        }
        const size = await step((signal) => deps.sizeOf(key, signal));
        if (size > budget) {
          skipped++;
          continue;
        }
        // Dicek lagi tepat sebelum mengunduh: versi yang di-rollback/dihapus tidak diunduh lagi.
        const current = await step(() => deps.activeKeys(versionId));
        if (!current) {
          deps.log.info(
            { versionId, files },
            "pemanasan cache parquet dihentikan: versi tidak aktif lagi",
          );
          return;
        }
        if (!current.includes(key)) {
          skipped++;
          continue;
        }
        budget -= size;
        const lease = cache.acquire(key);
        try {
          (await until(lease, deadline)).release();
        } catch (e) {
          // Lewat batas versi: unduhan berlanjut di cache; sewa yang datang terlambat tetap dilepas.
          lease.then(
            (l) => l.release(),
            () => {},
          );
          throw e;
        }
        files++;
        bytes += size;
      }
      deps.log.info(
        { versionId, files, bytes, skipped, cached, ms: Date.now() - t0 },
        "cache parquet versi aktif dipanaskan",
      );
    } catch (e) {
      deps.log.warn(
        { versionId, files, ms: Date.now() - t0, err: errText(e) },
        "pemanasan cache parquet gagal; query pertama mengunduh sendiri",
      );
    }
  };

  return {
    warm(versionId) {
      const queued = jobs.get(versionId);
      if (queued) return queued;
      if (jobs.size >= MAX_QUEUED) {
        deps.log.warn({ versionId }, "pemanasan cache parquet dilewati: antrean penuh");
        return Promise.resolve();
      }
      const job = tail.then(() => run(versionId)).finally(() => jobs.delete(versionId));
      jobs.set(versionId, job);
      tail = job;
      return job;
    },
  };
}

/** Selama Redis mati, galat koneksi dicatat paling banyak sekali per selang ini. */
export const REDIS_WARN_EVERY_MS = 60_000;

interface RedisEvents {
  on(event: "error", listener: (e: Error) => void): unknown;
  on(event: "ready", listener: () => void): unknown;
}

/**
 * Catat galat koneksi Redis tanpa membanjiri log saat Redis mati (ioredis mencoba lagi tiap ≤ 5 s):
 * galat pertama, lalu paling banyak sekali per `everyMs`, dan sekali saat pulih.
 */
export function watchRedis(
  conn: RedisEvents,
  log: WarmLog,
  label: string,
  everyMs = REDIS_WARN_EVERY_MS,
): void {
  let down = false;
  let warnedAt = 0;
  conn.on("error", (e) => {
    const now = Date.now();
    if (!down || now - warnedAt >= everyMs) {
      log.warn({ err: e.message }, `${label}: koneksi gagal`);
      warnedAt = now;
    }
    down = true;
  });
  conn.on("ready", () => {
    if (down) log.info({}, `${label}: koneksi pulih`);
    down = false;
  });
}

interface Publisher {
  publish(channel: string, message: string): Promise<unknown>;
}

/**
 * Umumkan versi yang baru aktif ke semua proses app (dipanggil setelah commit aktivasi). Tidak pernah
 * melempar: gagal hanya dicatat, query pertama mengunduh sendiri.
 */
export async function announceVersionActivated(
  publisher: Publisher | Promise<Publisher>,
  versionId: string,
  log: WarmLog,
): Promise<void> {
  try {
    await (await publisher).publish(VERSION_ACTIVATED_CHANNEL, versionId);
  } catch (e) {
    log.warn(
      { versionId, err: errText(e) },
      "pengumuman versi aktif gagal; cache parquet tidak dipanaskan",
    );
  }
}
