import { IconArrowLeft, IconFileUnknown } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Tidak ditemukan" };

/**
 * 404 dan juga jawaban untuk objek yang tidak boleh diakses (keputusan D2: tidak membedakan
 * "tidak ada" dari "tidak berhak" agar keberadaan objek tidak bocor).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <EmptyState
        icon={<IconFileUnknown />}
        title="Halaman tidak ditemukan"
        description="Tautan mungkin salah, sudah dihapus, atau Anda tidak memiliki akses ke halaman ini."
        action={
          <Button asChild className="w-full sm:w-auto">
            <Link href="/">
              <IconArrowLeft aria-hidden />
              Kembali ke beranda
            </Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  );
}
