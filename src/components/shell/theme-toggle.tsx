"use client";

import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/lib/hooks/use-persisted-boolean";

/** Ikon di topbar (bukan tombol berlabel di sidebar). Menunggu hidrasi agar tidak mismatch SSR. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Tema gelap"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      data-testid="theme-toggle"
    >
      {dark ? <IconSun aria-hidden /> : <IconMoon aria-hidden />}
    </Button>
  );
}
