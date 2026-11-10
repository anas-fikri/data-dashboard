"use client";

import {
  IconBook2,
  IconDatabase,
  IconLayoutDashboard,
  IconSearch,
  type Icon,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { QuickResults } from "@/features/search/service";
import { NAV_ITEMS } from "./nav-items";

/*
 * Cari cepat (T-k6k0): Ctrl+K / Cmd+K atau tombol Cari di header membuka dialog combobox (pola ARIA 1.2:
 * input role=combobox + listbox, aria-activedescendant) untuk melompat ke dashboard, dataset, panduan,
 * atau halaman. Hasil dari /api/search (akses sama dengan halaman masing-masing); kosong = terbaru.
 */

interface Item {
  id: string;
  group: "Dashboard" | "Dataset" | "Panduan" | "Halaman";
  label: string;
  hint?: string;
  href: string;
  icon: Icon;
}

const GROUPS = ["Dashboard", "Dataset", "Panduan", "Halaman"] as const;
const DEBOUNCE_MS = 150;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function toItems(r: QuickResults | null, q: string, isAdmin: boolean): Item[] {
  const items: Item[] = [];
  for (const d of r?.dashboards ?? []) {
    items.push({
      id: `d-${d.id}`,
      group: "Dashboard",
      label: d.name,
      hint: d.shared ? `${d.datasetName} · dibagikan` : d.datasetName,
      href: `/dashboards/${d.id}`,
      icon: IconLayoutDashboard,
    });
  }
  for (const d of r?.datasets ?? []) {
    items.push({
      id: `s-${d.id}`,
      group: "Dataset",
      label: d.name,
      href: `/datasets/${d.id}`,
      icon: IconDatabase,
    });
  }
  for (const g of r?.guides ?? []) {
    items.push({
      id: `g-${g.slug}`,
      group: "Panduan",
      label: g.title,
      href: `/panduan/${g.slug}`,
      icon: IconBook2,
    });
  }
  const key = q.trim().toLowerCase();
  for (const n of NAV_ITEMS) {
    if (n.adminOnly && !isAdmin) continue;
    if (key && !n.label.toLowerCase().includes(key)) continue;
    items.push({ id: `p-${n.href}`, group: "Halaman", label: n.label, href: n.href, icon: n.icon });
  }
  return items;
}

export function QuickSearch({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    // Label tombol menyesuaikan sistem (⌘K / Ctrl K) setelah hidrasi; server merender "Ctrl K".
    const id = requestAnimationFrame(() => setMac(isMac()));
    const mac = isMac();
    const onKey = (e: KeyboardEvent) => {
      // Mac: hanya ⌘K (Ctrl+K di Mac = hapus sampai akhir baris di kolom teks). Komposisi IME dan tombol yang
      // sudah ditangani komponen lain dilewati; dialog lain yang terbuka tidak ditumpuk dialog cari.
      const combo = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!combo || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      if (e.defaultPrevented || e.isComposing) return;
      if (!openRef.current && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    // Penanda pintasan siap (uji dan alat bantu menunggu ini; sebelum hidrasi Ctrl+K belum ditangkap).
    trigger.current?.setAttribute("data-ready", "");
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className="inline-flex h-(--control-h) items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
          // Nama memuat label terlihat "Cari" (WCAG 2.5.3) tetapi tidak sama persis dengan tombol "Cari" lain.
          aria-label="Cari cepat"
          aria-keyshortcuts="Control+K Meta+K"
          data-testid="quick-search-trigger"
        >
          <IconSearch aria-hidden className="size-5 shrink-0 stroke-[1.5]" />
          <span className="sr-only sm:not-sr-only">Cari</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-xs text-foreground md:inline">
            {mac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          className="fixed left-1/2 top-[10vh] z-50 flex max-h-[75vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          data-testid="quick-search"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Cari cepat</Dialog.Title>
          {open ? <SearchBody isAdmin={isAdmin} onDone={() => setOpen(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SearchBody({ isAdmin, onDone }: { isAdmin: boolean; onDone: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; data: QuickResults } | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = window.setTimeout(
      () => {
        fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
          .then((r) => r.json() as Promise<{ ok: boolean; data?: QuickResults }>)
          .then((j) => {
            if (j.ok && j.data) {
              setResults({ q, data: j.data });
              setFailed(false);
            } else setFailed(true);
          })
          .catch((e: unknown) => {
            if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(true);
          });
      },
      q ? DEBOUNCE_MS : 0,
    );
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  // Halaman disaring langsung; hasil server dipakai sampai jawaban untuk kata kunci baru tiba.
  const items = useMemo(() => toItems(results?.data ?? null, q, isAdmin), [results, q, isAdmin]);
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (i: number) => `${listId}-o${i}`;

  useEffect(() => {
    listRef.current
      ?.querySelector(`[id="${CSS.escape(optionId(current))}"]`)
      ?.scrollIntoView({ block: "nearest" });
    // optionId bergantung pada listId saja (stabil).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onDone();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + items.length) % items.length);
    } else if (e.key === "Home" && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      e.preventDefault();
      setActive(items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[current]);
    }
  };

  const loading = results === null || (results.q !== q && !failed);
  const status = failed
    ? "Pencarian sedang tidak tersedia."
    : results === null
      ? "Memuat…"
      : items.length === 0
        ? `Tidak ada hasil untuk “${q}”.`
        : `${items.length} hasil${q ? ` untuk “${q}”` : ""}.`;

  // Urutan items = urutan GROUPS, jadi indeks asli dipakai untuk aria-activedescendant/panah.
  const indexed = items.map((it, i) => ({ it, i }));
  return (
    <>
      <div className="flex items-center gap-2 border-b px-3">
        <IconSearch aria-hidden className="size-5 shrink-0 stroke-[1.5] text-muted-foreground" />
        <input
          // Fokus awal: Radix Dialog memfokuskan elemen pertama yang bisa difokus (input ini).
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? optionId(current) : undefined}
          aria-label="Cari dashboard, dataset, panduan, atau halaman"
          placeholder="Cari dashboard, dataset, panduan…"
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          value={q}
          maxLength={100}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          data-testid="quick-search-input"
        />
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Hasil pencarian"
        aria-busy={loading}
        className="flex-1 overflow-y-auto p-2"
      >
        {GROUPS.map((group) => {
          const inGroup = indexed.filter(({ it }) => it.group === group);
          if (!inGroup.length) return null;
          const headId = `${listId}-${group}`;
          return (
            <li key={group} role="presentation">
              <ul role="group" aria-labelledby={headId}>
                <li
                  id={headId}
                  role="presentation"
                  className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground"
                >
                  {group}
                </li>
                {inGroup.map(({ it, i }) => {
                  const selected = i === current;
                  const ItemIcon = it.icon;
                  return (
                    // Papan ketik lewat input combobox (panah + Enter, aria-activedescendant); klik = tetikus.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <li
                      key={it.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${selected ? "bg-accent text-accent-foreground" : ""}`}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(it)}
                    >
                      <ItemIcon aria-hidden className="size-5 shrink-0 stroke-[1.5]" />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.hint ? (
                        <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                          {it.hint}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <p
        className="border-t px-3 py-2 text-xs text-muted-foreground"
        aria-live="polite"
        data-testid="quick-search-status"
      >
        {status} <span aria-hidden>↑↓ pilih · Enter buka · Esc tutup</span>
      </p>
    </>
  );
}
