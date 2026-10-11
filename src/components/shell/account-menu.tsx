"use client";

import { IconLogin, IconLogout, IconSettings, IconUserCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/session";

interface AccountMenuProps {
  user: SessionUser | null;
}

/** Avatar saja di topbar (semua breakpoint); nama/email hidup di dalam menu. */
export function AccountMenu({ user }: AccountMenuProps) {
  if (!user) {
    return (
      <Button asChild variant="outline">
        <Link href="/login">
          <IconLogin aria-hidden />
          Masuk
        </Link>
      </Button>
    );
  }
  return <SignedInMenu user={user} />;
}

function SignedInMenu({ user }: { user: SessionUser }) {
  const [pending, startTransition] = useTransition();
  const display = user.name ?? user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Menu akun"
          data-testid="account-menu-trigger"
        >
          <Avatar name={display} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-foreground">
          <span className="block truncate text-sm font-medium">{display}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/akun">
            <IconUserCircle aria-hidden />
            Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/akun/keamanan">
            <IconSettings aria-hidden />
            Keamanan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Server action dipanggil dari onSelect: form di dalam menu ter-unmount sebelum submit. */}
        <DropdownMenuItem
          data-testid="logout"
          disabled={pending}
          onSelect={() => startTransition(() => logoutAction())}
        >
          <IconLogout aria-hidden />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
