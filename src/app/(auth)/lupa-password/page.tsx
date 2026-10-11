import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getSessionUser } from "@/features/auth/session";

export const metadata = { title: "Lupa password" };

export default async function ForgotPasswordPage() {
  if (await getSessionUser()) redirect("/akun/keamanan");
  return <ForgotPasswordForm />;
}
