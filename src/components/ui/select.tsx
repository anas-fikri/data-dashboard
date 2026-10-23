"use client";

import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import { searchOptions } from "@/lib/search";
import { cn } from "@/lib/utils";

/*
 * Select kustom (bukan <select> native) untuk filter/status: aksesibel via Radix,
 * caret tidak menempel ke tepi, tinggi dari token. Dipakai filter dashboard (T-012).
 * Kotak cari pintar di SETIAP daftar pilihan (T-pxnn, keputusan pemilik 2026-10-23): langsung difokus
 * saat dibuka, menyaring item lewat src/lib/search (awalan, potongan, singkatan, inisial) dari
 * `textValue` atau teks isinya; item yang tidak cocok disembunyikan dan dinonaktifkan sehingga dilewati
 * panah/ketik-cepat Radix (tetap terpasang: nilai terpilih di pemicu tidak hilang). ↓ ke hasil, Enter
 * memilih hasil pertama, Esc menutup; kata kunci dikosongkan setiap daftar ditutup.
 */
type SearchState = { query: string; setQuery: (q: string) => void; open: boolean };
const SearchContext = React.createContext<SearchState | null>(null);

/** Teks polos isi item (untuk dicari bila `textValue` tidak diberikan). */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return nodeText(node.props.children);
  return "";
}
/** Kelas pemicu dan item, dipakai juga SearchSelect (daftar panjang berkotak cari, T-jwhc). */
export const SELECT_TRIGGER = cn(
  "flex h-(--control-h) w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-base md:text-sm",
  "data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
  "[&>span]:truncate",
);
// Teks panjang membungkus; target sentuh 44 px di ponsel.
export const SELECT_ITEM = cn(
  "relative flex min-h-11 w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm break-words whitespace-normal outline-none md:min-h-9",
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
);

export function Select({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [query, setQuery] = React.useState("");
  const [openState, setOpenState] = React.useState(false);
  const open = props.open ?? openState;
  const value = React.useMemo(() => ({ query, setQuery, open }), [query, open]);
  return (
    <SearchContext.Provider value={value}>
      <SelectPrimitive.Root
        {...props}
        onOpenChange={(o) => {
          setOpenState(o);
          if (!o) setQuery("");
          onOpenChange?.(o);
        }}
      />
    </SearchContext.Provider>
  );
}
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger ref={ref} className={cn(SELECT_TRIGGER, className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <IconChevronDown size={20} stroke={1.5} className="shrink-0 opacity-60" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = "popper", onKeyDownCapture, ...props },
  ref,
) {
  const ctx = React.useContext(SearchContext);
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          // Tidak lebih lebar/tinggi dari ruang layar yang tersedia (review desain T-011 H6).
          "z-50 flex max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width) flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          className,
        )}
        // Kotak cari + daftar: kontennya dialog, daftarnya listbox (input tidak boleh di dalam listbox).
        role="dialog"
        aria-label="Pilihan"
        onKeyDownCapture={(e) => {
          onKeyDownCapture?.(e);
          if (ctx) toSearch(e, ctx);
        }}
        {...props}
      >
        <SelectSearch />
        <SelectPrimitive.Viewport
          role="listbox"
          aria-label="Pilihan"
          className="min-h-0 flex-1 p-1"
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

const SEARCH_INPUT = "[data-select-search]";
const options = (root: Element | null) =>
  Array.from(root?.querySelectorAll<HTMLElement>("[role=option]:not([data-disabled])") ?? []);

/**
 * Fokus di item (setelah ↓ atau kursor mouse melewati daftar): huruf/Backspace tetap mengisi kotak cari,
 * ↑ di item pertama kembali ke kotak cari — bukan ketik-cepat Radix yang memindah sorotan.
 */
function toSearch(e: React.KeyboardEvent<HTMLElement>, ctx: SearchState) {
  const target = e.target as HTMLElement;
  const input = e.currentTarget.querySelector<HTMLInputElement>(SEARCH_INPUT);
  if (!input || target === input) return;
  const printable = e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (printable || e.key === "Backspace") {
    e.preventDefault();
    e.stopPropagation();
    ctx.setQuery(printable ? ctx.query + e.key : ctx.query.slice(0, -1));
    input.focus();
  } else if (e.key === "ArrowUp" && options(e.currentTarget)[0] === target) {
    e.preventDefault();
    e.stopPropagation();
    input.focus();
  }
}

/** Layar sentuh: kotak cari tidak difokus otomatis (keyboard layar menutup daftar). */
const coarsePointer = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Kotak cari di atas daftar (T-pxnn); fokus berpindah ke sini setelah Radix memfokus daftarnya. */
function SelectSearch() {
  const ctx = React.useContext(SearchContext);
  const input = React.useRef<HTMLInputElement>(null);
  const [count, setCount] = React.useState<number | null>(null);
  const open = ctx?.open ?? false;
  const query = ctx?.query ?? "";
  React.useEffect(() => {
    if (!open || coarsePointer()) return;
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
  // Jumlah hasil (pesan "tidak ada" + pengumuman) dibaca dari DOM setelah item menyaring dirinya.
  React.useLayoutEffect(() => {
    const root = input.current?.closest("[role=dialog]");
    setCount(
      query.trim() && root
        ? root.querySelectorAll("[role=option]:not([data-search-hidden])").length
        : null,
    );
  }, [query]);
  if (!ctx) return null;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const root = input.current?.closest("[role=dialog]") ?? null;
    const items = options(root);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      // Tanpa kata kunci: ke pilihan saat ini (seperti Select tanpa kotak cari); dengan kata kunci: hasil pertama.
      (query.trim()
        ? items[0]
        : (items.find((el) => el.dataset.state === "checked") ?? items[0])
      )?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!query.trim()) {
        // Tanpa kata kunci Enter tidak mengganti nilai: sorot pilihan saat ini (atau yang pertama).
        (items.find((el) => el.dataset.state === "checked") ?? items[0])?.focus();
      } else {
        // Hasil paling cocok (peringkat src/lib/search, sama dengan menu), bukan sekadar urutan daftar.
        const best = searchOptions(
          items.map((el) => ({ label: el.dataset.searchLabel ?? "", el })),
          query,
        )[0]?.option.el;
        if (best) {
          best.focus();
          best.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      }
    }
    // Esc/Tab tetap ke daftar (menutup); huruf dan panah lain milik kotak cari, bukan ketik-cepat Radix.
    if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
  };
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3">
      <IconSearch size={18} stroke={1.5} aria-hidden className="shrink-0 text-muted-foreground" />
      <input
        ref={input}
        type="search"
        aria-label="Cari pilihan"
        placeholder="Ketik untuk mencari…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => ctx.setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        data-select-search=""
        data-testid="select-search"
        className="h-(--control-h-lg) w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-(--control-h) md:text-sm"
      />
      {count === 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">Tidak ada yang cocok</span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {count === null ? "" : count ? `${count} pilihan cocok` : "Tidak ada yang cocok"}
      </span>
    </div>
  );
}

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, disabled, textValue, ...props }, ref) {
  const query = React.useContext(SearchContext)?.query.trim() ?? "";
  const label = textValue ?? nodeText(children);
  const hit = query ? searchOptions([{ label }], query)[0] : undefined;
  const hidden = !!query && !hit;
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(SELECT_ITEM, hidden && "hidden", className)}
      disabled={disabled || hidden}
      textValue={label}
      data-search-hidden={hidden || undefined}
      data-search-label={label}
      {...props}
    >
      <span className="absolute left-2 flex size-5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck size={16} stroke={2} aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
