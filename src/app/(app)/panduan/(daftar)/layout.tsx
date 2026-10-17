import type { ReactNode } from "react";
import { requireUser } from "@/features/auth/session";

/**
 * Gerbang sesi daftar panduan di LUAR batas loading.tsx (T-0vjt): tanpa sesi tetap 307 ke /login,
 * bukan 200 + pengalihan di peramban setelah kerangka terkirim. Artikel (/panduan/[slug]) sengaja di
 * luar grup ini agar artikel di luar peran tetap 404. Galat database → error.tsx /panduan.
 */
export default async function GuidesListLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}
