import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { BackupBanner } from "@/components/admin/backup-banner";
import { StorageBanner } from "@/components/admin/storage-banner";
import { AppShell } from "@/components/shell/app-shell";
import { QuotaBanner } from "@/components/shell/quota-banner";
import { getSessionUser } from "@/features/auth/session";
import { currentBackupAlert } from "@/features/backup/service";
import { currentQuotaAlert } from "@/features/uploads/quota";
import { currentIntegrityAlert } from "@/features/versions/integrity-status";
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
  const [alert, storage, quota] = await Promise.all([
    user?.isAdmin ? currentBackupAlert() : null,
    user?.isAdmin ? currentIntegrityAlert() : null,
    // Penyimpanan pengguna ≥ 80% kuota (T-039): untuk semua pengguna, di-cache 60 detik.
    user ? currentQuotaAlert(user.id) : null,
  ]);
  // File data terujuk hilang (pemeriksaan malam T-038) lebih mendesak daripada backup → di atas.
  const notice =
    alert || storage || quota ? (
      <>
        {storage ? <StorageBanner alert={storage} /> : null}
        {alert ? <BackupBanner alert={alert} /> : null}
        {quota ? <QuotaBanner alert={quota} /> : null}
      </>
    ) : null;
  return (
    <AppShell user={user} notice={notice}>
      {children}
    </AppShell>
  );
}
