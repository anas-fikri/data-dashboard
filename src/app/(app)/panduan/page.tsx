import { IconBook2 } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { GuideMarkdown } from "@/features/guides/markdown";
import { guideOrigins } from "@/features/guides/origins";
import { publishedGuides } from "@/features/guides/service";

export const metadata = { title: "Panduan" };

/**
 * Panduan penggunaan: artikel terbit sesuai urutan admin (T-020). Penyaringan per peran, kartu "Mulai
 * di sini", pencarian, dan bantuan kontekstual menyusul di T-022.
 */
export default async function Page() {
  const user = await requireUser();
  // Artikel untuk peran Admin hanya untuk admin (sisa penyaringan per peran di T-022).
  const guides = await publishedGuides(
    user.isAdmin ? ["OWNER", "EDITOR", "VIEWER", "ADMIN"] : ["OWNER", "EDITOR", "VIEWER"],
  );
  const origins = guideOrigins();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Panduan penggunaan" />
      {guides.length ? (
        <ol aria-label="Artikel panduan" className="flex max-w-3xl flex-col gap-4">
          {guides.map((g) => (
            <li
              key={g.id}
              id={g.slug}
              data-testid="guide-article"
              className="rounded-lg border bg-card p-5 shadow-xs"
            >
              <article aria-labelledby={`${g.slug}-title`}>
                <h2 id={`${g.slug}-title`} className="mb-3 text-lg font-semibold">
                  {g.title}
                </h2>
                <GuideMarkdown markdown={g.bodyMarkdown} origins={origins} />
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<IconBook2 />}
          title="Panduan belum tersedia"
          description="Admin belum menerbitkan artikel panduan. Coba lagi nanti."
        />
      )}
    </div>
  );
}
