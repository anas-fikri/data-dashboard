"use client";

import {
  IconHelpCircle,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { usePersistedBoolean } from "@/lib/hooks/use-persisted-boolean";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/features/auth/session";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

const COLLAPSE_KEY = "dd.sidebar.collapsed";

interface AppShellProps {
  user: SessionUser | null;
  /** Pemberitahuan di atas konten setiap halaman (mis. backup bermasalah untuk admin, T-7psf). */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * Kromo aplikasi: topbar (burger <768, brand, utilities: bantuan + tema + akun) dan sidebar
 * (rail persisten ≥768 yang bisa diciutkan ke ikon; drawer + backdrop <768). Konten di <main>.
 */
export function AppShell({ user, notice, children }: AppShellProps) {
  const [collapsed, setCollapsed] = usePersistedBoolean(COLLAPSE_KEY);
  const pathname = usePathname();
  // Drawer terbuka hanya untuk path tempat ia dibuka: berpindah halaman otomatis menutupnya
  // tanpa setState di dalam effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const drawerOpen = openPath === pathname;
  const setDrawerOpen = (open: boolean) => setOpenPath(open ? pathname : null);

  // Tutup drawer saat layar melebar melewati 768 (setState di callback langganan, bukan di body effect).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setOpenPath(null);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleCollapsed = () => setCollapsed(!collapsed);

  const isAdmin = user?.isAdmin ?? false;

  return (
    <div className="flex min-h-dvh">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Lewati ke konten
      </a>

      {/* Sidebar desktop */}
      <aside
        data-testid="sidebar"
        data-collapsed={collapsed}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex",
          collapsed ? "w-(--sidebar-w-collapsed)" : "w-(--sidebar-w)",
        )}
      >
        <div
          className={cn(
            "flex h-(--topbar-h) items-center border-b px-3",
            collapsed && "justify-center",
          )}
        >
          <Brand compact={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <SidebarNav isAdmin={isAdmin} collapsed={collapsed} />
        </div>
        <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
            aria-expanded={!collapsed}
            data-testid="sidebar-collapse"
            className={cn(!collapsed && "w-full justify-start")}
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand aria-hidden />
            ) : (
              <>
                <IconLayoutSidebarLeftCollapse aria-hidden />
                Ciutkan
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-(--topbar-h) items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          {/* Drawer ponsel: overlay + backdrop, fokus terkunci (Radix Dialog) */}
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Buka navigasi"
                data-testid="drawer-open"
              >
                <IconMenu2 aria-hidden />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay
                className="fixed inset-0 z-40 bg-overlay/50 md:hidden"
                data-testid="drawer-backdrop"
              />
              <Dialog.Content
                className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-lg md:hidden"
                data-testid="drawer"
                aria-describedby={undefined}
              >
                <Dialog.Title className="sr-only">Navigasi</Dialog.Title>
                <div className="flex h-(--topbar-h) items-center justify-between border-b px-3">
                  <Brand />
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Tutup navigasi">
                      <IconX aria-hidden />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <SidebarNav isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="md:hidden">
            <Brand mobile />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Panduan penggunaan">
              <Link href="/panduan">
                <IconHelpCircle aria-hidden />
              </Link>
            </Button>
            <ThemeToggle />
            <AccountMenu user={user} />
          </div>
        </header>

        <main
          id="konten"
          tabIndex={-1}
          className="mx-auto w-full max-w-(--content-max) flex-1 px-4 py-6 outline-none sm:px-6"
        >
          {notice}
          {children}
        </main>
      </div>
    </div>
  );
}
