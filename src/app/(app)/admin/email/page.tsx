import { AdminCrumb } from "@/components/admin/admin-crumb";
import { SmtpForm } from "@/components/admin/smtp-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { getSmtpPage } from "@/features/smtp/service";

export const metadata = { title: "Email · Admin" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });

export default async function AdminEmailPage() {
  const me = await requireAdmin();
  const smtp = getSmtpPage();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Email (SMTP)"
        description="Server pengirim email aplikasi: verifikasi akun, undangan, atur ulang password, berbagi, dan notifikasi backup."
      />
      <p className="text-sm text-muted-foreground" data-testid="smtp-source">
        {smtp.source === "app"
          ? `Memakai pengaturan dari halaman ini${smtp.updatedAt ? ` (diubah ${when(smtp.updatedAt)} WIB${smtp.updatedBy ? ` oleh ${smtp.updatedBy}` : ""})` : ""}.`
          : "Memakai pengaturan bawaan server (.env.prod). Simpan untuk mengelolanya dari halaman ini."}
      </p>
      <SmtpForm initial={smtp} adminEmail={me.email} />
    </div>
  );
}
