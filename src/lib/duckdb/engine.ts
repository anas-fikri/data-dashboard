/*
 * Mesin query DuckDB di proses aplikasi (T-009, alur B4). Satu instance per proses, dikunci:
 * tanpa unduh/muat ekstensi, akses file hanya ke direktori cache parquet dan temp
 * (enable_external_access=false + allowed_directories), lalu lock_configuration sehingga query tidak
 * bisa mengubahnya. Satu koneksi per query; slot global dan per user; timeout → interrupt.
 */
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
  memoryLimit: string;
  threads: number;
  maxTempSize: string;
  /** Query bersamaan di seluruh proses. */
  maxConcurrency: number;
  /** Query bersamaan per user (sisanya langsung QueryBusyError). */
  perUser: number;
  /** Lama menunggu slot global sebelum QueryBusyError. */
  queueWaitMs: number;
}

export interface EngineResult {
  columns: string[];
  rows: unknown[][];
}

export class QueryEngine {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly perUser = new Map<string, number>();

  private constructor(
    private readonly db: DuckDBInstance,
    private readonly o: EngineOptions,
  ) {}

  static async create(o: EngineOptions): Promise<QueryEngine> {
    mkdirSync(o.dataDir, { recursive: true });
    mkdirSync(o.tmpDir, { recursive: true });
    const db = await DuckDBInstance.create(":memory:", {
      memory_limit: o.memoryLimit,
      threads: String(o.threads),
      temp_directory: o.tmpDir,
      max_temp_directory_size: o.maxTempSize,
      autoinstall_known_extensions: "false",
      autoload_known_extensions: "false",
    });
    const conn = await db.connect();
    try {
      const dirs = [o.dataDir, o.tmpDir].map((d) => lit(d.endsWith("/") ? d : `${d}/`));
      await conn.run(`SET allowed_directories = [${dirs.join(", ")}]`);
      await conn.run("SET enable_external_access = false");
      await conn.run("SET lock_configuration = true");
    } finally {
      conn.closeSync();
    }
    return new QueryEngine(db, o);
  }

  private async slot(userId: string): Promise<() => void> {
    const mine = this.perUser.get(userId) ?? 0;
    if (mine >= this.o.perUser) throw new QueryBusyError();
    this.perUser.set(userId, mine + 1);
    try {
      if (this.active >= this.o.maxConcurrency) {
        await new Promise<void>((resolve, reject) => {
          const wake = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            const i = this.waiters.indexOf(wake);
            if (i >= 0) this.waiters.splice(i, 1);
            reject(new QueryBusyError());
          }, this.o.queueWaitMs);
          this.waiters.push(wake);
        });
      }
      this.active++;
    } catch (e) {
      this.decUser(userId);
      throw e;
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      this.decUser(userId);
      this.waiters.shift()?.();
    };
  }

  private decUser(userId: string) {
    const n = (this.perUser.get(userId) ?? 1) - 1;
    if (n <= 0) this.perUser.delete(userId);
    else this.perUser.set(userId, n);
  }

  /** Jalankan satu query (parameter binding) dengan batas waktu; lewat → interrupt + QueryTimeoutError. */
  async run(
    userId: string,
    sql: string,
    params: Record<string, string | number | boolean>,
    timeoutMs: number,
  ): Promise<EngineResult> {
    const release = await this.slot(userId);
    const conn = await this.db.connect();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      conn.interrupt();
    }, timeoutMs);
    try {
      const r = await conn.runAndReadAll(sql, params);
      if (timedOut) throw new QueryTimeoutError();
      return { columns: r.columnNames(), rows: r.getRowsJS() as unknown[][] };
    } catch (e) {
      if (timedOut) throw new QueryTimeoutError();
      throw e;
    } finally {
      clearTimeout(timer);
      conn.closeSync();
      release();
    }
  }

  close() {
    this.db.closeSync();
  }
}
