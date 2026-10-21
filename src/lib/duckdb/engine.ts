/*
 * Mesin query DuckDB di proses aplikasi (T-009, alur B4). Satu instance per proses, dikunci:
 * tanpa unduh/muat ekstensi, akses file hanya ke direktori cache parquet dan temp
 * (enable_external_access=false + allowed_directories), lalu lock_configuration sehingga query tidak
 * bisa mengubahnya. Satu koneksi per query; slot global dan per user; timeout → interrupt.
 */
import type { DuckDBValue } from "@duckdb/node-api";
import { mkdirSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";
import { lit } from "./index";

export class QueryTimeoutError extends Error {
  constructor() {
    super("query melebihi batas waktu");
    this.name = "QueryTimeoutError";
  }
}

export class QueryBusyError extends Error {
  constructor() {
    super("slot query penuh");
    this.name = "QueryBusyError";
  }
}

export interface EngineOptions {
  /** Direktori yang boleh dibaca (cache parquet lokal). */
  dataDir: string;
  tmpDir: string;
  /** Direktori lain yang boleh dibaca/ditulis (cache urutan "Lihat data", T-062). */
  extraDirs?: string[];
  memoryLimit: string;
  threads: number;
  maxTempSize: string;
  /** Query bersamaan di seluruh proses. */
  maxConcurrency: number;
  /** Query bersamaan per user; sisanya antre di belakang query user itu sendiri. */
  perUser: number;
  /** Lama menunggu slot (per user, lalu global) sebelum QueryBusyError. */
  queueWaitMs: number;
}

export interface EngineResult {
  columns: string[];
  rows: unknown[][];
}

/** Permintaan yang boleh antre per user di atas jatahnya (lebih → QueryBusyError langsung). */
export const USER_QUEUE_MAX = 8;

export class QueryEngine {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly perUser = new Map<string, number>();
  private readonly userWaiters = new Map<string, (() => void)[]>();

  private constructor(
    private readonly db: DuckDBInstance,
    private readonly o: EngineOptions,
  ) {}

  static async create(o: EngineOptions): Promise<QueryEngine> {
    mkdirSync(o.dataDir, { recursive: true });
    mkdirSync(o.tmpDir, { recursive: true });
    for (const d of o.extraDirs ?? []) mkdirSync(d, { recursive: true });
    const db = await DuckDBInstance.create(":memory:", {
      memory_limit: o.memoryLimit,
      threads: String(o.threads),
      temp_directory: o.tmpDir,
      max_temp_directory_size: o.maxTempSize,
      autoinstall_known_extensions: "false",
      autoload_known_extensions: "false",
    });
    try {
      const conn = await db.connect();
      try {
        const dirs = [o.dataDir, o.tmpDir, ...(o.extraDirs ?? [])].map((d) =>
          lit(d.endsWith("/") ? d : `${d}/`),
        );
        await conn.run(`SET allowed_directories = [${dirs.join(", ")}]`);
        await conn.run("SET enable_external_access = false");
        await conn.run("SET lock_configuration = true");
      } finally {
        conn.closeSync();
      }
    } catch (e) {
      db.closeSync(); // instance setengah jadi tidak boleh tertinggal (review T-009 F10)
      throw e;
    }
    return new QueryEngine(db, o);
  }

  /**
   * Jatah per user. Penuh → antre di belakang query user itu sendiri (dashboard dengan banyak widget,
   * atau dua tab, dilayani berurutan alih-alih ditolak) tanpa pernah memegang lebih dari perUser slot
   * (review T-009 F2). Antrean dibatasi USER_QUEUE_MAX; lebih dari itu langsung QueryBusyError
   * (review T-011 M2). Slot yang dilepas diserahkan langsung ke penunggu berikutnya.
   */
  private async userSlot(userId: string, waitMs: number): Promise<void> {
    const mine = this.perUser.get(userId) ?? 0;
    if (mine < this.o.perUser) {
      this.perUser.set(userId, mine + 1);
      return;
    }
    const list = this.userWaiters.get(userId) ?? [];
    if (list.length >= USER_QUEUE_MAX) throw new QueryBusyError();
    this.userWaiters.set(userId, list);
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = list.indexOf(wake);
        if (i >= 0) list.splice(i, 1);
        if (!list.length && this.userWaiters.get(userId) === list) this.userWaiters.delete(userId);
        reject(new QueryBusyError());
      }, waitMs);
      list.push(wake);
    });
  }

  /** Slot global (eksekusi DuckDB); slot yang dilepas diserahkan langsung ke penunggu. */
  private async globalSlot(waitMs: number): Promise<void> {
    if (this.active < this.o.maxConcurrency) {
      this.active++;
      return;
    }
    // active tidak turun saat diserahkan, sehingga query baru tidak bisa menyalip (active ≤ max).
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(wake);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new QueryBusyError());
      }, waitMs);
      this.waiters.push(wake);
    });
  }

  private releaseGlobal() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }

  private decUser(userId: string) {
    const list = this.userWaiters.get(userId);
    const next = list?.shift();
    if (list && !list.length) this.userWaiters.delete(userId);
    // Diserahkan ke penunggu user yang sama: jumlah slot user tidak berubah.
    if (next) return next();
    const n = (this.perUser.get(userId) ?? 1) - 1;
    if (n <= 0) this.perUser.delete(userId);
    else this.perUser.set(userId, n);
  }

  /**
   * Pegang jatah user selama `fn` (termasuk menyiapkan file parquet, yang tidak memegang slot global —
   * review T-009 N2). `fn` menerima sisa waktu antre untuk slot global, sehingga total antre satu
   * permintaan ≤ queueWaitMs. Permintaan yang masih antre tidak menyewa file apa pun (review T-011 M2).
   */
  async withUser<T>(userId: string, fn: (waitLeftMs: number) => Promise<T>): Promise<T> {
    const t0 = Date.now();
    await this.userSlot(userId, this.o.queueWaitMs);
    try {
      return await fn(Math.max(0, this.o.queueWaitMs - (Date.now() - t0)));
    } finally {
      this.decUser(userId);
    }
  }

  /** Slot global selama `fn` (eksekusi DuckDB saja). Dipakai di dalam withUser. */
  async withGlobal<T>(fn: () => Promise<T>, waitMs = this.o.queueWaitMs): Promise<T> {
    await this.globalSlot(waitMs);
    try {
      return await fn();
    } finally {
      this.releaseGlobal();
    }
  }

  /** Jatah user + slot global selama `fn`. Slot selalu dilepas, apa pun yang dilempar `fn`. */
  async withSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return this.withUser(userId, (left) => this.withGlobal(fn, left));
  }

  /**
   * Satu query (parameter binding) dengan batas waktu; lewat → interrupt + QueryTimeoutError. `signal`
   * dibatalkan (klien pergi) → interrupt; galatnya dilempar apa adanya (pemanggil memeriksa signal).
   */
  async exec(
    sql: string,
    params: Record<string, DuckDBValue>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<EngineResult> {
    let timedOut = false;
    let conn: Awaited<ReturnType<DuckDBInstance["connect"]>> | null = null;
    const timer = setTimeout(() => {
      timedOut = true;
      conn?.interrupt();
    }, timeoutMs);
    const onAbort = () => conn?.interrupt();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      conn = await this.db.connect();
      signal?.throwIfAborted();
      const r = await conn.runAndReadAll(sql, params);
      if (timedOut) throw new QueryTimeoutError();
      return { columns: r.columnNames(), rows: r.getRowsJS() as unknown[][] };
    } catch (e) {
      if (timedOut) throw new QueryTimeoutError();
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      try {
        conn?.closeSync();
      } catch {
        /* koneksi sudah rusak; slot tetap dilepas pemanggil */
      }
    }
  }

  /** exec di dalam slot user (dipakai uji dan pemanggil yang tidak perlu menyiapkan file dulu). */
  run(
    userId: string,
    sql: string,
    params: Record<string, DuckDBValue>,
    timeoutMs: number,
  ): Promise<EngineResult> {
    return this.withSlot(userId, () => this.exec(sql, params, timeoutMs));
  }

  close() {
    this.db.closeSync();
  }
}
