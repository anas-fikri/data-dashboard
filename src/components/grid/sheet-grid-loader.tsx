"use client";

import dynamic from "next/dynamic";
import type { SheetGridProps } from "./sheet-grid";

/*
 * Rute "Lihat data" memuat AG Grid lazy tanpa SSR (ADR-0007): chunk grid hanya diunduh di halaman ini
 * dan tidak pernah dari rute dashboard. Kerangka ditampilkan selama chunk dimuat.
 */
const SheetGrid = dynamic(() => import("./sheet-grid"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3" aria-busy="true" data-testid="sheet-grid-loading">
      <div className="h-(--control-h) w-72 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="h-[calc(100dvh-var(--topbar-h)-17rem)] min-h-96 animate-pulse rounded-md border bg-muted/50 motion-reduce:animate-none" />
      <span className="sr-only">Memuat tampilan data…</span>
    </div>
  ),
});

export function SheetGridLoader(props: SheetGridProps) {
  return <SheetGrid {...props} />;
}
