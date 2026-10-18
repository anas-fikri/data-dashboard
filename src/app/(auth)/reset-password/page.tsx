import { IconLinkOff } from "@tabler/icons-react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { previewPasswordReset } from "@/features/auth/password-recovery";

type Search = Promise<{ token?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }) {
  const { token } = await searchParams;
  const preview = await previewPasswordReset(token);
  if (!preview.ok) return { title: "Tautan tidak berlaku" };
  return { title: preview.data.firstTime ? "Buat password" : "Atur ulang password" };
}

/** Tautan dari email: GET hanya menampilkan form, token dipakai saat POST. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Search }) {
  const { token } = await searchParams;
  const preview = await previewPasswordReset(token);

  if (!preview.ok || !token) {
    return (
      <AuthCard
        title="Tautan tidak berlaku"
        description="Tautan sudah dipakai atau kedaluwarsa (atur ulang berlaku 30 menit, undangan 72 jam)."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <IconLinkOff size={28} stroke={1.5} />
          </span>
          <Button asChild size="lg" className="w-full">
            <Link href="/lupa-password">Minta tautan baru</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={preview.data.firstTime ? "Buat password" : "Atur ulang password"}
      description={
        preview.data.firstTime
          ? `Akun ${preview.data.email} dibuat oleh admin. Buat password untuk masuk.`
          : `Akun ${preview.data.email}.`
      }
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
