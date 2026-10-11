import { IconMailCheck, IconMailX } from "@tabler/icons-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { clientIp } from "@/features/auth/rate-limit";
import { verifyEmail } from "@/features/auth/service";
import { env } from "@/lib/env";

export const metadata = { title: "Verifikasi email" };

type Search = Promise<{ token?: string }>;

/** Tautan dari email: token sekali pakai. Sukses → /login?verified=1. */
export default async function VerifyPage({ searchParams }: { searchParams: Search }) {
  const { token } = await searchParams;
  const result = await verifyEmail(token, clientIp(await headers(), env().TRUST_PROXY));
  if (result.ok) redirect("/login?verified=1");

  const rateLimited = result.code === "RATE_LIMITED";
  return (
    <EmptyState
      as="h1"
      icon={rateLimited ? <IconMailX /> : <IconMailCheck />}
      title={rateLimited ? "Terlalu banyak percobaan" : "Tautan tidak berlaku"}
      description={
        rateLimited
          ? "Tunggu beberapa menit lalu buka tautan dari email lagi."
          : "Tautan verifikasi sudah dipakai atau kedaluwarsa (berlaku 24 jam). Minta tautan baru."
      }
      action={
        <Button asChild className="w-full sm:w-auto">
          <Link href="/register?resend=1">Kirim ulang email verifikasi</Link>
        </Button>
      }
      className="bg-card"
    />
  );
}
