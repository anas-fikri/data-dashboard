import { AsyncLocalStorage } from "node:async_hooks";

/*
 * Perkiraan pemakaian per akun (v1.18 fase 2, T-qed9): waktu eksekusi DuckDB per user. CPU per user tidak bisa
 * diukur persis (satu proses melayani semua user), jadi yang dihitung adalah lama query memegang slot global mesin
 * (eksekusi nyata, bukan antre). User dibawa AsyncLocalStorage dari withUser (widget, grid) ke withGlobal.
 * Penampung di globalThis: instrumentation (pelapor) dan route handler bisa memuat salinan modul berbeda.
 */
interface Run {
  userId: string;
  since: number;
}

interface Tracker {
  als: AsyncLocalStorage<string>;
  runs: Set<Run>;
  ms: Map<string, number>;
}

const g = globalThis as unknown as { metricsAccounts?: Tracker };

function tracker(): Tracker {
  return (g.metricsAccounts ??= {
    als: new AsyncLocalStorage<string>(),
    runs: new Set(),
    ms: new Map(),
  });
}

/** Jalankan `fn` atas nama user (query di dalamnya dihitung untuk user ini). */
export function runAs<T>(userId: string, fn: () => T): T {
  return tracker().als.run(userId, fn);
}

const add = (t: Tracker, userId: string, ms: number) => {
  if (ms > 0) t.ms.set(userId, (t.ms.get(userId) ?? 0) + ms);
};

/** Mulai menghitung query user aktif (dari runAs); tanpa user → tidak dihitung. Kembalian: penutup (idempoten). */
export function queryStarted(now: () => number = Date.now): () => void {
  const t = tracker();
  const userId = t.als.getStore();
  if (!userId) return () => {};
  const run: Run = { userId, since: now() };
  t.runs.add(run);
  return () => {
    if (!t.runs.delete(run)) return;
    add(t, run.userId, now() - run.since);
  };
}

export interface AccountSnapshot {
  /** Query yang sedang berjalan per user saat ini. */
  running: Record<string, number>;
  /** Milidetik eksekusi sejak snapshot sebelumnya (query yang masih berjalan dihitung sampai `now`). */
  ms: Record<string, number>;
}

/** Ambil dan kosongkan hitungan (dipanggil pelapor tiap 10 dtk). */
export function takeSnapshot(now = Date.now()): AccountSnapshot {
  const t = tracker();
  const running: Record<string, number> = {};
  for (const run of t.runs) {
    add(t, run.userId, now - run.since);
    run.since = now;
    running[run.userId] = (running[run.userId] ?? 0) + 1;
  }
  const ms = Object.fromEntries(t.ms);
  t.ms.clear();
  return { running, ms };
}
