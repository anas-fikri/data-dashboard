"use client";

import { IconLoader2, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useEffect, useEffectEvent, useId, useRef, useState, type ChangeEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTransferTargetsAction } from "@/features/admin/actions";
import type { TransferTarget } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { adminErrorText, NETWORK_ERROR } from "./admin-messages";
import { EmailText } from "./email-text";

/** Sama dengan TARGETS_MAX di service: server tidak pernah mengirim lebih dari ini. */
const RESULTS_MAX = 20;
const DEBOUNCE_MS = 250;

type Phase = "loading" | "done" | "error";

interface TransferPickerProps {
  sourceId: string;
  selectedId: string | null;
  /** Aksi alih sedang berjalan: pencarian dan pilihan dikunci. */
  disabled: boolean;
  onSelect: (target: TransferTarget) => void;
  /** Hasil terbaru; pemanggil membatalkan pilihan yang tidak ada lagi di hasil (yang terlihat = yang dipilih). */
  onResults: (items: TransferTarget[]) => void;
}

/**
 * Pemilih pemilik baru: kolom cari (debounce 250 ms, dicari di server) + daftar radio maks. 20 hasil.
 * Email tampil lebih dulu dan utuh sebagai identitas; nama kedua dan boleh terpotong. Dirender hanya
 * saat dialog terbuka, jadi pencarian awal (q kosong) berjalan saat dialog dibuka.
 */
export function TransferPicker({
  sourceId,
  selectedId,
  disabled,
  onSelect,
  onResults,
}: TransferPickerProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<TransferTarget[]>([]);
  /** Kata kunci milik `items` (bisa tertinggal dari `query` selama debounce/permintaan berjalan). */
  const [itemsFor, setItemsFor] = useState("");
  const [error, setError] = useState("");
  /** Nomor permintaan terakhir (jawaban basi dibuang) + timer debounce. */
  const req = useRef<{ seq: number; timer?: ReturnType<typeof setTimeout> }>({ seq: 0 });

  function load(q: string, delay: number) {
    const r = req.current;
    clearTimeout(r.timer);
    const n = ++r.seq;
    r.timer = setTimeout(async () => {
      const res = await searchTransferTargetsAction(sourceId, q).catch(() => null);
      if (n !== r.seq) return; // jawaban basi: sudah ada ketikan yang lebih baru / dialog ditutup
      if (res?.ok) {
        setItems(res.data);
        setItemsFor(q);
        setPhase("done");
        onResults(res.data);
      } else {
        setError(res ? adminErrorText(res.code, res.message) : NETWORK_ERROR);
        setPhase("error");
      }
    }, delay);
  }

  const loadInitial = useEffectEvent(() => load("", 0));
  useEffect(() => {
    const r = req.current;
    loadInitial();
    return () => {
      clearTimeout(r.timer);
      r.seq++;
    };
  }, []);

  function search(q: string, delay: number) {
    setPhase("loading");
    load(q.trim(), delay);
  }

  const status =
    phase === "loading"
      ? "Mencari pengguna…"
      : phase === "error"
        ? ""
        : items.length === 0
          ? itemsFor
            ? `Tidak ada pengguna aktif terverifikasi yang cocok dengan “${itemsFor}”. Periksa ejaannya.`
            : "Belum ada pengguna aktif lain yang sudah memverifikasi email. Minta calon pemilik baru mendaftar dan memverifikasi emailnya dulu."
          : items.length >= RESULTS_MAX
            ? `Menampilkan ${RESULTS_MAX} hasil pertama. Ketik email yang lebih lengkap bila pengguna tujuan belum terlihat.`
            : `${items.length} pengguna ditemukan.`;
  const Icon = phase === "loading" ? IconLoader2 : IconSearch;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label id={`${id}-label`} htmlFor={`${id}-q`} className="text-sm font-medium">
          Pemilik baru
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
            placeholder="Cari email atau nama"
            aria-describedby={`${id}-hint`}
            data-testid="admin-transfer-target"
            className="h-(--control-h-lg) pl-10 md:h-(--control-h)"
          />
        </div>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Hanya pengguna aktif dengan email terverifikasi yang bisa menerima dataset.
        </p>
      </div>
      {phase !== "error" && items.length > 0 ? (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          aria-busy={phase === "loading" || undefined}
          className={cn(
            "max-h-[min(15rem,40dvh)] overflow-y-auto rounded-md border",
            phase === "loading" && "opacity-60",
          )}
        >
          {/* Baris = target sentuh penuh; latar terpilih accent/60 agar nama (muted) tetap ≥ 4.5:1. */}
          {items.map((t) => (
            <label
              key={t.id}
              data-testid="admin-transfer-option"
              data-email={t.email}
              className="flex min-h-11 cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40 has-checked:bg-accent/60 md:min-h-9"
            >
              <input
                type="radio"
                name={`${id}-target`}
                value={t.id}
                checked={t.id === selectedId}
                onChange={() => onSelect(t)}
                disabled={disabled}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium [overflow-wrap:anywhere]">
                  <EmailText email={t.email} />
                </span>
                {t.name ? (
                  <span className="block truncate text-muted-foreground" title={t.name}>
                    <bdi>{t.name}</bdi>
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <p id={`${id}-status`} role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      {phase === "error" ? (
        <FormAlert tone="error">
          <span className="block">Daftar pengguna gagal dimuat. {error}</span>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-(--control-h-lg) md:h-(--control-h-sm)"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={() => search(query, 0)}
          >
            Coba lagi
          </Button>
        </FormAlert>
      ) : null}
    </div>
  );
}
