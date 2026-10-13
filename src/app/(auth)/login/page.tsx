import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/features/auth/redirect";
import { getSessionUser } from "@/features/auth/session";

export const metadata = { title: "Masuk" };

type Search = Promise<{ next?: string; verified?: string; reason?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSessionUser()) redirect(next);

  const notice =
    params.verified === "1"
      ? { tone: "success" as const, text: "Akun aktif. Silakan masuk." }
      : params.reason === "password-reset"
        ? {
            tone: "success" as const,
            text: "Password berhasil diatur ulang. Masuk dengan password baru.",
          }
        : params.reason === "signed-out"
          ? { tone: "success" as const, text: "Anda sudah keluar dari semua perangkat." }
          : params.reason === "expired"
            ? { tone: "error" as const, text: "Sesi berakhir. Silakan masuk kembali." }
            : params.reason === "disabled"
              ? {
                  tone: "error" as const,
                  text: "Akun Anda dinonaktifkan oleh admin Data Dashboard. Bila ini keliru, hubungi tim TI.",
                  testId: "login-disabled-notice",
                }
              : null;

  return (
    <AuthCard
      title="Masuk"
      description="Gunakan email perusahaan Anda."
      footer={
        <>
          Belum punya akun?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Daftar
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
