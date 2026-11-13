/*
 * Metrik host dari node_exporter (v1.18, ADR-0010) — murni, tanpa I/O. Teks format Prometheus diurai hanya
 * untuk keluarga yang dipakai, lalu dua sampel berurutan menjadi satu titik (persen/laju). Angka yang tidak
 * bisa dihitung (sampel pertama, counter reset, keluarga hilang) = null, bukan 0 palsu.
 */

/** Keluarga metrik yang dibaca; sisanya diabaikan saat parse (respons bisa ratusan baris). */
const FAMILIES = new Set([
  "node_cpu_seconds_total",
  "node_load1",
  "node_load5",
  "node_load15",
  "node_memory_MemTotal_bytes",
  "node_memory_MemAvailable_bytes",
  "node_memory_SwapTotal_bytes",
  "node_memory_SwapFree_bytes",
  "node_filesystem_size_bytes",
  "node_filesystem_avail_bytes",
  "node_network_receive_bytes_total",
  "node_network_transmit_bytes_total",
  "node_disk_io_time_seconds_total",
]);

export interface PromSample {
  labels: Record<string, string>;
  value: number;
}

/** Urai teks eksposisi Prometheus (hanya FAMILIES). Baris rusak dilewati. */
export function parsePromText(text: string): Map<string, PromSample[]> {
  const out = new Map<string, PromSample[]>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const brace = line.indexOf("{");
    const space = line.indexOf(" ");
    const nameEnd = brace >= 0 && brace < space ? brace : space;
    if (nameEnd <= 0) continue;
    const name = line.slice(0, nameEnd);
    if (!FAMILIES.has(name)) continue;
    let labels: Record<string, string> = {};
    let rest = line.slice(nameEnd);
    if (rest.startsWith("{")) {
      const close = rest.lastIndexOf("}");
      if (close < 0) continue;
      labels = parseLabels(rest.slice(1, close));
      rest = rest.slice(close + 1);
    }
    const value = Number(rest.trim().split(/\s+/)[0]);
    if (!Number.isFinite(value)) continue;
    const list = out.get(name) ?? [];
    list.push({ labels, value });
    out.set(name, list);
  }
  return out;
}

function parseLabels(s: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  for (const m of s.matchAll(re))
    labels[m[1]!] = m[2]!.replace(/\\(["\\n])/g, (_, c) => (c === "n" ? "\n" : c));
  return labels;
}

/**
 * Antarmuka virtual (Docker, bridge, veth, loopback, shaping, overlay/VPN, VLAN) tidak dihitung: hanya lalu lintas
 * fisik host, agar paket yang lewat beberapa antarmuka tidak terhitung ganda (T-zjwh L7). VLAN = `eth0.100`/`vlan*`.
 */
const VIRTUAL_NET =
  /^(lo|docker\d*|docker_gwbridge|br-.*|veth.*|ifb\d*|virbr.*|vnet\d*|cni.*|flannel.*|cali.*|tap.*|tun.*|vxlan.*|wg\d*|tailscale\d*|zt.*|vlan.*|.+\..+)$/;
/** Antarmuka bond: bila ada, anggotanya (eth/en*) tidak dihitung — lalu lintas bond = jumlah anggotanya. */
const BOND = /^bond\d+$/;
const BOND_MEMBER = /^(eth|en)/;
/** Perangkat disk fisik/virtual blok (bukan partisi, loop, ram, dm). */
const DISK_DEV = /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|hd[a-z]+)$/;
const PSEUDO_FS = new Set([
  "tmpfs",
  "devtmpfs",
  "overlay",
  "squashfs",
  "proc",
  "sysfs",
  "nsfs",
  "fuse.lxcfs",
]);

export interface Filesystem {
  mount: string;
  size: number;
  avail: number;
}

/** Satu pembacaan mentah (counter kumulatif) — disimpan untuk menghitung laju di sampel berikutnya. */
export interface HostRaw {
  t: number;
  cpuTotal: number;
  cpuIdle: number;
  cpuIowait: number;
  cpus: number;
  load1: number | null;
  memTotal: number | null;
  memAvail: number | null;
  swapTotal: number | null;
  swapFree: number | null;
  fs: Filesystem[];
  /**
   * Byte per antarmuka fisik (T-zjwh L7: laju dihitung per antarmuka, counter satu antarmuka yang ter-reset tidak
   * mengacaukan total). null = keluarga metrik tidak ada di respons (kolektor gagal) — bukan 0, agar laju tidak
   * melonjak palsu.
   */
  netRx: Record<string, number> | null;
  netTx: Record<string, number> | null;
  diskIo: Record<string, number>;
}

const one = (m: Map<string, PromSample[]>, name: string): number | null =>
  m.get(name)?.[0]?.value ?? null;

/**
 * Pembacaan mentah dari teks /metrics. `mounts`: titik mount yang dilaporkan (mis. "/", "/var/lib/docker",
 * "/data"); yang tidak ada di host dilewati, mount di perangkat yang sama dilaporkan sekali.
 */
export function readHost(text: string, t: number, mounts: readonly string[]): HostRaw {
  const m = parsePromText(text);
  let cpuTotal = 0;
  let cpuIdle = 0;
  let cpuIowait = 0;
  const cpuIds = new Set<string>();
  for (const s of m.get("node_cpu_seconds_total") ?? []) {
    cpuTotal += s.value;
    cpuIds.add(s.labels.cpu ?? "");
    if (s.labels.mode === "idle") cpuIdle += s.value;
    if (s.labels.mode === "iowait") cpuIowait += s.value;
  }
  const size = new Map<string, PromSample>();
  for (const s of m.get("node_filesystem_size_bytes") ?? []) size.set(s.labels.mountpoint ?? "", s);
  const fs: Filesystem[] = [];
  const devices = new Set<string>();
  for (const s of m.get("node_filesystem_avail_bytes") ?? []) {
    const mount = s.labels.mountpoint ?? "";
    const sz = size.get(mount);
    if (!sz || !mounts.includes(mount) || PSEUDO_FS.has(s.labels.fstype ?? "")) continue;
    const dev = s.labels.device ?? mount;
    if (devices.has(dev)) continue;
    devices.add(dev);
    fs.push({ mount, size: sz.value, avail: s.value });
  }
  fs.sort((a, b) => mounts.indexOf(a.mount) - mounts.indexOf(b.mount));
  const net = (name: string) => {
    const list = m.get(name);
    if (!list) return null;
    const devs = list.filter((s) => !VIRTUAL_NET.test(s.labels.device ?? ""));
    const bonded = devs.some((s) => BOND.test(s.labels.device ?? ""));
    const out: Record<string, number> = {};
    for (const s of devs) {
      const dev = s.labels.device ?? "";
      if (bonded && BOND_MEMBER.test(dev)) continue;
      out[dev] = s.value;
    }
    return out;
  };
  const diskIo: Record<string, number> = {};
  for (const s of m.get("node_disk_io_time_seconds_total") ?? []) {
    const dev = s.labels.device ?? "";
    if (DISK_DEV.test(dev)) diskIo[dev] = s.value;
  }
  return {
    t,
    cpuTotal,
    cpuIdle,
    cpuIowait,
    cpus: cpuIds.size,
    load1: one(m, "node_load1"),
    memTotal: one(m, "node_memory_MemTotal_bytes"),
    memAvail: one(m, "node_memory_MemAvailable_bytes"),
    swapTotal: one(m, "node_memory_SwapTotal_bytes"),
    swapFree: one(m, "node_memory_SwapFree_bytes"),
    fs,
    netRx: net("node_network_receive_bytes_total"),
    netTx: net("node_network_transmit_bytes_total"),
    diskIo,
  };
}

/** Satu titik grafik (dibagikan ke semua user login; tanpa nama host/antarmuka). */
export interface HostPoint {
  t: number;
  /** 0..1 CPU sibuk seluruh host (bukan idle, bukan iowait). */
  cpu: number | null;
  /** 0..1 CPU menunggu disk — penanda beban IO (load tinggi tanpa CPU tinggi). */
  iowait: number | null;
  load1: number | null;
  cpus: number;
  /** 0..1 RAM terpakai (MemTotal − MemAvailable). */
  mem: number | null;
  memUsed: number | null;
  memTotal: number | null;
  swapUsed: number | null;
  swapTotal: number | null;
  /** 0..1 terpakai, filesystem terpenuh di antara mount yang dilaporkan. */
  disk: number | null;
  disks: { mount: string; used: number; size: number }[];
  /** Byte/detik, antarmuka fisik. */
  rx: number | null;
  tx: number | null;
  /** 0..1 waktu disk sibuk (perangkat tersibuk). */
  diskBusy: number | null;
}

const ratio = (a: number, b: number) => (b > 0 ? Math.min(1, Math.max(0, a / b)) : null);
/** Laju counter; counter tidak diketahui, turun (reboot/reset), atau selang ≤ 0 → null. */
const rate = (prev: number | null, cur: number | null, dt: number) =>
  prev !== null && cur !== null && dt > 0 && cur >= prev ? (cur - prev) / dt : null;

/**
 * Laju jaringan = jumlah laju per antarmuka yang ada di kedua sampel; antarmuka yang counternya mundur (reset) atau
 * baru muncul dilewati. Sampel lama (angka tunggal, sebelum T-zjwh) → null sekali.
 */
const netRate = (prev: unknown, cur: Record<string, number> | null, dt: number): number | null => {
  if (!cur || !prev || typeof prev !== "object" || dt <= 0) return null;
  const p = prev as Record<string, number>;
  let sum = 0;
  let seen = false;
  for (const [dev, v] of Object.entries(cur)) {
    const r = rate(typeof p[dev] === "number" ? p[dev]! : null, v, dt);
    if (r !== null) {
      sum += r;
      seen = true;
    }
  }
  return seen ? sum : null;
};

export function hostPoint(prev: HostRaw | null, cur: HostRaw): HostPoint {
  const dt = prev ? (cur.t - prev.t) / 1000 : 0;
  let cpu: number | null = null;
  let iowait: number | null = null;
  if (prev && cur.cpuTotal > prev.cpuTotal && cur.cpus === prev.cpus) {
    const total = cur.cpuTotal - prev.cpuTotal;
    const idle = cur.cpuIdle - prev.cpuIdle;
    // Counter iowait kernel boleh sedikit mundur (proc(5)): dijepit 0, bukan membuang seluruh titik CPU.
    const io = Math.max(0, cur.cpuIowait - prev.cpuIowait);
    if (idle >= 0) {
      cpu = ratio(total - idle - io, total);
      iowait = ratio(io, total);
    }
  }
  // Counter disk turun di salah satu perangkat (reboot/reset) → seluruh nilai tidak diketahui.
  let diskBusy: number | null = null;
  if (prev && dt > 0) {
    for (const [dev, v] of Object.entries(cur.diskIo)) {
      const before = prev.diskIo[dev];
      if (before === undefined) continue;
      const r = rate(before, v, dt);
      if (r === null) {
        diskBusy = null;
        break;
      }
      diskBusy = Math.max(diskBusy ?? 0, Math.min(1, r));
    }
  }
  const disks = cur.fs.map((f) => ({ mount: f.mount, used: f.size - f.avail, size: f.size }));
  const fullest = disks.reduce<number | null>((m, d) => {
    const r = ratio(d.used, d.size);
    return r === null ? m : Math.max(m ?? 0, r);
  }, null);
  return {
    t: cur.t,
    cpu,
    iowait,
    load1: cur.load1,
    cpus: cur.cpus,
    mem:
      cur.memTotal !== null && cur.memAvail !== null
        ? ratio(cur.memTotal - cur.memAvail, cur.memTotal)
        : null,
    memUsed: cur.memTotal !== null && cur.memAvail !== null ? cur.memTotal - cur.memAvail : null,
    memTotal: cur.memTotal,
    swapUsed: cur.swapTotal !== null && cur.swapFree !== null ? cur.swapTotal - cur.swapFree : null,
    swapTotal: cur.swapTotal,
    disk: fullest,
    disks,
    rx: prev ? netRate(prev.netRx, cur.netRx, dt) : null,
    tx: prev ? netRate(prev.netTx, cur.netTx, dt) : null,
    diskBusy,
  };
}

/** Rata-rata titik (agregasi 1 menit / pengecilan sparkline); field null diabaikan per field. */
export function averagePoints(points: readonly HostPoint[]): HostPoint | null {
  if (!points.length) return null;
  const last = points[points.length - 1]!;
  const avg = (k: keyof HostPoint) => {
    const xs = points.map((p) => p[k]).filter((v): v is number => typeof v === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return {
    ...last,
    cpu: avg("cpu"),
    iowait: avg("iowait"),
    load1: avg("load1"),
    mem: avg("mem"),
    memUsed: avg("memUsed"),
    swapUsed: avg("swapUsed"),
    disk: avg("disk"),
    rx: avg("rx"),
    tx: avg("tx"),
    diskBusy: avg("diskBusy"),
  };
}

/** Kecilkan deret menjadi ≤ n titik (rata-rata per ember, urut waktu). */
export function downsample(points: readonly HostPoint[], n: number): HostPoint[] {
  if (points.length <= n) return [...points];
  const size = points.length / n;
  const out: HostPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = averagePoints(points.slice(Math.floor(i * size), Math.floor((i + 1) * size)));
    if (p) out.push(p);
  }
  return out;
}
