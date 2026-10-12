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
}: {
  datasetId: string;
  sheets: { index: number; name: string }[];
  current: number;
}) {
  return (
    <nav aria-label="Sheet" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b">
        {sheets.map((s) => {
          const active = s.index === current;
          return (
            <li key={s.index}>
              <Link
                href={`/datasets/${datasetId}/skema?sheet=${s.index}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "-mb-px inline-flex h-10 max-w-[16rem] items-center border-b-2 px-3 text-sm",
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
