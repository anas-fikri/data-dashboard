import { IconBook2, IconSearch } from "@tabler/icons-react";
import type { GuideRole } from "@prisma/client";
import Link from "next/link";
import { Announce } from "@/components/guides/announce";
import {
  GuideCards,
  GuideSearch,
  ROLE_PARAM,
  RoleTabsView,
  TAB_LABEL,
} from "@/components/guides/guide-browse";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import {
  SEARCH_MIN,
  excerptOf,
  guideRolesFor,
  guidesForTab,
  readArticleIds,
  searchGuides,
  searchQuery,
  searchStatus,
} from "@/features/guides/reader";

export const metadata = { title: "Panduan" };

type Search = Promise<{ peran?: string | string[]; q?: string | string[] }>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Panduan penggunaan (T-022): tab per peran yang dimiliki user (diturunkan dari data, lihat
 * guideRolesFor) + Umum; pencarian judul/isi hanya di artikel yang boleh dilihat user.
 */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const roles = await guideRolesFor(user.id, user.isAdmin);
  const sp = await searchParams;
  // Kata kunci bersih yang sama untuk pencarian, isian form, dan teks status (review T-022 NB1).
  const q = searchQuery(one(sp.q));
  const tabs: GuideRole[] = [...roles, "ALL"];
  const current = tabs.find((t) => ROLE_PARAM[t] === one(sp.peran)) ?? tabs[0]!;
  const list = q ? await searchGuides(roles, q) : await guidesForTab(roles, current);
  const read = await readArticleIds(
    user.id,
    list.map((g) => g.id),
  );
  const items = list.map((g) => ({ ...g, excerpt: excerptOf(g.bodyMarkdown) }));
  const status = q ? searchStatus(q, items.length) : "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panduan penggunaan"
        description="Artikel dan video sesuai peran Anda di aplikasi ini."
      />
      <GuideSearch q={q} />
      {q ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {status}{" "}
            <Link href="/panduan" className="font-medium text-primary underline underline-offset-2">
              Lihat semua panduan
            </Link>
          </p>
          <Announce message={status} />
          {items.length ? (
            <GuideCards guides={items} read={read} label={`Hasil pencarian ${q}`} />
          ) : q.length >= SEARCH_MIN ? (
            <EmptyState
              icon={<IconSearch />}
              title="Tidak ada artikel yang cocok"
              description="Coba kata lain yang lebih umum, mis. “unggah” atau “dashboard”."
            />
          ) : null}
        </div>
      ) : (
        <RoleTabsView tabs={tabs} current={current}>
          {items.length ? (
            <GuideCards guides={items} read={read} label={`Artikel ${TAB_LABEL[current]}`} />
          ) : (
            <EmptyState
              icon={<IconBook2 />}
              title="Belum ada artikel di sini"
              description="Admin belum menerbitkan panduan untuk peran ini. Coba tab lain atau cari."
            />
          )}
        </RoleTabsView>
      )}
    </div>
  );
}
