import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Pil status/peran. Teks selalu text-foreground (kontras ≥ 4.5:1 di kedua tema); nada dibawa ikon
 * dan latar tipis, jadi status tidak hanya lewat warna (pola status-badge.tsx, review desain T-003 #3).
 */
const TONES = {
  neutral: { bg: "bg-muted", icon: "text-muted-foreground" },
  primary: { bg: "bg-primary/12", icon: "text-primary" },
  success: { bg: "bg-success/12", icon: "text-success" },
  warning: { bg: "bg-warning/20", icon: "text-foreground" },
  destructive: { bg: "bg-destructive/12", icon: "text-destructive" },
} as const;

interface BadgeProps {
  tone?: keyof typeof TONES;
  /** Ikon Tabler (dirender 14px, stroke 2); dekoratif karena teks sudah menyebut statusnya. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium text-foreground",
        "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-2",
        t.bg,
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className={cn("inline-flex", t.icon)}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
