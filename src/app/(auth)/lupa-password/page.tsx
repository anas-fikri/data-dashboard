import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getSessionUser } from "@/features/auth/session";
import { env } from "@/lib/env";

export const metadata = { title: "Lupa password" };

export default async function ForgotPasswordPage() {
  if (await getSessionUser()) redirect("/akun/keamanan");
  return <ForgotPasswordForm allowedDomains={env().ALLOWED_EMAIL_DOMAINS} />;
}
