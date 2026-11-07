"use client";

import { createContext, useContext } from "react";
import type { WidgetColors } from "@/features/widgets/tone";

/*
 * Template warna status dashboard (v1.9.0): widget tanpa template sendiri mengikuti ini, di layar dan
 * PDF. null di luar dashboard (mis. editor pivot tersimpan); { colors: null } = dashboard memakai bawaan.
 */
export const DashboardColorsContext = createContext<{ colors: WidgetColors | null } | null>(null);

/** Template dashboard yang berlaku untuk widget di dalamnya; undefined bila tidak diatur/di luar dashboard. */
export function useDashboardColors(): WidgetColors | undefined {
  return useContext(DashboardColorsContext)?.colors ?? undefined;
}

/** Di dalam dashboard: { colors } (bisa null); di luar: null. Untuk pilihan "Ikuti dashboard" di panel. */
export function useDashboardColorsScope() {
  return useContext(DashboardColorsContext);
}

/** Penyedia template dashboard; komponen client agar bisa dipakai dari server component (PDF). */
export function DashboardColorsProvider({
  colors,
  children,
}: {
  colors: WidgetColors | null;
  children: React.ReactNode;
}) {
  return (
    <DashboardColorsContext.Provider value={{ colors }}>{children}</DashboardColorsContext.Provider>
  );
}
