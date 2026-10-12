import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Aksi utama/sekunder; di <768 ditumpuk dan full-width. */
  actions?: ReactNode;
  /** Breadcrumb atau label konteks di atas judul. */
  eyebrow?: ReactNode;
  className?: string;
}

/** Satu h1 per halaman; fokus utama + satu CTA utama (gerbang hierarki plugin). */
export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-balance break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center [&>*]:w-full md:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
