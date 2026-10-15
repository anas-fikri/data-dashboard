"use client";

import { IconLoader2, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchShareUsersAction } from "@/features/sharing/actions";
import type { ShareRole, ShareUserOption } from "@/features/sharing/types";
import { cn } from "@/lib/utils";
import {
  pickerStatus,
  searchable,
  shareErrorText,
  visibleResults,
  type PickerPhase,
} from "./share-model";
import { ShareOptions } from "./share-options";

const DEBOUNCE_MS = 250;

interface SharePickerProps {
  dashboardId: string;
  selectedId: string | null;
  /** Aksi share sedang berjalan: pencarian dan pilihan dikunci. */
  disabled: boolean;
  /** Peran pengguna yang sudah punya akses (ditandai di hasil; memilihnya lagi mengganti perannya). */
  granted: ReadonlyMap<string, ShareRole>;
  onSelect: (user: ShareUserOption) => void;
  /** Hasil terbaru; pemanggil membatalkan pilihan yang tidak ada lagi (yang terlihat = yang dipilih). */
  onResults: (items: ShareUserOption[]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  /** id pesan galat kolom cari dari pemanggil ("Bagikan" tanpa pilihan); ada = kolom ditandai invalid. */
  errorId?: string;
}

/**
 * Pemilih pengguna untuk dibagikan: kolom cari (debounce 250 ms, dicari di server mulai 3 karakter —
 * prefix email/nama; email lengkap selalu ketemu) + daftar radio maks. 10 hasil. Jawaban basi (ketikan
 * lebih baru / dialog ditutup) dibuang. Status hasil dibacakan sopan (role=status).
 */
export function SharePicker({
  dashboardId,
  selectedId,
  disabled,
  granted,
  onSelect,
  onResults,
  inputRef,
  errorId,
}: SharePickerProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<PickerPhase>("idle");
  const [items, setItems] = useState<ShareUserOption[]>([]);
  /** Kata kunci milik `items` (bisa tertinggal dari `query` selama debounce/permintaan berjalan). */
  const [itemsFor, setItemsFor] = useState("");
  const [error, setError] = useState("");
  const req = useRef<{ seq: number; timer?: ReturnType<typeof setTimeout> }>({ seq: 0 });

  useEffect(() => {
    const r = req.current;
    return () => {
      clearTimeout(r.timer);
      r.seq++;
    };
  }, []);

  function search(raw: string, delay: number) {
    const q = raw.trim();
    const r = req.current;
    clearTimeout(r.timer);
    const n = ++r.seq;
    if (!searchable(q)) {
      setPhase("idle");
      setItems([]);
      onResults([]);
      return;
    }
    setPhase("loading");
    r.timer = setTimeout(async () => {
      const res = await searchShareUsersAction(dashboardId, q).catch(() => null);
      if (n !== r.seq) return; // jawaban basi
      // Gagal pun dilaporkan (daftar kosong): daftar opsi tidak tampil saat galat, jadi pilihan lama
      // yang kini tersembunyi ikut dibatalkan pemanggil.
      onResults(visibleResults(res));
      if (res?.ok) {
        setItems(res.data);
        setItemsFor(q);
        setPhase("done");
      } else {
        setError(shareErrorText(res));
        setPhase("error");
      }
    }, delay);
  }

  const Icon = phase === "loading" ? IconLoader2 : IconSearch;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label id={`${id}-label`} htmlFor={`${id}-q`} className="text-sm font-medium">
          Cari pengguna
        </label>
        <div className="relative">
          <Icon
            size={20}
            stroke={1.5}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground",
              phase === "loading" && "motion-safe:animate-spin",
            )}
          />
          <Input
            ref={inputRef}
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              search(e.target.value, DEBOUNCE_MS);
            }}
            disabled={disabled}
            maxLength={100}
            autoComplete="off"
            placeholder="Email atau nama"
            aria-describedby={errorId ? `${errorId} ${id}-hint` : `${id}-hint`}
            invalid={!!errorId}
            data-testid="share-search"
            className="h-(--control-h-lg) pl-10 md:h-(--control-h)"
          />
        </div>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Hanya pengguna aktif dengan email terverifikasi.
        </p>
      </div>
      {(phase === "done" || phase === "loading") && items.length > 0 ? (
        <ShareOptions
          name={`${id}-user`}
          labelledBy={`${id}-label`}
          items={items}
          selectedId={selectedId}
          granted={granted}
          disabled={disabled}
          loading={phase === "loading"}
          onSelect={onSelect}
        />
      ) : null}
      <p role="status" className="text-sm text-muted-foreground">
        {pickerStatus(phase, items.length, itemsFor)}
      </p>
      {phase === "error" ? (
        <FormAlert tone="error">
          <span className="block">Pencarian pengguna gagal. {error}</span>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-(--control-h-lg) md:h-(--control-h-sm)"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={() => {
              inputRef.current?.focus();
              search(query, 0);
            }}
          >
            Coba lagi
          </Button>
        </FormAlert>
      ) : null}
    </div>
  );
}
