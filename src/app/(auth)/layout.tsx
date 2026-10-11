import type { ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/** Layout halaman auth: tanpa sidebar; satu kartu terpusat, brand di atas, tema di pojok. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex h-(--topbar-h) items-center justify-between px-4 sm:px-6">
        <Brand inline />
        <ThemeToggle />
      </header>
      <main
        id="konten"
        className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
