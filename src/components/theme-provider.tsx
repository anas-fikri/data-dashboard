"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Tema via kelas .dark di <html>; ikut sistem secara default. Script inline next-themes
 * (mencegah kilasan tema) diberi nonce CSP dari proxy agar tidak diblokir 'strict-dynamic'.
 */
export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
