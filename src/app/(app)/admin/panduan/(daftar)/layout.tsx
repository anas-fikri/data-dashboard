import type { ReactNode } from "react";
import { requireAdmin } from "@/features/auth/session";

/**
 * Gerbang admin daftar panduan di LUAR batas loading.tsx (T-0vjt): non-admin tetap mendapat status 404
 * (D2), bukan 200 + halaman tidak ditemukan setelah kerangka terkirim. Halaman tetap memeriksa sendiri
 * (layout tidak dirender ulang saat navigasi lunak). Galat database → error.tsx /admin/panduan.
 */
export default async function AdminGuidesListLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
