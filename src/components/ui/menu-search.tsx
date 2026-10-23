"use client";

import { IconSearch } from "@tabler/icons-react";
import * as React from "react";
import { highlightParts, searchOptions, type SearchHit } from "@/lib/search";

/*
 * Kotak cari pintar untuk menu PILIHAN berbasis DropdownMenu (T-pxnn, keputusan pemilik 2026-10-23:
 * semua daftar pilihan berkotak cari; menu aksi tidak). Pola sama dengan Select (ui/select.tsx):
 * langsung difokus saat menu terbuka (setelah Radix memfokus menunya), menyaring lewat src/lib/search,
 * ↓ ke hasil, Enter memilih hasil pertama yang bisa dipakai, Esc menutup; huruf yang diketik tidak
 * diteruskan ke ketik-cepat menu (yang akan memindah fokus ke item). Kata kunci dikosongkan saat menu
 * ditutup (pemanggil memakai `open`/`onOpenChange` dari hook ini).
 */
export function useMenuSearch() {
  const [open, setOpenState] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
  const onOpenChange = React.useCallback((o: boolean) => {
    setOpenState(o);
    if (!o) setQuery("");
  }, []);
  /** Hasil cari (null = tanpa kata kunci: tampilkan daftar asli). */
  function filter<T extends { label: string }>(items: readonly T[]): SearchHit<T>[] | null {
    return query.trim() ? searchOptions(items, query) : null;
  }
  return { open, onOpenChange, query, setQuery, inputRef, contentRef, filter };
}

const firstItem = (root: HTMLElement | null) =>
  root?.querySelector<HTMLElement>(
    "[role=menuitem]:not([data-disabled]), [role=menuitemradio]:not([data-disabled])",
  ) ?? null;

export function MenuSearch({
  inputRef,
  contentRef,
  query,
  setQuery,
  label,
  count,
  onEnter,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  query: string;
  setQuery: (q: string) => void;
  /** Mis. "Cari kolom". */
  label: string;
  /** Jumlah hasil saat ada kata kunci (null tanpa kata kunci). */
  count: number | null;
  /** Enter: pilih hasil pertama yang bisa dipakai; tanpa ini, item pertama di menu yang diklik. */
  onEnter?: () => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      firstItem(contentRef.current)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (onEnter) onEnter();
      else firstItem(contentRef.current)?.click();
    }
    if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
  };
  return (
    <>
      <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 flex items-center gap-2 border-b bg-popover px-3">
        <IconSearch size={18} stroke={1.5} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          aria-label={label}
          placeholder="Ketik untuk mencari…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid="menu-search"
          className="h-(--control-h-lg) w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-(--control-h) md:text-sm"
        />
      </div>
      {count === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Tidak ada yang cocok dengan “{query.trim()}”.
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {count === null ? "" : count ? `${count} pilihan cocok` : "Tidak ada yang cocok"}
      </p>
    </>
  );
}

/** Label dengan huruf yang cocok disorot. */
export function Highlighted({ text, hits }: { text: string; hits: readonly number[] }) {
  return (
    <>
      {highlightParts(text, hits).map((p, k) =>
        p.hit ? (
          <mark
            key={k}
            className="bg-transparent font-semibold text-inherit underline underline-offset-2"
          >
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
