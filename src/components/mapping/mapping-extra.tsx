import { IconChevronRight, IconEyeOff } from "@tabler/icons-react";
import { TYPE_LABEL, fmtInt } from "@/components/schema/labels";
import type { MappingActiveColumn, MappingNewColumn } from "./mapping-types";

/** Kolom file baru yang tidak dipakai pemetaan: masuk skema tersembunyi (AC 4). Hanya baca. */
export function MappingExtra({ id, columns }: { id: string; columns: MappingNewColumn[] }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-testid="mapping-extra"
      className="flex flex-col gap-2 border-t px-5 py-4"
    >
      <h3 id={`${id}-title`} className="text-sm font-semibold">
        Kolom baru yang disembunyikan ({fmtInt(columns.length)})
      </h3>
      <p className="text-sm text-muted-foreground">
        Kolom ini ikut tersimpan tetapi tidak muncul di builder dashboard. Tampilkan dari halaman
        Skema setelah versi baru aktif.
      </p>
      <ul className="flex flex-wrap gap-2">
        {columns.map((c) => (
          <li
            key={c.pos}
            className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 text-sm"
          >
            <IconEyeOff
              size={16}
              stroke={1.5}
              aria-hidden
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate" title={c.original}>
              “{c.original || `Kolom ${c.pos}`}”
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{TYPE_LABEL[c.type]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pasangan yang cocok otomatis (ringkas, tertutup secara bawaan). Hanya baca. */
export function MappingAutoMatched({
  pairs,
  active,
  fresh,
}: {
  pairs: { activePos: number; newPos: number }[];
  active: MappingActiveColumn[];
  fresh: MappingNewColumn[];
}) {
  const nameOf = new Map(active.map((c) => [c.pos, c.name]));
  const titleOf = new Map(fresh.map((c) => [c.pos, c.original]));
  return (
    <details className="group border-t px-5 py-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium md:min-h-9 [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={16}
          stroke={1.5}
          aria-hidden
          className="shrink-0 text-muted-foreground group-open:rotate-90 motion-safe:transition-transform"
        />
        {fmtInt(pairs.length)} kolom cocok otomatis
      </summary>
      <ul className="flex flex-col gap-1 pb-2 pl-6 text-sm">
        {pairs.map((p) => {
          const name = nameOf.get(p.activePos) ?? `Kolom ${p.activePos}`;
          const title = titleOf.get(p.newPos) ?? "";
          return (
            <li key={p.activePos} className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-medium">{name}</span>
              {title && title !== name ? (
                <span className="text-muted-foreground">
                  <span aria-hidden> ← </span>
                  <span className="sr-only"> dari kolom file </span>“{title}”
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
