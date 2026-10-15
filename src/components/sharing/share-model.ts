import type {
  DashboardAccessRole,
  ShareActionResult,
  ShareGrantView,
  ShareRole,
  ShareUserOption,
  ShareWarnings,
} from "@/features/sharing/types";

/*
 * Logika murni berbagi dashboard (T-016): label peran/akses, kapan peringatan dialog share tampil,
 * syarat pencarian pengguna, pesan galat, dan teks pengumuman hasil aksi. Tanpa React agar bisa diuji;
 * dipakai dialog share, kepala halaman dashboard, dan daftar /dashboards.
 */

/** Pilihan peran di dialog share (Select kustom); urutan = dari akses paling sempit. */
export const ROLE_OPTIONS: readonly { value: ShareRole; label: string }[] = [
  { value: "VIEWER", label: "Hanya lihat" },
  { value: "EDITOR", label: "Bisa mengedit widget" },
];
export const roleLabel = (role: ShareRole) =>
  ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
export const isShareRole = (v: string): v is ShareRole => v === "VIEWER" || v === "EDITOR";

/** Peran non-pemilik di kepala dashboard dan daftar "Dibagikan ke saya" (pemilik tidak diberi label). */
export const sharedRoleLabel = (role: Exclude<DashboardAccessRole, "OWNER">) =>
  role === "EDITOR" ? "Editor" : "Hanya lihat";

/**
 * "Dibagikan ke saya" baru dipotong bila daftarnya melebihi batas (SHARED_LIST_MAX): paling banyak
 * SHARED_PER_OWNER_MAX per pemilik, share langsung dan organisasi dihitung bersama — catatan ini tidak
 * pernah bertentangan dengan baris yang terlihat. Dashboard yang terpotong disebut, tidak hilang
 * diam-diam (review T-016 R3-SEC-2); langkah berikutnya: tautan dari pemiliknya (R4-UI-2).
 */
export const hiddenSharedText = (hidden: number, perOwner: number) =>
  `${hidden.toLocaleString("id-ID")} dashboard lain yang dibagikan kepada Anda tidak ditampilkan karena daftar terlalu panjang (paling banyak ${perOwner.toLocaleString("id-ID")} per pemilik). Buka lewat tautan dari pemiliknya.`;

/**
 * Konfirmasi hapus dashboard yang dibagikan (review T-016 R3-CC-2), sejalan dengan hapus dataset:
 * siapa yang kehilangan akses. null = tidak dibagikan (atau bukan pemilik).
 */
export function deleteLostAccess(
  access: { orgShared: boolean; shareCount: number } | null | undefined,
): string | null {
  if (!access || (!access.orgShared && access.shareCount === 0)) return null;
  const people = `${access.shareCount.toLocaleString("id-ID")} orang`;
  const who =
    access.shareCount > 0 && access.orgShared
      ? `${people} dan seluruh organisasi`
      : access.shareCount > 0
        ? people
        : "Seluruh organisasi";
  return `${who} kehilangan akses ke dashboard ini.`;
}

export const EDITOR_WARNING = "Editor dapat membaca semua kolom tidak tersembunyi dataset ini.";
export const FILTER_WARNING =
  "Filter dashboard juga menyaring kolom bernama sama di sheet lain dataset ini; viewer bisa membandingkan hasil widget sheet itu dengan nilai filter.";

/**
 * Peringatan editor: sudah ada grant EDITOR (atau server menandainya), atau peran yang sedang dipilih
 * untuk ditambahkan adalah EDITOR — pemilik membacanya SEBELUM menekan "Bagikan".
 */
export function showEditorWarning(
  grants: readonly Pick<ShareGrantView, "role">[],
  warnings: Pick<ShareWarnings, "editor">,
  adding: ShareRole,
): boolean {
  return warnings.editor || adding === "EDITOR" || grants.some((g) => g.role === "EDITOR");
}

/**
 * Ganti peran di daftar akses: naik ke EDITOR dikonfirmasi dulu dengan peringatan editor — di ponsel
 * peringatan di bagian "Tambah orang" bisa di luar layar (review T-016 R3-UI-2). Turun ke VIEWER
 * langsung disimpan; peran sama → tidak ada aksi.
 */
export const roleChangeStep = (from: ShareRole, to: ShareRole): "none" | "confirm" | "save" =>
  from === to ? "none" : to === "EDITOR" ? "confirm" : "save";

/** Peringatan kolom filter lintas sheet: hanya bila server menemukan nama kolomnya. */
export const showFilterWarning = (w: Pick<ShareWarnings, "filterColumns">) =>
  w.filterColumns.length > 0;

/** Sama dengan aturan server: prefix email/nama minimal 3 karakter (bukan daftar semua pengguna). */
export const SEARCH_MIN = 3;
export const searchable = (q: string) => q.trim().length >= SEARCH_MIN;
/** Sama dengan batas server: hasil pencarian tidak pernah lebih dari ini. */
export const SEARCH_MAX = 10;

export type PickerPhase = "idle" | "loading" | "done" | "error";

/**
 * Hasil pencarian yang diteruskan ke pemanggil (onResults). Gagal = daftar kosong: daftar opsi tidak
 * tampil saat galat, jadi pilihan sebelumnya ikut dibuang — "Bagikan" tidak memberi akses ke orang
 * yang sudah tidak terlihat (review T016-CL-1).
 */
export const visibleResults = (res: ShareActionResult<ShareUserOption[]> | null) =>
  res?.ok ? res.data : [];

/** Pilihan tetap hanya bila orangnya masih ada di hasil yang terlihat (yang terlihat = yang dipilih). */
export const keepSelection = (
  user: ShareUserOption | null,
  items: readonly ShareUserOption[],
): ShareUserOption | null => (user && items.some((i) => i.id === user.id) ? user : null);

/** Baris status pemilih pengguna (role=status, dibacakan sopan); kosong saat galat (ada FormAlert). */
export function pickerStatus(phase: PickerPhase, count: number, itemsFor: string): string {
  if (phase === "idle") return `Ketik minimal ${SEARCH_MIN} huruf email atau nama rekan.`;
  if (phase === "loading") return "Mencari pengguna…";
  if (phase === "error") return "";
  if (count === 0) {
    return `Tidak ada pengguna aktif yang cocok dengan “${itemsFor}”. Periksa ejaannya atau ketik email lengkap.`;
  }
  if (count >= SEARCH_MAX) {
    return `Menampilkan ${SEARCH_MAX} hasil pertama. Ketik email atau nama yang lebih lengkap bila rekan belum terlihat.`;
  }
  return `${count} pengguna ditemukan.`;
}

export type AccessKind = "private" | "people" | "org";

/**
 * Badge akses dashboard milik sendiri di /dashboards: "Pribadi", "N orang", "Organisasi" — berbagi
 * organisasi DAN orang tertentu (mis. editor) tampil sebagai dua badge agar editor tidak tersembunyi.
 */
export function accessLabels(d: {
  orgShared: boolean;
  shareCount: number;
}): { kind: AccessKind; text: string }[] {
  const people =
    d.shareCount > 0
      ? [{ kind: "people" as const, text: `${d.shareCount.toLocaleString("id-ID")} orang` }]
      : [];
  if (d.orgShared) return [{ kind: "org", text: "Organisasi" }, ...people];
  return people.length ? people : [{ kind: "private", text: "Pribadi" }];
}

export const NETWORK_ERROR = "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.";

/** Pesan galat aksi share: pesan server sudah aman ditampilkan; null = aksi melempar (jaringan). */
export function shareErrorText(r: Extract<ShareActionResult<unknown>, { ok: false }> | null) {
  if (!r) return NETWORK_ERROR;
  return r.message || "Pengaturan berbagi belum bisa disimpan. Coba lagi.";
}

/**
 * Ganti peran gagal karena orangnya sudah tidak punya akses (barisnya hilang dari daftar yang dimuat
 * ulang); didahului emailnya (review T-016 R6-UI-1).
 */
export const ROLE_GONE =
  "sudah tidak punya akses ke dashboard ini (mis. dicabut di tab atau perangkat lain). Daftar akses sudah diperbarui.";

/** Hasil "Bagikan" setelah email penerimanya (pengumuman dan baris terlihat, R6-UI-3). */
export const grantResult = (role: ShareRole) =>
  `kini ${role === "EDITOR" ? "bisa mengedit widget" : "bisa melihat"} dashboard ini.`;

/** Pengumuman hasil (wilayah aria-live): email = identitas yang tidak bisa dipalsukan nama. */
export const announce = {
  grant: (email: string, role: ShareRole) => `${email} ${grantResult(role)}`,
  role: (email: string, role: ShareRole) => `Peran ${email} diubah menjadi ${roleLabel(role)}.`,
  revoke: (email: string) => `Akses ${email} dicabut.`,
  org: (on: boolean) =>
    on
      ? "Dashboard dibagikan ke seluruh organisasi (hanya lihat)."
      : "Berbagi ke seluruh organisasi dimatikan.",
};
