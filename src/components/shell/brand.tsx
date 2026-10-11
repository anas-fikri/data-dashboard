import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandProps {
  /** Tanda persegi saja (glyph "P" dari logo resmi), untuk rail ciut. */
  compact?: boolean;
  /** Tanda + nama produk ringkas, untuk topbar ponsel. */
  mobile?: boolean;
  /** Wordmark + nama produk sebaris, untuk header halaman auth. */
  inline?: boolean;
  className?: string;
}

/**
 * Logo PCP Express (wordmark 200×30) + nama produk. Varian gelap memutihkan "PCP"
 * agar terbaca di tema gelap; tanda persegi dipotong presisi dari glyph pertama logo.
 */
export function Brand({ compact = false, mobile = false, inline = false, className }: BrandProps) {
  const mark = (
    <>
      <Image
        src="/brand/mark.png"
        alt=""
        width={28}
        height={28}
        priority
        className="size-7 shrink-0 dark:hidden"
      />
      <Image
        src="/brand/mark-dark.png"
        alt=""
        width={28}
        height={28}
        priority
        className="hidden size-7 shrink-0 dark:block"
      />
    </>
  );

  if (compact || mobile) {
    return (
      <Link
        href="/"
        className={cn("flex h-9 items-center gap-2 rounded-md", className)}
        aria-label="Data Dashboard, ke beranda"
      >
        {mark}
        {mobile ? (
          <span className="hidden text-sm font-semibold tracking-tight min-[360px]:inline">
            Data Dashboard
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className={cn(
        "flex rounded-md",
        inline ? "flex-row items-center gap-3" : "flex-col gap-0.5",
        className,
      )}
      aria-label="Data Dashboard, ke beranda"
    >
      <Image
        src="/brand/pcp-logo.png"
        alt="PCP Express"
        width={120}
        height={18}
        priority
        className="dark:hidden"
      />
      <Image
        src="/brand/pcp-logo-dark.png"
        alt="PCP Express"
        width={120}
        height={18}
        priority
        className="hidden dark:block"
      />
      <span className="text-sm font-semibold leading-none tracking-tight">Data Dashboard</span>
    </Link>
  );
}
