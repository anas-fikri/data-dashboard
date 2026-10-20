import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Pindah sheet = navigasi (URL ?sheet=<indeks>, bisa dibagikan/dimuat ulang), jadi tautan dengan
 * aria-current, bukan tablist. Bergulir horizontal bila nama sheet banyak/panjang.
 */
export function SheetTabs({
  datasetId,
  sheets,
  current,
  page = "skema",
  label = "Sheet",
  extra = "",
}: {
  datasetId: string;
  /** Subhalaman dataset tujuan tab (skema atau data/Lihat data); "data" = tab di bawah grid (gaya Excel). */
  page?: "skema" | "data";
  label?: string;
  /** Parameter tambahan yang dipertahankan antartab, mis. "&version=<id>" (pratinjau T-054). */
  extra?: string;
  sheets: { index: number; name: string }[];
  current: number;
}) {
  const bottom = page === "data";
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1">
      <ul className={cn("flex min-w-max gap-1", bottom ? "border-t" : "border-b")}>
        {sheets.map((s) => {
          const active = s.index === current;
          return (
            <li key={s.index}>
              <Link
                href={`/datasets/${datasetId}/${page}?sheet=${s.index}${extra}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-10 max-w-[16rem] items-center px-3 text-sm",
                  bottom ? "-mt-px border-t-2" : "-mb-px border-b-2",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{s.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
