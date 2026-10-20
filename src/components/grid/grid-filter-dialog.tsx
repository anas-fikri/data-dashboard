"use client";

import { IconCheck, IconFilterOff, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { DatePanel } from "@/components/dashboards/filters/date-panel";
import type { DashFilter, FilterColumnView } from "@/components/dashboards/filters/filter-model";
import { NumberPanel } from "@/components/dashboards/filters/number-panel";
import { SlicerBody } from "@/components/dashboards/filters/slicer-panel";
import { Button } from "@/components/ui/button";
import { colIdOf, colLetter, numericType, type GridColumn } from "./grid-model";
import { useGridValues } from "./use-grid-values";

/*
 * Menu saring satu kolom "Lihat data" (T-044, Alt+↓ atau menu kolom → "Saring…"): isi kontrol dipakai
 * ulang dari filter dashboard — daftar nilai + cari untuk teks/Ya-Tidak (≤ 1.000 nilai dari server),
 * rentang untuk angka, rentang + pilihan cepat untuk tanggal. Pilihan menjadi draf dan baru dikirim
 * ke server lewat "Terapkan" (satu query per penerapan, bukan per centang). Dialog: fokus terkunci,
 * Escape menutup, fokus kembali ke sel/kepala kolom asal. Ponsel: lembar dari bawah.
 */
export interface FilterTarget {
  column: GridColumn;
  /**
   * Kembalikan fokus saat dialog ditutup (kepala kolom, atau sel asal; `applied` = saringan berubah
   * sehingga baris dimuat ulang dan sel asal hilang). false = tidak bisa, fokus bawaan Radix.
   */
  returnFocus: (applied: boolean) => boolean;
}

const BTN = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

export function GridFilterDialog({
  target,
  sheetId,
  versionId,
  period,
  value,
  onApply,
  onClose,
}: {
  target: FilterTarget | null;
  sheetId: string;
  versionId: string;
  /** Periode terpilih di Lihat data (T-058): daftar nilai dari periode itu saja. */
  period?: string | null;
  value: DashFilter | undefined;
  onApply: (colId: string, f: DashFilter | null) => void;
  onClose: () => void;
}) {
  const col = target?.column;
  // Saat menutup, `target` sudah null (pemanggil mengosongkannya) sebelum Radix memanggil
  // onCloseAutoFocus: simpan target terakhir untuk pengembalian fokus.
  const [last, setLast] = useState<FilterTarget | null>(target);
  if (target && target !== last) setLast(target);
  const applied = useRef(false);
  return (
    <Dialog.Root open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="grid-filter-dialog"
          onCloseAutoFocus={(e) => {
            const done = (target ?? last)?.returnFocus(applied.current);
            applied.current = false;
            if (done) e.preventDefault();
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-lg border bg-card shadow-lg md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-lg"
        >
          {col ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
                <Dialog.Title className="min-w-0 truncate text-base font-semibold">
                  Saring kolom {colLetter(col.pos)}: {col.name}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button size="icon-lg" variant="ghost" aria-label="Tutup saringan">
                    <IconX aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>
              <FilterBody
                // Kolom lain → draf baru.
                key={col.pos}
                column={col}
                sheetId={sheetId}
                versionId={versionId}
                period={period}
                value={value}
                onApply={(f) => {
                  applied.current = true;
                  onApply(colIdOf(col.pos), f);
                  onClose();
                }}
              />
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilterBody({
  column,
  sheetId,
  versionId,
  period,
  value,
  onApply,
}: {
  column: GridColumn;
  sheetId: string;
  versionId: string;
  /** Periode terpilih di Lihat data (T-058): daftar nilai dari periode itu saja. */
  period?: string | null;
  value: DashFilter | undefined;
  onApply: (f: DashFilter | null) => void;
}) {
  const colId = colIdOf(column.pos);
  const view: FilterColumnView = {
    key: colId,
    sheet: "",
    column: colId,
    type: column.type,
    available: true,
  };
  const [draft, setDraft] = useState<DashFilter | undefined>(value);
  const [allMode, setAllMode] = useState(value?.op === "not_in");
  const [query, setQuery] = useState("");

  if (numericType(column.type)) {
    // Rentang angka punya tombol Terapkan/Hapus sendiri.
    return (
      <div className="px-4 py-3">
        <NumberPanel column={view} value={value} onChange={onApply} />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {column.type === "date" || column.type === "timestamp" ? (
          <DatePanel column={view} value={draft} onChange={(f) => setDraft(f ?? undefined)} />
        ) : (
          <ValueList
            column={column}
            sheetId={sheetId}
            versionId={versionId}
            period={period}
            query={query}
            onQuery={setQuery}
            value={draft}
            onChange={(f) => setDraft(f ?? undefined)}
            allMode={allMode}
            onAllMode={setAllMode}
          />
        )}
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3 md:flex-row-reverse">
        <Button
          className={BTN}
          leadingIcon={<IconCheck aria-hidden />}
          data-testid="grid-filter-apply"
          onClick={() => onApply(draft ?? null)}
        >
          Terapkan
        </Button>
        {value ? (
          <Button
            variant="outline"
            className={BTN}
            leadingIcon={<IconFilterOff aria-hidden />}
            onClick={() => onApply(null)}
          >
            Hapus saringan
          </Button>
        ) : null}
      </div>
    </>
  );
}

function ValueList({
  column,
  sheetId,
  versionId,
  period,
  query,
  onQuery,
  ...selection
}: {
  column: GridColumn;
  sheetId: string;
  versionId: string;
  /** Periode terpilih di Lihat data (T-058): daftar nilai dari periode itu saja. */
  period?: string | null;
  query: string;
  onQuery: (q: string) => void;
  value: DashFilter | undefined;
  onChange: (f: DashFilter | null) => void;
  allMode: boolean;
  onAllMode: (on: boolean) => void;
}) {
  const values = useGridValues(sheetId, versionId, column.pos, query, period ?? null);
  return (
    <SlicerBody
      name={column.name}
      type={column.type}
      query={query}
      onQuery={onQuery}
      values={values}
      truncatedNote={
        values.data?.q
          ? "Menampilkan 1.000 nilai pertama yang cocok — ketik lebih lengkap untuk mempersempit."
          : "Menampilkan 1.000 nilai pertama — ketik untuk mencari."
      }
      {...selection}
    />
  );
}
