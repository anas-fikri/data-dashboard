import { AdminCrumb } from "@/components/admin/admin-crumb";
import { BackupStatusCard } from "@/components/admin/backup-status";
import { OffsiteForm } from "@/components/admin/offsite-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { getBackupPage } from "@/features/backup/service";

export const metadata = { title: "Backup · Admin" };

export default async function AdminBackupPage() {
  await requireAdmin();
  const { offsite, status, alert } = await getBackupPage();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Backup"
        description="Status backup harian dan salinannya ke NAS Synology di luar server aplikasi."
      />
      <BackupStatusCard status={status} alert={alert} />
      <section aria-labelledby="offsite-heading" className="flex flex-col gap-3">
        <h2 id="offsite-heading" className="text-base font-semibold">
          Salinan ke NAS Synology (SFTP)
        </h2>
        <p className="text-sm text-muted-foreground">
          Setiap backup harian (terenkripsi) disalin ke folder NAS ini. Bila NAS tidak terjangkau,
          arsip disimpan sementara di server aplikasi, dikirim ulang otomatis tiap 30 menit, dan
          admin diberi tahu lewat email serta pemberitahuan di aplikasi.
        </p>
        <p className="text-sm text-muted-foreground">
          Di DSM: aktifkan SFTP (Panel Kontrol › Layanan File › FTP › SFTP), buat akun khusus backup
          tanpa hak admin, lalu beri akun itu izin baca/tulis hanya ke shared folder backup.
        </p>
        <OffsiteForm initial={offsite} />
      </section>
    </div>
  );
}
