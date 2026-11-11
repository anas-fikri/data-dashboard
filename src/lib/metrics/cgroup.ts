import { readFile } from "node:fs/promises";

/*
 * Pemakaian container sendiri dari cgroup v2 (v1.18): tanpa docker.sock. `cpu.stat` usage_usec kumulatif,
 * `memory.current` dan `memory.max` ("max" = tanpa batas); cgroup v1 (cpuacct/memory) sebagai cadangan. Berkas
 * hilang → null.
 */
export interface CgroupRaw {
  t: number;
  cpuUsec: number;
  mem: number;
  memMax: number | null;
}

export function parseCgroup(
  t: number,
  cpuStat: string,
  memCurrent: string,
  memMax: string,
): CgroupRaw | null {
  const usage = /^usage_usec\s+(\d+)/m.exec(cpuStat);
  const mem = Number(memCurrent.trim());
  if (!usage || !Number.isFinite(mem)) return null;
  const max = memMax.trim() === "max" ? null : Number(memMax.trim());
  return {
    t,
    cpuUsec: Number(usage[1]),
    mem,
    memMax: max !== null && Number.isFinite(max) ? max : null,
  };
}

/** Batas memori cgroup v1 "tanpa batas" = bilangan raksasa (PAGE_COUNTER_MAX), bukan "max". */
const V1_UNLIMITED = 2 ** 60;

/** cgroup v1 (host lama): cpuacct.usage dalam nanodetik, memory.usage_in_bytes/limit_in_bytes. */
export function parseCgroupV1(
  t: number,
  usageNs: string,
  memUsage: string,
  memLimit: string,
): CgroupRaw | null {
  const ns = Number(usageNs.trim());
  const mem = Number(memUsage.trim());
  const limit = Number(memLimit.trim());
  if (!Number.isFinite(ns) || !Number.isFinite(mem) || usageNs.trim() === "") return null;
  return {
    t,
    cpuUsec: Math.floor(ns / 1000),
    mem,
    memMax: Number.isFinite(limit) && limit > 0 && limit < V1_UNLIMITED ? limit : null,
  };
}

export async function readCgroup(
  root = "/sys/fs/cgroup",
  now = Date.now(),
): Promise<CgroupRaw | null> {
  try {
    const [cpu, cur, max] = await Promise.all([
      readFile(`${root}/cpu.stat`, "utf8"),
      readFile(`${root}/memory.current`, "utf8"),
      readFile(`${root}/memory.max`, "utf8").catch(() => "max"),
    ]);
    return parseCgroup(now, cpu, cur, max);
  } catch {
    // cgroup v1: berkas per pengendali di subfolder.
    try {
      const [ns, used, limit] = await Promise.all([
        readFile(`${root}/cpuacct/cpuacct.usage`, "utf8"),
        readFile(`${root}/memory/memory.usage_in_bytes`, "utf8"),
        readFile(`${root}/memory/memory.limit_in_bytes`, "utf8").catch(() => ""),
      ]);
      return parseCgroupV1(now, ns, used, limit);
    } catch {
      return null;
    }
  }
}

/** Pemakaian layanan: `cpu` = inti terpakai (1 = satu inti penuh); null pada sampel pertama/counter reset. */
export interface ServiceUsage {
  t: number;
  cpu: number | null;
  mem: number;
  memMax: number | null;
}

export function serviceUsage(prev: CgroupRaw | null, cur: CgroupRaw): ServiceUsage {
  const dtUsec = prev ? (cur.t - prev.t) * 1000 : 0;
  const cpu =
    prev && dtUsec > 0 && cur.cpuUsec >= prev.cpuUsec
      ? (cur.cpuUsec - prev.cpuUsec) / dtUsec
      : null;
  return { t: cur.t, cpu, mem: cur.mem, memMax: cur.memMax };
}
