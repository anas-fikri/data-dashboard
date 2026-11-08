"use client";

import { createContext, useContext, useMemo } from "react";
import {
  statusColorsOf,
  type DashboardColors,
  type Palette,
  type Tone,
  type WidgetColors,
} from "@/features/widgets/tone";

/*
 * Warna dashboard: template warna status (v1.9.0) — widget tanpa template sendiri mengikuti ini — dan
 * tema grafik (v1.10.0) untuk warna seri semua grafik, di layar dan PDF. null di luar dashboard (mis.
 * editor pivot tersimpan); { colors: null } = dashboard memakai bawaan.
 */
export const DashboardColorsContext = createContext<{ colors: DashboardColors | null } | null>(
  null,
);

/** Template status dashboard yang berlaku untuk widget di dalamnya; undefined bila bawaan/di luar. */
export function useDashboardColors(): WidgetColors | undefined {
  return statusColorsOf(useContext(DashboardColorsContext)?.colors);
}

/** Penilaian warna bawaan dashboard (v1.11.0); undefined = tidak diatur/di luar dashboard. */
export function useDashboardTone(): Tone | undefined {
  return useContext(DashboardColorsContext)?.colors?.tone;
}

/** Tema grafik dashboard; undefined = palet aplikasi. */
export function useDashboardPalette(): Palette | undefined {
  const p = useContext(DashboardColorsContext)?.colors?.palette;
  return p && p !== "default" ? p : undefined;
}

/** Di dalam dashboard: { colors } (bisa null); di luar: null. Untuk pilihan "Ikuti dashboard" di panel. */
export function useDashboardColorsScope() {
  return useContext(DashboardColorsContext);
}

/**
 * Penyedia warna dashboard; komponen client agar bisa dipakai dari server component (PDF). Tema grafik
 * dipasang sebagai data-palette (globals.css mengganti --chart-1…6 di dalamnya); `contents` tidak
 * mengubah tata letak.
 */
export function DashboardColorsProvider({
  colors,
  children,
}: {
  colors: DashboardColors | null;
  children: React.ReactNode;
}) {
  const palette = colors?.palette && colors.palette !== "default" ? colors.palette : undefined;
  // Objek stabil: widget tidak ikut dirender ulang di setiap render kanvas (mis. saat menyeret).
  const value = useMemo(() => ({ colors }), [colors]);
  return (
    <DashboardColorsContext.Provider value={value}>
      <div className="contents" data-palette={palette}>
        {children}
      </div>
    </DashboardColorsContext.Provider>
  );
}
