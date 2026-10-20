/*
 * Isolasi beban "Lihat data" (T-042, G-6 §3.4 "Isolasi beban"): permintaan grid memakai mesin DuckDB
 * yang sama dengan widget, tetapi lewat gerbang sendiri:
 * - paling banyak `maxGlobal` (GRID_MAX_CONCURRENCY, default 2) dari slot global mesin dipegang grid,
 *   jadi widget dashboard selalu kebagian sisanya;
 * - paling banyak `perUser` (2) permintaan grid in-flight per pengguna; lebih → QueryBusyError langsung
 *   (klien membatalkan blok yang sudah lewat, tidak perlu antre);
 * - jatah per pengguna mesin (dipakai widget) TIDAK disentuh: pengguna yang menggulir tidak membuat
 *   widget dashboard-nya sendiri antre di belakang blok grid.
 */
import { QueryBusyError } from "@/lib/duckdb/engine";
import type { QueryDeps } from "./service";

type Engine = QueryDeps["engine"];

export interface GridGateOptions {
  maxGlobal: number;
  perUser: number;
  /** Lama menunggu slot grid global sebelum QueryBusyError. */
  queueWaitMs: number;
}

export class GridGate {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly inFlight = new Map<string, number>();

  constructor(readonly o: GridGateOptions) {}

  /** Jumlah slot grid global yang sedang dipegang (untuk uji). */
  get activeGlobal() {
    return this.active;
  }

  /** In-flight per pengguna: penuh → QueryBusyError langsung, tanpa antre. */
  async withUser<T>(userId: string, fn: (waitLeftMs: number) => Promise<T>): Promise<T> {
    const n = this.inFlight.get(userId) ?? 0;
    if (n >= this.o.perUser) throw new QueryBusyError();
    this.inFlight.set(userId, n + 1);
    try {
      return await fn(this.o.queueWaitMs);
    } finally {
      const left = (this.inFlight.get(userId) ?? 1) - 1;
      if (left <= 0) this.inFlight.delete(userId);
      else this.inFlight.set(userId, left);
    }
  }

  /** Slot grid global; slot yang dilepas diserahkan langsung ke penunggu (active ≤ maxGlobal). */
  async withGlobal<T>(fn: () => Promise<T>, waitMs = this.o.queueWaitMs): Promise<T> {
    if (this.active < this.o.maxGlobal) this.active++;
    else {
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
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/**
 * Mesin untuk GridDeps: jatah user = in-flight grid; slot global = slot grid lalu slot global mesin
 * (sisa waktu antre dibagi, jadi total antre ≤ queueWaitMs). exec tetap mesin yang sama.
 */
export function gridEngine(engine: Engine, gate: GridGate): Engine {
  const withGlobal = <T>(fn: () => Promise<T>, waitMs = gate.o.queueWaitMs) => {
    const t0 = Date.now();
    return gate.withGlobal(() => {
      const left = Math.max(0, waitMs - (Date.now() - t0));
      return engine.withGlobal ? engine.withGlobal(fn, left) : fn();
    }, waitMs);
  };
  return {
    exec: (sql, params, timeoutMs, signal) => engine.exec(sql, params, timeoutMs, signal),
    withUser: (userId, fn) => gate.withUser(userId, fn),
    withGlobal,
    withSlot: (userId, fn) => gate.withUser(userId, (left) => withGlobal(fn, left)),
  };
}
