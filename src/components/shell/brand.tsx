import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandProps {
  /** Tanda kecil saja (potongan kiri wordmark), untuk rail ciut dan topbar ponsel. */
  compact?: boolean;
  className?: string;
}

/** Logo PCP Express (wordmark 200×30) + nama produk. Tautan ke beranda. */
export function Brand({ compact = false, className }: BrandProps) {
  if (compact) {
    return (
      <Link
        href="/"
        className={cn("flex items-center", className)}
        aria-label="Data Dashboard, ke beranda"
      >
        <span className="relative block size-7 overflow-hidden rounded-sm">
          <Image
            src="/brand/pcp-logo.png"
            alt=""
            width={187}
            height={28}
            priority
            className="absolute left-0 top-0 h-7 w-auto max-w-none"
          />
        </span>
      </Link>
    );
  }
  return (
    <Link
      href="/"
      className={cn("flex flex-col gap-0.5 rounded-md", className)}
      aria-label="Data Dashboard, ke beranda"
    >
      <Image src="/brand/pcp-logo.png" alt="PCP Express" width={120} height={18} priority />
      <span className="text-sm font-semibold leading-none tracking-tight">Data Dashboard</span>
    </Link>
  );
}
