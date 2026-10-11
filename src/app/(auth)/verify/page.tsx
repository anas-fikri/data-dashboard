import { IconLinkOff } from "@tabler/icons-react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/verify-form";
import { Button } from "@/components/ui/button";
import { previewVerification } from "@/features/auth/service";

export const metadata = { title: "Aktifkan akun" };

type Search = Promise<{ token?: string }>;

/**
 * Tautan dari email membuka halaman konfirmasi (GET tidak memakai token). Aktivasi terjadi
 * lewat POST + password pendaftaran, sehingga pemindai tautan email tidak mengaktifkan akun.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Search }) {
  const { token } = await searchParams;
  const preview = await previewVerification(token);

  if (!preview.ok || !token) {
    return (
      <AuthCard
        title="Tautan tidak berlaku"
        description="Tautan aktivasi sudah dipakai atau kedaluwarsa (berlaku 24 jam)."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <IconLinkOff size={28} stroke={1.5} />
          </span>
          <Button asChild size="lg" className="w-full">
            <Link href="/register?resend=1">Kirim ulang email verifikasi</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const requested = preview.data.requestedAt.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <AuthCard
      title="Aktifkan akun"
      description={`Akun untuk ${preview.data.email}, didaftarkan ${requested} WIB.`}
      footer="Tidak merasa mendaftar? Abaikan halaman ini; akun tidak akan aktif."
    >
      <VerifyForm token={token} />
    </AuthCard>
  );
}
