import { IconBook2 } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { firstGuide, guideRolesFor, hasReadAny } from "@/features/guides/reader";

/**
 * Kartu "Mulai di sini" di Beranda (T-022): tampil sampai user menandai satu artikel sudah dibaca;
 * menuju artikel pertama (urutan admin) yang sesuai perannya. Tanpa artikel terbit → tidak tampil.
 */
export async function StartHereCard({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  if (await hasReadAny(userId)) return null;
  const first = await firstGuide(await guideRolesFor(userId, isAdmin));
  if (!first) return null;
  return (
    <section
      aria-labelledby="start-here-title"
      data-testid="start-here"
      className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <IconBook2 size={20} stroke={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="start-here-title" className="text-base font-semibold">
          Mulai di sini
        </h2>
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          Baru memakai aplikasi ini? Baca “{first.title}”, lalu tandai sudah dibaca.
        </p>
      </div>
      <Button asChild className="h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h)">
        <Link href={`/panduan/${first.slug}`}>Baca panduan</Link>
      </Button>
    </section>
  );
}
