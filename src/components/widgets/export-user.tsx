"use client";

import { createContext, use, type ReactNode } from "react";

/*
 * Id user yang masuk untuk kunci export-store.ts (review T-017 R2-CL-1), dari props server halaman
 * dashboard — bukan tebakan klien. Ekspor user lain di tab yang sama (keluar → masuk lagi tanpa memuat
 * ulang halaman) tetap di store di bawah kuncinya sendiri dan tidak pernah tampil di kartu user ini.
 */
const ExportUser = createContext("");

export function ExportUserProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <ExportUser value={userId}>{children}</ExportUser>;
}

/** "" di luar halaman dashboard (tidak ada kartu widget di sana). */
export const useExportUser = () => use(ExportUser);
