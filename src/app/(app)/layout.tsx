import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { BackupBanner } from "@/components/admin/backup-banner";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/features/auth/session";
import { currentBackupAlert } from "@/features/backup/service";
import { logger } from "@/lib/logger";

/** Semua halaman produk memakai shell. Halaman auth (login/register) berada di luar grup ini. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Database tidak terjangkau: shell tetap tampil (tanpa menu akun) dan galat yang sama dilempar oleh
  // requireUser halaman → error.tsx segmennya, bukan galat global (T-0vjt). Null = hak paling sedikit;
  // galat internal Next (render dinamis, redirect) tetap diteruskan.
  // shortcut: layout dan halaman masing-masing membaca sesi (bukan React cache: aksi yang mengubah sesi
  // lalu membacanya di permintaan yang sama akan mendapat hasil basi); gangguan sesaat bisa membuat shell
  // tanpa menu akun sampai muat ulang — gabungkan bila pembacaan sesi per permintaan dirapikan.
  const user = await getSessionUser().catch((e: unknown) => {
    unstable_rethrow(e);
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "sesi shell gagal dibaca");
    return null;
  });
  // Backup bermasalah (gagal, > 26 jam, salinan off-VM tertunda) tampil untuk admin di setiap halaman.
  const alert = user?.isAdmin ? await currentBackupAlert() : null;
  return (
    <AppShell user={user} notice={alert ? <BackupBanner alert={alert} /> : null}>
      {children}
    </AppShell>
  );
}
