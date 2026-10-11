import {
  IconBook2,
  IconDatabase,
  IconHome,
  IconLayoutDashboard,
  IconShieldLock,
  type Icon,
} from "@tabler/icons-react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
}

/** Navigasi utama ≤ 7 item (gerbang app-shell). Admin hanya untuk isAdmin. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Beranda", icon: IconHome },
  { href: "/datasets", label: "Dataset", icon: IconDatabase },
  { href: "/dashboards", label: "Dashboard", icon: IconLayoutDashboard },
  { href: "/panduan", label: "Panduan", icon: IconBook2 },
  { href: "/admin", label: "Admin", icon: IconShieldLock, adminOnly: true },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
