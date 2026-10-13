import { IconSearch, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const USERS_PATH = "/admin/pengguna";

const CONTROL = "h-(--control-h-lg) md:h-(--control-h)";

/** Pencarian GET biasa (?q=): bekerja tanpa JavaScript dan selalu kembali ke halaman 1. */
export function UsersSearch({ q }: { q: string }) {
  return (
    <form
      role="search"
      action={USERS_PATH}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div className="relative sm:w-80">
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
          <Link href={USERS_PATH}>
            <IconX aria-hidden />
            Hapus pencarian
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
