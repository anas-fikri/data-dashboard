/*
 * Label ramah halaman terakhir (T-h807): pathname → "Dashboard Penjualan", "Dataset Billing", "Admin", dst.
 * Nama dashboard/dataset diambil oleh pemanggil (service) lewat id di path; tanpa nama → label jenis saja.
 */
export type PathRef =
  | { kind: "dashboard"; id: string }
  | { kind: "dataset"; id: string }
  | { kind: "static"; label: string };

const CUID = /^[a-z0-9]{20,32}$/;

const STATIC: [RegExp, string][] = [
  [/^\/$/, "Beranda"],
  [/^\/dashboards\/baru$/, "Buat dashboard"],
  [/^\/dashboards$/, "Daftar dashboard"],
  [/^\/datasets\/baru$/, "Buat dataset"],
  [/^\/datasets$/, "Daftar dataset"],
  [/^\/panduan(\/|$)/, "Panduan"],
  [/^\/yang-baru$/, "Yang baru"],
  [/^\/akun(\/|$)/, "Akun"],
  [/^\/admin(\/|$)/, "Admin"],
];

/** Jenis halaman dari pathname bersih (cleanPath); null = tidak dikenal. */
export function pathRef(path: string | null): PathRef | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "dashboards" && parts[1] && CUID.test(parts[1])) {
    return { kind: "dashboard", id: parts[1] };
  }
  if (parts[0] === "datasets" && parts[1] && CUID.test(parts[1])) {
    return { kind: "dataset", id: parts[1] };
  }
  const hit = STATIC.find(([re]) => re.test(path));
  return hit ? { kind: "static", label: hit[1] } : null;
}

/** Teks label dari jenis halaman + nama (bila ditemukan). */
export function pathLabel(ref: PathRef | null, name?: string | null): string {
  if (!ref) return "Halaman lain";
  if (ref.kind === "static") return ref.label;
  const kind = ref.kind === "dashboard" ? "Dashboard" : "Dataset";
  return name ? `${kind} ${name}` : kind;
}
