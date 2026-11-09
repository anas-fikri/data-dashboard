import { AdminCrumb } from "@/components/admin/admin-crumb";
import { BackupArchives } from "@/components/admin/backup-archives";
import { BackupStatusCard } from "@/components/admin/backup-status";
import { OffsiteForm } from "@/components/admin/offsite-form";
import { RetentionForm } from "@/components/admin/retention-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { getBackupPage } from "@/features/backup/service";

export const metadata = { title: "Backup · Admin" };

export default async function AdminBackupPage() {
  await requireAdmin();
  const { offsite, status, alert, retention, sync } = await getBackupPage();
  const lastSize = status?.lastSizeBytes ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Backup"
        description="Status backup harian, arsipnya, lama simpan, dan salinannya ke NAS Synology di luar server aplikasi."
      />
      <BackupStatusCard status={status} alert={alert} sync={sync} />
      <BackupArchives status={status} />
      <section aria-labelledby="retention-heading" className="flex flex-col gap-3">
        <h2 id="retention-heading" className="text-base font-semibold">
          Lama simpan arsip
        </h2>
        <p className="text-sm text-muted-foreground">
          Setiap backup harian adalah salinan lengkap database dan semua file, jadi ruang yang
          dipakai ± lama simpan × ukuran arsip. Simpan pendek di server (mis. 7 hari) dan panjang di
          NAS (mis. 30 hari).
        </p>
        <RetentionForm
          saved={retention}
          effective={status?.retention ?? null}
          lastSizeBytes={lastSize}
          nasActive={!!offsite?.enabled || !!status?.target}
        />
      </section>
      <section aria-labelledby="offsite-heading" className="flex flex-col gap-3">
        <h2 id="offsite-heading" className="text-base font-semibold">
          Salinan ke NAS Synology (SFTP)
        </h2>
        <p className="text-sm text-muted-foreground">
          Setiap backup harian (terenkripsi) disalin ke folder NAS ini. Bila NAS tidak terjangkau
          atau menolak menyimpan, arsip disimpan sementara di server aplikasi, dikirim ulang
          otomatis (dijeda bertahap sampai 4 jam bila NAS penuh), dan admin diberi tahu lewat email
          serta pemberitahuan di aplikasi.
        </p>
        <p className="text-sm text-muted-foreground">
          Di DSM: aktifkan SFTP (Panel Kontrol › Layanan File › FTP › SFTP), buat akun khusus backup
          tanpa hak admin, lalu beri akun itu izin baca/tulis hanya ke shared folder backup.
        </p>
        <OffsiteForm initial={offsite} lastSizeBytes={lastSize} />
      </section>
    </div>
  );
}
