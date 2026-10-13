import { IconSearch, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserStatusFilter } from "@/features/admin/types";
import { UsersStatusFilter } from "./users-status-filter";
import { USERS_PATH, usersHref } from "./users-url";

const CONTROL = "h-(--control-h-lg) md:h-(--control-h)";

/**
 * Pencarian GET biasa (?q=, bekerja tanpa JavaScript) + saringan status. Keduanya selalu ikut satu
 * sama lain dan kembali ke halaman 1. Di ponsel kontrol ditumpuk full-width.
 */
export function UsersSearch({ q, status }: { q: string; status: UserStatusFilter }) {
  return (
    <form
      role="search"
      action={USERS_PATH}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <div className="relative min-w-0 sm:max-w-80 sm:flex-1 sm:basis-56">
        <label htmlFor="q" className="sr-only">
          Cari pengguna menurut email atau nama
        </label>
        <IconSearch
          size={20}
          stroke={1.5}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          autoComplete="off"
          placeholder="Cari email atau nama"
          className={`${CONTROL} pl-10`}
        />
      </div>
      {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
      <UsersStatusFilter status={status} className="sm:w-48" />
      <Button
        type="submit"
        variant="outline"
        leadingIcon={<IconSearch aria-hidden />}
        className={`${CONTROL} w-full sm:w-auto`}
      >
        Cari
      </Button>
      {q ? (
        <Button asChild variant="ghost" className={`${CONTROL} w-full sm:w-auto`}>
          {/* Hanya kata kunci yang dihapus; saringan status tetap. */}
          <Link href={usersHref({ status })}>
            <IconX aria-hidden />
            Hapus pencarian
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
