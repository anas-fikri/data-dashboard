import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Ikon Tabler, dirender 28px. */
  icon: ReactNode;
  title: string;
  description?: string;
  /** Aksi utama (Button) — pemanggil memberi w-full sm:w-auto bila CTA utama. */
  action?: ReactNode;
  /** Elemen judul: h1 untuk halaman penuh (mis. 404), h2 di dalam kartu/section, p bila sudah ada heading. */
  as?: "h1" | "h2" | "h3" | "p";
  /** Tanpa bingkai (dipakai di dalam Card agar tidak ada kotak di dalam kotak). */
  bare?: boolean;
  className?: string;
}

/** Keadaan kosong yang menjelaskan apa yang bisa dilakukan, bukan hanya "tidak ada data". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  as: Title = "h2",
  bare = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        !bare && "rounded-lg border border-dashed",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-7 [&_svg]:stroke-[1.5]"
      >
        {icon}
      </span>
      <div className="max-w-sm">
        <Title className={cn("font-semibold", Title === "h1" ? "text-xl" : "text-base")}>
          {title}
        </Title>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2 w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}
