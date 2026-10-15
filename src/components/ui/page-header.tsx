import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Aksi utama/sekunder; di <768 ditumpuk dan full-width. */
  actions?: ReactNode;
  /** Breadcrumb atau label konteks di atas judul. */
  eyebrow?: ReactNode;
  /** Keterangan singkat di bawah judul/deskripsi (mis. badge peran + pemilik dashboard bersama). */
  meta?: ReactNode;
  className?: string;
}

/**
 * Satu h1 per halaman; fokus utama + satu CTA utama (gerbang hierarki plugin). ≥ 768 px: judul dan aksi
 * sebaris; judul paling sempit 16rem — bila aksi (mis. "Bagikan" + "Ubah tata letak") tidak muat di
 * sisanya, aksi turun ke baris sendiri, bukan memeras h1 jadi 6 baris (review T-016 R2-UI-5).
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b pb-5 md:flex-row md:flex-wrap md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 md:grow md:basis-64">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-balance break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {meta ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center [&>*]:w-full md:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
