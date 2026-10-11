import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getSessionUser } from "@/features/auth/session";
import { env } from "@/lib/env";

type Search = Promise<{ resend?: string }>;

/** Judul tab mengikuti mode (WCAG 2.4.2). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const { resend } = await searchParams;
  return { title: resend === "1" ? "Kirim ulang verifikasi" : "Daftar" };
}

export default async function RegisterPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  if (await getSessionUser()) redirect("/");
  return (
    <RegisterForm allowedDomains={env().ALLOWED_EMAIL_DOMAINS} resend={params.resend === "1"} />
  );
}
