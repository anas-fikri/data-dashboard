"use client";

import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import * as React from "react";
import { highlightParts, searchOptions } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SELECT_ITEM, SELECT_TRIGGER } from "./select";

/*
 * Pilihan berkotak cari (T-jwhc) untuk daftar panjang (≥ SEARCH_MIN pilihan): tampilan pemicu sama
 * dengan Select, isi = kotak cari (langsung fokus) + daftar tersaring pencarian pintar (src/lib/search)
 * dengan huruf yang cocok disorot. Pola combobox ARIA: panah/Enter memilih lewat aria-activedescendant,
 * Escape menutup dan fokus kembali ke pemicu, jumlah hasil diumumkan. Mengetik huruf di pemicu langsung
 * membuka dan mulai mencari. Popover modal seperti Select (di dalam lembar Dialog, gulir roda tetap jalan).
 */
export const SEARCH_MIN = 8;

type Option = { value: string; label: string };

export const SearchSelect = React.forwardRef<
  HTMLButtonElement,
  {
    id: string;
    /** Nama daftar untuk pembaca layar, mis. label isiannya. */
    label: string;
    value: string;
    options: readonly Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    /** Nama isian form (input tersembunyi). */
    name?: string;
    className?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    "aria-required"?: boolean;
    "data-testid"?: string;
  }
>(function SearchSelect(
  { label, value, options, onChange, placeholder, name, className, ...rest },
  ref,
) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const optId = (i: number) => `${listId}-o${i}`;
  const results = searchOptions(options, query);
  const selected = options.find((o) => o.value === value);

  const show = (seed = "") => {
    setQuery(seed);
    setActive(
      seed
        ? 0
        : Math.max(
            0,
            options.findIndex((o) => o.value === value),
          ),
    );
    setOpen(true);
  };
  const choose = (o: Option) => {
    onChange(o.value);
    setOpen(false);
  };
  React.useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
  });

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      // Huruf yang tiba sebelum fokus pindah ke kotak cari ikut ditambahkan.
      if (open) setQuery((q) => q + e.key);
      else show(e.key);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  };
  const onInputKey = (e: React.KeyboardEvent) => {
    const n = results.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) choose(hit.option);
    }
  };

  return (
    <Popover modal open={open} onOpenChange={(next) => (next ? show() : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          data-placeholder={selected ? undefined : ""}
          className={cn(SELECT_TRIGGER, className)}
          onKeyDown={onTriggerKey}
          {...rest}
        >
          <span>{selected?.label ?? placeholder}</span>
          <IconChevronDown size={20} stroke={1.5} className="shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[min(22rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) min-w-64 gap-1 overflow-hidden p-1"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const el = input.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-2">
          <IconSearch
            size={20}
            stroke={1.5}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? optId(active) : undefined}
            aria-label={`Cari ${label}`}
            placeholder="Ketik untuk mencari…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            className="h-(--control-h-lg) w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-(--control-h) md:text-sm"
          />
        </div>
        <div
          role="listbox"
          id={listId}
          aria-label={label}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {results.map(({ option, hits }, i) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard lewat kotak cari
            <div
              key={option.value}
              id={optId(i)}
              role="option"
              aria-selected={i === active}
              data-highlighted={i === active ? "" : undefined}
              className={SELECT_ITEM}
              // Pola aria-activedescendant: fokus tetap di kotak cari (keyboard di sana), klik/ketuk memilih.
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(option)}
            >
              <span className="absolute left-2 flex size-5 items-center justify-center">
                {option.value === value ? <IconCheck size={16} stroke={2} aria-hidden /> : null}
              </span>
              <span className="min-w-0">
                {highlightParts(option.label, hits).map((p, k) =>
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
              </span>
            </div>
          ))}
        </div>
        {results.length ? null : (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Tidak ada yang cocok dengan “{query.trim()}”.
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {query.trim()
            ? results.length
              ? `${results.length} pilihan cocok`
              : "Tidak ada yang cocok"
            : ""}
        </p>
      </PopoverContent>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </Popover>
  );
});
