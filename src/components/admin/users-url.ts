import type { UserStatusFilter } from "@/features/admin/types";

export const USERS_PATH = "/admin/pengguna";

/** Label saringan status; sama dengan teks badge status di daftar. */
export const STATUS_LABEL: Record<UserStatusFilter, string> = {
  all: "Semua status",
  active: "Aktif",
  inactive: "Nonaktif",
  unverified: "Belum verifikasi",
};

/** Tautan daftar pengguna; kata kunci dan saringan status selalu ikut (halaman 1 tidak ditulis). */
export function usersHref({
  q = "",
  status = "all",
  page = 1,
}: {
  q?: string;
  status?: UserStatusFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${USERS_PATH}?${qs}` : USERS_PATH;
}
