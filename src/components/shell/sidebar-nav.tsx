"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./nav-items";

interface SidebarNavProps {
  isAdmin: boolean;
  /** Mode ikon saja (sidebar diciutkan). */
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Daftar navigasi; dipakai sidebar desktop dan drawer ponsel. */
export function SidebarNav({ isAdmin, collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin).map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-primary",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon size={20} stroke={1.5} aria-hidden className="shrink-0" />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
