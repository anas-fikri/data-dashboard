import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Ikon Tabler, dirender 32px. */
  icon: ReactNode;
  title: string;
  description?: string;
  /** Aksi utama (Button) — pemanggil memberi w-full sm:w-auto bila CTA utama. */
  action?: ReactNode;
  className?: string;
}

/** Keadaan kosong yang menjelaskan apa yang bisa dilakukan, bukan hanya "tidak ada data". */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
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
        <p className="text-base font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2 w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}
