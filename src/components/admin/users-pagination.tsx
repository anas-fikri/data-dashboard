import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { UserStatusFilter } from "@/features/admin/types";
import { usersHref } from "./users-url";

/* Di ponsel tombol hanya ikon (44px, nama tetap terbaca pembaca layar); label tampil mulai 640. */
const NAV_BTN = "h-(--control-h-lg) w-(--control-h-lg) px-0 sm:w-auto sm:px-4 md:h-(--control-h)";
const LABEL = "sr-only sm:not-sr-only";

interface UsersPaginationProps {
  q: string;
  status: UserStatusFilter;
  page: number;
  totalPages: number;
}

/** Sebelumnya/berikutnya; posisi tombol tetap (tombol nonaktif di ujung, bukan hilang). */
export function UsersPagination({ q, status, page, totalPages }: UsersPaginationProps) {
  if (totalPages <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const prev = (
    <>
      <IconChevronLeft aria-hidden />
      <span className={LABEL}>Sebelumnya</span>
    </>
  );
  const next = (
    <>
      <span className={LABEL}>Berikutnya</span>
      <IconChevronRight aria-hidden />
    </>
  );
  return (
    <nav aria-label="Halaman daftar pengguna" className="flex items-center justify-between gap-3">
      {hasPrev ? (
        <Button asChild variant="outline" className={NAV_BTN}>
          <Link href={usersHref({ q, status, page: page - 1 })} rel="prev">
            {prev}
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled className={NAV_BTN}>
          {prev}
        </Button>
      )}
      <p className="text-sm text-muted-foreground tabular-nums">
        Halaman {page} dari {totalPages}
      </p>
      {hasNext ? (
        <Button asChild variant="outline" className={NAV_BTN}>
          <Link href={usersHref({ q, status, page: page + 1 })} rel="next">
            {next}
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled className={NAV_BTN}>
          {next}
        </Button>
      )}
    </nav>
  );
}
