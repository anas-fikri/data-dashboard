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
        description="Status backup harian dan target salinan di luar server aplikasi (off-VM)."
      />
      <BackupStatusCard status={status} alert={alert} />
      <section aria-labelledby="offsite-heading" className="flex flex-col gap-3">
        <h2 id="offsite-heading" className="text-base font-semibold">
          Target salinan off-VM (S3)
        </h2>
        <p className="text-sm text-muted-foreground">
          Setiap backup harian (terenkripsi) disalin ke target ini. Bila target tidak terjangkau,
          arsip disimpan sementara di server aplikasi, dikirim ulang otomatis tiap 30 menit, dan
          admin diberi tahu lewat email serta pemberitahuan di aplikasi.
        </p>
        <OffsiteForm initial={offsite} />
      </section>
    </div>
  );
}
