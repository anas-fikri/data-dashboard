import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getSessionUser } from "@/features/auth/session";
import { env } from "@/lib/env";

export const metadata = { title: "Daftar" };

type Search = Promise<{ resend?: string }>;

export default async function RegisterPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  if (await getSessionUser()) redirect("/");
  const resend = params.resend === "1";
  const allowedDomains = env().ALLOWED_EMAIL_DOMAINS;

  return (
    <AuthCard
      title={resend ? "Kirim ulang verifikasi" : "Daftar"}
      description={
        resend
          ? "Masukkan email yang Anda daftarkan. Tautan aktivasi baru akan dikirim."
          : "Akun hanya untuk karyawan dengan email perusahaan."
      }
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Masuk
          </Link>
          {!resend ? (
            <>
              {" · "}
              <Link
                href="/register?resend=1"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Kirim ulang verifikasi
              </Link>
            </>
          ) : null}
        </>
      }
    >
      <RegisterForm allowedDomains={allowedDomains} resend={resend} />
    </AuthCard>
  );
}
