import { IconMailX } from "@tabler/icons-react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/verify-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { previewVerification } from "@/features/auth/service";

export const metadata = { title: "Aktifkan akun" };

type Search = Promise<{ token?: string }>;

/**
 * Tautan dari email membuka halaman konfirmasi (GET tidak memakai token). Aktivasi terjadi
 * lewat POST saat tombol ditekan, sehingga pemindai tautan email tidak mengaktifkan akun.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Search }) {
  const { token } = await searchParams;
  const preview = await previewVerification(token);

  if (!preview.ok || !token) {
    return (
      <EmptyState
        as="h1"
        icon={<IconMailX />}
        title="Tautan tidak berlaku"
        description="Tautan aktivasi sudah dipakai atau kedaluwarsa (berlaku 24 jam). Minta tautan baru."
        action={
          <Button asChild className="w-full sm:w-auto">
            <Link href="/register?resend=1">Kirim ulang email verifikasi</Link>
          </Button>
        }
        className="bg-card"
      />
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
