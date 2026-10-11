import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/** Layout halaman auth: tanpa sidebar; satu kartu terpusat, brand di atas, tema di pojok. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex h-(--topbar-h) items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Data Dashboard, ke beranda" className="flex items-center gap-3">
          <Image
            src="/brand/pcp-logo.png"
            alt="PCP Express"
            width={120}
            height={18}
            className="dark:hidden"
            priority
          />
          <Image
            src="/brand/pcp-logo-dark.png"
            alt="PCP Express"
            width={120}
            height={18}
            className="hidden dark:block"
            priority
          />
          <span className="text-sm font-semibold tracking-tight">Data Dashboard</span>
        </Link>
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
