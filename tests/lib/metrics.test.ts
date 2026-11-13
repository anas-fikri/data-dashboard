import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseCgroup, parseCgroupV1, serviceUsage } from "@/lib/metrics/cgroup";
import {
  averagePoints,
  downsample,
  hostPoint,
  parsePromText,
  readHost,
  type HostPoint,
} from "@/lib/metrics/host";
import { KEY, pushHostPoint, readAdmin, readSummary, recordHostSample } from "@/lib/metrics/store";

/*
 * Monitor sumber daya (v1.18, ADR-0010): parser node_exporter (fixture asli v1.8.2, dua sampel ± 10 dtk),
 * titik host (persen/laju, filter antarmuka virtual + filesystem semu), agregasi, cgroup, dan penyimpanan Redis
 * (palsu di memori).
 */
const A = readFileSync("tests/fixtures/node-exporter/ne1.prom", "utf8");
const B = readFileSync("tests/fixtures/node-exporter/ne2.prom", "utf8");
const MOUNTS = ["/", "/var/lib/docker", "/data"];

describe("parsePromText / readHost", () => {
  it("hanya keluarga yang dipakai; label + nilai eksponen terbaca", () => {
    const m = parsePromText(`${A}\nnode_boot_time_seconds 1.7e9\nrusak{ 1\n`);
    expect(m.has("node_boot_time_seconds")).toBe(false);
    expect(m.get("node_memory_MemTotal_bytes")![0]!.value).toBe(1.6867414016e10);
    expect(m.get("node_cpu_seconds_total")![0]!.labels).toMatchObject({ cpu: "0", mode: "idle" });
  });

  it("CPU dihitung per inti, filesystem semu/duplikat perangkat dibuang, jaringan hanya antarmuka fisik", () => {
    const h = readHost(A, 1_000, MOUNTS);
    expect(h.cpus).toBe(4);
    // "/" dan "/var/lib/docker" di perangkat sama → sekali; tmpfs dibuang; /data tidak ada di host.
    expect(h.fs.map((f) => f.mount)).toEqual(["/"]);
    const eth0 = parsePromText(A)
      .get("node_network_receive_bytes_total")!
      .find((s) => s.labels.device === "eth0")!;
    expect(h.netRx).toEqual({ eth0: eth0.value }); // lo, docker0, br-*, veth*, ifb* tidak dihitung
    // Hanya disk utuh (bukan partisi/loop/dm).
    expect(Object.keys(h.diskIo).length).toBeGreaterThan(0);
    expect(Object.keys(h.diskIo).every((d) => /^vd[a-z]+$/.test(d))).toBe(true);
  });
});

describe("hostPoint", () => {
  const a = readHost(A, 0, MOUNTS);
  const b = readHost(B, 10_000, MOUNTS);

  it("dua sampel → persen 0..1 dan laju byte/detik; sampel pertama tanpa laju", () => {
    const p = hostPoint(a, b);
    expect(p.cpu).toBeGreaterThanOrEqual(0);
    expect(p.cpu).toBeLessThanOrEqual(1);
    expect(p.iowait).toBeGreaterThanOrEqual(0);
    expect(p.rx).toBe((b.netRx!.eth0! - a.netRx!.eth0!) / 10);
    expect(p.mem).toBeCloseTo((b.memTotal! - b.memAvail!) / b.memTotal!, 9);
    expect(p.disk).toBeCloseTo(p.disks[0]!.used / p.disks[0]!.size, 9);
    expect(p.diskBusy).not.toBeNull();
    const first = hostPoint(null, b);
    expect([first.cpu, first.rx, first.tx, first.diskBusy]).toEqual([null, null, null, null]);
    expect(first.mem).not.toBeNull(); // nilai sesaat tetap ada
  });

  it("keluarga jaringan hilang (kolektor gagal) → laju null, bukan lonjakan byte sejak boot", () => {
    const noNet = readHost(
      B.split("\n")
        .filter((l) => !l.includes("node_network_"))
        .join("\n"),
      10_000,
      MOUNTS,
    );
    expect(noNet.netRx).toBeNull();
    expect(hostPoint(a, noNet).rx).toBeNull();
    expect(hostPoint(noNet, { ...b, t: 20_000 }).tx).toBeNull();
  });

  it("jaringan per antarmuka (T-zjwh L7): bond menggantikan anggotanya, VLAN/overlay dibuang, reset satu antarmuka dilewati", () => {
    const text = (rx: Record<string, number>) =>
      Object.entries(rx)
        .map(([d, v]) => `node_network_receive_bytes_total{device="${d}"} ${v}`)
        .join("\n");
    const one = readHost(
      text({
        bond0: 100,
        eth0: 60,
        eth1: 40,
        "eth0.100": 5,
        docker_gwbridge: 7,
        tailscale0: 3,
        zt1: 2,
        vnet0: 1,
      }),
      0,
      [],
    );
    expect(one.netRx).toEqual({ bond0: 100 });
    const x = readHost(text({ eth0: 1000, ens3: 500 }), 0, []);
    const y = readHost(text({ eth0: 2000, ens3: 100 }), 10_000, []); // ens3 ter-reset
    expect(hostPoint(x, y).rx).toBe(100);
    // Sampel lama (angka tunggal) → null sekali.
    expect(hostPoint({ ...x, netRx: 5 as never }, y).rx).toBeNull();
  });

  it("iowait sedikit mundur → dijepit 0, CPU tetap terhitung", () => {
    const p = hostPoint(a, { ...b, cpuIowait: a.cpuIowait - 0.5 });
    expect(p.iowait).toBe(0);
    expect(p.cpu).not.toBeNull();
  });

  it("counter turun (reboot) → laju null, bukan angka negatif", () => {
    const p = hostPoint(b, { ...a, t: 20_000 });
    expect(p.cpu).toBeNull();
    expect(p.rx).toBeNull();
    expect(p.diskBusy).toBeNull();
  });
});

describe("agregasi", () => {
  const pt = (t: number, cpu: number | null): HostPoint =>
    ({ ...hostPoint(null, readHost(A, t, MOUNTS)), cpu }) as HostPoint;

  it("rata-rata mengabaikan null per field; downsample ≤ n titik urut waktu", () => {
    expect(averagePoints([pt(1, 0.2), pt(2, null), pt(3, 0.4)])!.cpu).toBeCloseTo(0.3, 9);
    const many = Array.from({ length: 360 }, (_, i) => pt(i * 10_000, (i % 10) / 10));
    const ds = downsample(many, 60);
    expect(ds).toHaveLength(60);
    expect(ds.every((p, i) => i === 0 || p.t > ds[i - 1]!.t)).toBe(true);
    expect(downsample(many.slice(0, 5), 60)).toHaveLength(5);
  });
});

describe("cgroup", () => {
  it("cpu.stat + memory.current/max; inti terpakai dari selisih", () => {
    const a = parseCgroup(0, "usage_usec 1000000\nuser_usec 1\n", "1048576\n", "max\n")!;
    const b = parseCgroup(10_000, "usage_usec 6000000\n", "2097152\n", "3221225472\n")!;
    expect(a.memMax).toBeNull();
    expect(serviceUsage(a, b)).toEqual({ t: 10_000, cpu: 0.5, mem: 2097152, memMax: 3221225472 });
    expect(serviceUsage(null, b).cpu).toBeNull();
    expect(parseCgroup(0, "", "x", "max")).toBeNull();
  });

  it("cgroup v1: nanodetik → mikrodetik; batas raksasa = tanpa batas", () => {
    expect(parseCgroupV1(5, "2500000000\n", "1048576\n", "9223372036854771712\n")).toEqual({
      t: 5,
      cpuUsec: 2_500_000,
      mem: 1048576,
      memMax: null,
    });
    expect(parseCgroupV1(5, "1\n", "2\n", "3221225472\n")!.memMax).toBe(3221225472);
    expect(parseCgroupV1(5, "", "2", "")).toBeNull();
  });
});

/** Redis palsu secukupnya untuk store.ts. */
function fakeRedis() {
  const kv = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();
  const list = (k: string) => lists.get(k) ?? (lists.set(k, []), lists.get(k)!);
  const api = {
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: string) => (kv.set(k, v), "OK"),
    lindex: async (k: string, i: number) => list(k)[i] ?? null,
    lrange: async (k: string, a: number, b: number) => list(k).slice(a, b + 1),
    hset: async (k: string, f: string, v: string) => {
      (hashes.get(k) ?? (hashes.set(k, new Map()), hashes.get(k)!)).set(f, v);
      return 1;
    },
    hgetall: async (k: string) => Object.fromEntries(hashes.get(k) ?? []),
    hdel: async (k: string, ...fs: string[]) => {
      for (const f of fs) hashes.get(k)?.delete(f);
      return fs.length;
    },
    multi() {
      const ops: (() => void)[] = [];
      const m = {
        lpush: (k: string, v: string) => (ops.push(() => list(k).unshift(v)), m),
        ltrim: (k: string, a: number, b: number) => (
          ops.push(() => lists.set(k, list(k).slice(a, b + 1))),
          m
        ),
        exec: async () => ops.forEach((f) => f()),
      };
      return m;
    },
  };
  return { api, lists, hashes };
}

describe("store", () => {
  it("sampel pertama hanya menyimpan mentah; berikutnya menambah titik; menit lewat → titik 1 menit", async () => {
    const { api, lists } = fakeRedis();
    const r = api as never;
    const t0 = 120_000; // menit ke-2
    await recordHostSample(r, A, t0, MOUNTS);
    expect(lists.get(KEY.s10) ?? []).toHaveLength(0);
    await recordHostSample(r, B, t0 + 10_000, MOUNTS);
    expect(lists.get(KEY.s10)).toHaveLength(1);
    // Titik di menit berikutnya → menit ke-2 dirata-rata sekali.
    const next = JSON.parse(lists.get(KEY.s10)![0]!) as HostPoint;
    await pushHostPoint(r, { ...next, t: 185_000 });
    await pushHostPoint(r, { ...next, t: 195_000 });
    expect(lists.get(KEY.m1)).toHaveLength(1);
    expect((JSON.parse(lists.get(KEY.m1)![0]!) as HostPoint).t).toBe(120_000);
  });

  it("jeda ≥ 1 menit: semua menit yang punya titik 10 dtk tetap dirata-rata (T-zjwh L4)", async () => {
    const { api, lists } = fakeRedis();
    const r = api as never;
    const p = hostPoint(readHost(A, 0, MOUNTS), readHost(B, 10_000, MOUNTS));
    await pushHostPoint(r, { ...p, t: 60_000 }); // menit 1 (menit 0 kosong)
    await pushHostPoint(r, { ...p, t: 130_000 }); // menit 2 → menit 1 diagregasi
    await pushHostPoint(r, { ...p, t: 150_000 });
    // Jeda: menit 3 terlewat sampai menit 5 — menit 2 tetap diagregasi, menit 3–4 tanpa titik tidak dibuat.
    await pushHostPoint(r, { ...p, t: 300_000 });
    const minutes = lists.get(KEY.m1)!.map((x) => (JSON.parse(x) as HostPoint).t);
    expect(minutes).toEqual([120_000, 60_000]);
  });

  it("sampel mentah > 2 menit tidak dipakai untuk laju (app lama mati)", async () => {
    const { api, lists } = fakeRedis();
    await recordHostSample(api as never, A, 0, MOUNTS);
    await recordHostSample(api as never, B, 200_000, MOUNTS);
    expect(lists.get(KEY.s10) ?? []).toHaveLength(0);
  });

  it("ringkasan: tanpa titik segar → tidak tersedia; admin: layanan basi dibuang", async () => {
    const { api, hashes } = fakeRedis();
    const r = api as never;
    expect(await readSummary(r, 1_000_000)).toMatchObject({
      available: false,
      latest: null,
      series: [],
    });
    await recordHostSample(r, A, 990_000, MOUNTS);
    await recordHostSample(r, B, 1_000_000, MOUNTS);
    await api.set(KEY.queue, JSON.stringify({ t: 1_000_000, waiting: 2, active: 1, workers: 0 }));
    await api.hset(
      KEY.svc,
      "app:abc",
      JSON.stringify({ t: 999_000, cpu: 0.2, mem: 10, memMax: null }),
    );
    await api.hset(KEY.svc, "worker:old", JSON.stringify({ t: 1, cpu: 0, mem: 1, memMax: null }));
    const s = await readSummary(r, 1_005_000);
    expect(s).toMatchObject({ available: true, queue: { waiting: 2, workers: 0 } });
    expect(s.series).toHaveLength(1);
    const a = await readAdmin(r, 1_005_000);
    expect(a.services.map((x) => x.service)).toEqual(["app"]);
    expect(hashes.get(KEY.svc)!.has("worker:old")).toBe(false);
    // Titik lama (> 1 menit) → tidak tersedia lagi.
    expect((await readSummary(r, 1_100_000)).available).toBe(false);
  });
});
