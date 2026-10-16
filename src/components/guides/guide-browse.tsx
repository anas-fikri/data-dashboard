import { IconCircleCheck, IconSearch, IconVideo } from "@tabler/icons-react";
import type { GuideRole } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEARCH_MAX, type GuideSummary } from "@/features/guides/reader";
import { cn } from "@/lib/utils";

/** Nilai ?peran= per peran (URL berbahasa Indonesia, bisa dibagikan). */
export const ROLE_PARAM: Record<GuideRole, string> = {
  OWNER: "pemilik",
  EDITOR: "editor",
  VIEWER: "viewer",
  ADMIN: "admin",
  ALL: "umum",
};
export const TAB_LABEL: Record<GuideRole, string> = {
  OWNER: "Pemilik data",
  EDITOR: "Editor",
  VIEWER: "Viewer",
  ADMIN: "Admin",
  ALL: "Umum",
};

/** Pindah tab = navigasi (?peran=…), jadi tautan dengan aria-current, bukan tablist (pola SheetTabs). */
export function RoleTabs({ tabs, current }: { tabs: GuideRole[]; current: GuideRole }) {
  return (
    <nav aria-label="Panduan per peran" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((t) => (
          <li key={t}>
            <Link
              href={`/panduan?peran=${ROLE_PARAM[t]}`}
              aria-current={t === current ? "page" : undefined}
              scroll={false}
              className={cn(
                "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm md:h-10",
                t === current
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[t]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Cari judul/isi (GET ?q=, tanpa JavaScript). */
export function GuideSearch({ q }: { q: string }) {
  return (
    <form action="/panduan" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="guide-q" className="text-sm font-medium">
          Cari panduan
        </label>
        <Input
          id="guide-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={SEARCH_MAX}
          placeholder="Mis. unggah, filter, bagikan"
          className="h-(--control-h-lg) md:h-(--control-h)"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        leadingIcon={<IconSearch aria-hidden />}
        className="h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h)"
      >
        Cari
      </Button>
    </form>
  );
}

/** Daftar artikel: judul (tautan), cuplikan, status dibaca, jumlah video. */
export function GuideCards({
  guides,
  read,
  label,
}: {
  guides: (GuideSummary & { excerpt: string })[];
  read: Set<string>;
  /** Nama daftar untuk pembaca layar (mis. "Artikel Pemilik data"). */
  label: string;
}) {
  return (
    <ul aria-label={label} className="grid max-w-3xl gap-3">
      {guides.map((g) => (
        <li key={g.id} data-testid="guide-card" className="rounded-lg border bg-card p-4 shadow-xs">
          <h2 className="text-base font-semibold">
            <Link
              href={`/panduan/${g.slug}`}
              className="[overflow-wrap:anywhere] underline-offset-4 hover:underline"
            >
              {g.title}
            </Link>
          </h2>
          {g.excerpt ? (
            <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {g.excerpt}
            </p>
          ) : null}
          {read.has(g.id) || g.videoCount ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {read.has(g.id) ? (
                <Badge tone="success" icon={<IconCircleCheck />}>
                  Sudah dibaca
                </Badge>
              ) : null}
              {g.videoCount ? (
                <span className="inline-flex items-center gap-1">
                  <IconVideo size={16} stroke={1.5} aria-hidden />
                  {g.videoCount} video
                </span>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
