"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DropdownMenu as Primitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { USER_STATUSES, type UserStatusFilter } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, usersHref } from "./users-url";

const isStatus = (v: string): v is UserStatusFilter => USER_STATUSES.some((s) => s === v);

/*
 * Saringan status (?status=) di bilah pencarian: tombol menu + pilihan radio (pola menu button APG),
 * non-modal, sehingga halaman di belakangnya tidak di-aria-hidden selagi pilihan terbuka (Radix
 * Select yang modal melakukannya → axe aria-hidden-focus). Berlaku begitu dipilih (navigasi klien,
 * fokus kembali ke pemicu), membawa kata kunci yang sedang diketik, dan kembali ke halaman 1.
 */
export function UsersStatusFilter({
  status,
  className,
}: {
  status: UserStatusFilter;
  className?: string;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(status);

  function change(next: string) {
    if (!isStatus(next) || next === shown) return;
    const form = triggerRef.current?.form;
    const typed = form ? String(new FormData(form).get("q") ?? "").trim() : "";
    start(() => {
      setShown(next);
      router.push(usersHref({ q: typed, status: next }), { scroll: false });
    });
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          aria-busy={pending || undefined}
          data-testid="admin-status-filter"
          className={cn(
            "h-(--control-h-lg) w-full justify-between px-3 text-base font-normal md:h-(--control-h) md:text-sm",
            className,
          )}
        >
          {/* Prefiks terlihat: "Nonaktif" saja bisa dibaca "saringan nonaktif". */}
          <span className="truncate">
            <span className="text-muted-foreground">Status:</span>{" "}
            {shown === "all" ? "Semua" : STATUS_LABEL[shown]}
          </span>
          <IconChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        <Primitive.RadioGroup value={shown} onValueChange={change}>
          {USER_STATUSES.map((s) => (
            <Primitive.RadioItem
              key={s}
              value={s}
              className={cn(
                "relative flex h-11 cursor-default select-none items-center rounded-sm pr-2 pl-8 text-sm outline-none md:h-9",
                "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
              )}
            >
              <span className="absolute left-2 flex size-5 items-center justify-center">
                <Primitive.ItemIndicator>
                  <IconCheck size={16} stroke={2} aria-hidden />
                </Primitive.ItemIndicator>
              </span>
              {STATUS_LABEL[s]}
            </Primitive.RadioItem>
          ))}
        </Primitive.RadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
