import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/features/auth/session";

/** Semua halaman produk memakai shell. Halaman auth (login/register) berada di luar grup ini. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <AppShell user={user}>{children}</AppShell>;
}
