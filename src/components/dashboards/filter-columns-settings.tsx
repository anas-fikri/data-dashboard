"use client";

import { IconAlertTriangle, IconCircleCheck, IconStack2, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { TYPE_LABEL } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import { FILTER_COLUMNS_MAX } from "@/features/dashboards/filter-columns";
import { typeFamily } from "@/features/query/filters";
import { normName } from "@/features/widgets/remap";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";
import { AddFilterColumnMenu } from "./add-filter-column-menu";
import { api } from "./dashboard-api";
import { rememberSavedColumns } from "./filter-columns-store";
import { filterText } from "./filters/filter-text";

/** Jangkar bagian "Kolom filter" di kartu pengaturan pemilik (tautan peringatan dialog share). */
export const FILTER_SETTINGS_ID = "kolom-filter";

/** Fokus ke bagian kolom filter bila URL menunjuk ke sana; true = difokus. */
export function focusIfTargeted(el: HTMLElement | null, hash: string): boolean {
  if (!el || hash !== `#${FILTER_SETTINGS_ID}`) return false;
  // Next sudah menggulir ke hash (efek tata letak, sebelum efek ini): jangan menggulir lagi.
  el.focus({ preventScroll: true });
  return true;
}

/*
 * Kolom filter dashboard (T-012, mode edit): kolom yang bisa disaring dari bilah filter oleh semua yang
 * melihat dashboard (maks. 8). Tambah lewat menu kolom per sheet (non-modal), hapus per baris; tiap
 * perubahan langsung disimpan (PATCH) lalu halaman disegarkan agar bilah filter memakai daftar baru.
 * Kolom yang tidak lagi ada/tampil di data terbaru ditandai dan bisa dihapus. Satu kolom per nama: filter
 * berlaku per nama di semua sheet, jadi kolom bernama sama dari sheet lain tidak bisa ditambahkan.
 * Setelah menghapus, fokus pindah ke baris berikutnya (atau tombol tambah). Status simpan diumumkan
 * lewat wilayah status yang selalu terpasang (isinya saja yang berganti).
 * Dibuka lewat #kolom-filter (tautan peringatan dialog share, review T-016 R2-UI-6): bagian ini difokus
 * saat terpasang — Next hanya menggulir ke hash, fokus tetap di tombol pemicu di atas halaman (2.4.3).
 * `embedded` (T-k2ec): versi di bilah filter mode edit untuk pemilik dan editor — tanpa jangkar
 * #kolom-filter (hanya kartu pengaturan pemilik yang menjadi tujuan tautan). Daftar mengikuti props
 * baru setelah refresh server, jadi simpanan di satu tempat tidak membuat tempat lain basi.
 */
export function FilterColumnsSettings({
  dashboardId,
  columns,
  sources,
  hidden = 0,
  embedded = false,
}: {
  dashboardId: string;
  columns: FilterColumnView[];
  sources: SourceSheet[];
  /**
   * Editor (T-4q8n): kolom filter tersimpan yang tidak tersedia di data terbaru — namanya tidak dikirim,
   * tetapi tetap tersimpan dan ikut batas maksimum.
   */
  hidden?: number;
  embedded?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [list, setList] = useState(columns);
  const [hiddenCount, setHiddenCount] = useState(hidden);
  const [pending, setPending] = useState(false);
  const [synced, setSynced] = useState(columns);
  if (synced !== columns) {
    setSynced(columns);
    if (!pending) {
      setList(columns);
      setHiddenCount(hidden);
    }
  }
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(columns);
  useEffect(() => {
    latest.current = columns;
  }, [columns]);
  const focusAt = useRef<number | null>(null);
  const multiSheet = sources.length > 1;
  const count = list.length + hiddenCount;
  const full = count >= FILTER_COLUMNS_MAX;
  const taken = new Set(list.map((c) => c.key));
  const names = new Set(list.map((c) => normName(c.column)));

  useEffect(() => {
    if (!embedded) focusIfTargeted(root.current, window.location.hash);
  }, [embedded]);

  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    const buttons = root.current?.querySelectorAll<HTMLElement>("[data-filter-remove]");
    const next = buttons?.[Math.min(at, buttons.length - 1)];
    (next ?? root.current?.querySelector<HTMLElement>("[data-filter-add]"))?.focus();
  });

  async function save(next: FilterColumnView[], focus?: number) {
    // Satu simpan sekaligus (tombol tidak dinonaktifkan: fokus tidak boleh hilang ke <body>).
    if (pending) return;
    const before = list;
    const columnsAtSave = latest.current;
    if (focus !== undefined) focusAt.current = focus;
    setList(next);
    setPending(true);
    setResult(null);
    const plain = (cs: FilterColumnView[]) =>
      cs.map((c) => ({
        sheet: c.sheet,
        column: c.column,
        ...(c.default ? { default: c.default } : {}),
      }));
    // Bawaan (T-vb7q) ikut agar tambah/hapus kolom lain tidak menghapusnya; `before` = daftar yang dilihat
    // (T-4q8n): sudah diubah orang lain → STALE, bukan menimpa diam-diam.
    // `expected` = daftar yang ditampilkan panel ini (`before`), sama dengan dasar `next`: perubahan orang
    // lain — atau simpanan bawaan dari bilah filter yang refresh-nya belum tiba — memberi STALE, tidak
    // pernah ditimpa (review T-4q8n R2). Jawaban dicatat agar "Jadikan filter aktif sebagai bawaan"
    // tidak basi sesudahnya.
    const r = await api.setFilterColumns(dashboardId, plain(next), plain(before));
    setPending(false);
    if (r.ok) {
      rememberSavedColumns(dashboardId, columns, r.data.filterColumns);
      setList(r.data.filterColumns);
      setHiddenCount(r.data.hidden ?? 0);
      setResult({ ok: true, message: "Kolom filter tersimpan." });
      router.refresh();
    } else {
      // Refresh yang tiba selama simpan berjalan menang atas daftar sebelum simpan.
      setList(latest.current === columnsAtSave ? before : latest.current);
      setResult({ ok: false, message: r.message });
    }
  }

  return (
    <section
      ref={root}
      id={embedded ? undefined : FILTER_SETTINGS_ID}
      aria-labelledby={`${id}-h`}
      data-testid={embedded ? "filter-bar-columns" : "dashboard-filter-columns"}
      // Target fokus tautan #kolom-filter (bukan tab stop); cincin hanya untuk fokus keyboard.
      tabIndex={embedded ? undefined : -1}
      className={
        embedded
          ? "flex flex-col gap-3"
          : "flex scroll-mt-[calc(var(--topbar-h)+1rem)] flex-col gap-3 rounded-sm border-t pt-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-h`} className="text-sm font-semibold">
          Kolom filter{" "}
          <span className="font-normal text-muted-foreground">
            ({count} dari maks. {FILTER_COLUMNS_MAX})
          </span>
        </h3>
        <p className="text-sm text-muted-foreground">
          Kolom yang bisa disaring dari bilah filter di atas widget. Kolom tanggal mendapat pilihan
          periode, kolom angka rentang nilai, kolom lain daftar nilai.
        </p>
        {hiddenCount ? (
          <p className="text-xs text-muted-foreground" data-testid="filter-columns-hidden">
            Termasuk {hiddenCount} kolom yang sedang tidak tersedia di data terbaru — tetap
            tersimpan; hanya pemilik dataset yang bisa menghapusnya.
          </p>
        ) : null}
        <p role="status" className="flex items-center gap-1.5 text-sm empty:sr-only">
          {pending ? (
            <span className="text-muted-foreground">Menyimpan kolom filter…</span>
          ) : result?.ok ? (
            <>
              <IconCircleCheck size={18} stroke={1.5} aria-hidden className="text-success" />
              {result.message}
            </>
          ) : null}
        </p>
      </div>
      {result && !result.ok ? <FormAlert tone="error">{result.message}</FormAlert> : null}
      {list.length ? (
        <ul className="flex max-w-xl flex-col rounded-md border" aria-label="Kolom filter">
          {list.map((c, i) => {
            const others = alsoFilters(c, sources);
            return (
              <li
                key={c.key}
                className="flex min-h-11 min-w-0 items-center gap-2 border-b py-1 pr-1 pl-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={c.column}>
                    {c.column}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.available ? TYPE_LABEL[c.type] : null}
                    {multiSheet ? `${c.available ? " · " : ""}Sheet ${c.sheet}` : null}
                  </span>
                  {c.default ? (
                    <span className="block truncate text-xs" data-testid="filter-column-default">
                      Bawaan: {filterText(c.default, c.type)}
                    </span>
                  ) : null}
                  {c.staleDefault ? (
                    <span
                      className="mt-0.5 flex items-start gap-1 text-xs"
                      data-testid="filter-column-stale-default"
                    >
                      <IconAlertTriangle
                        size={14}
                        stroke={1.5}
                        aria-hidden
                        className="mt-px shrink-0 text-warning"
                      />
                      Filter bawaan kolom ini tidak cocok lagi dengan tipe kolomnya — tidak berlaku
                      dan terhapus saat kolom filter disimpan lagi. Atur filternya di bilah filter,
                      lalu Jadikan filter aktif sebagai bawaan.
                    </span>
                  ) : null}
                  {c.available && others.length ? (
                    <span
                      className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground"
                      data-testid="filter-column-multisheet"
                    >
                      <IconStack2 size={14} stroke={1.5} aria-hidden className="mt-px shrink-0" />
                      Juga menyaring sheet {others.join(", ")} (kolom bernama sama) — widget dari
                      sheet itu ikut tersaring.
                    </span>
                  ) : null}
                  {!c.available ? (
                    <span className="mt-0.5 flex items-start gap-1 text-xs">
                      <IconAlertTriangle
                        size={14}
                        stroke={1.5}
                        aria-hidden
                        className="mt-px shrink-0 text-warning"
                      />
                      Tidak ada atau disembunyikan di data terbaru — hapus, atau tampilkan lagi
                      kolomnya di skema.
                    </span>
                  ) : null}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-(--control-h-lg) md:not-any-pointer-coarse:size-(--control-h-sm)"
                  aria-label={`Hapus kolom filter ${c.column}`}
                  data-filter-remove=""
                  onClick={() =>
                    void save(
                      list.filter((x) => x.key !== c.key),
                      i,
                    )
                  }
                >
                  <IconX aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm">Belum ada kolom filter.</p>
      )}
      <AddFilterColumnMenu
        sources={sources}
        taken={taken}
        names={names}
        full={full}
        describedBy={full ? `${id}-full` : undefined}
        onAdd={(c) => void save([...list, c])}
      />
      {full ? (
        <p id={`${id}-full`} className="text-xs text-muted-foreground">
          Sudah {FILTER_COLUMNS_MAX} kolom
          {hiddenCount ? ` (termasuk ${hiddenCount} yang tidak tersedia)` : ""}. Hapus satu untuk
          menambah kolom lain.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Sheet lain (selain sheet sumbernya) yang punya kolom bernama sama dengan kelompok tipe sama — filter
 * dashboard berlaku per nama, jadi widget dari sheet itu ikut tersaring (T-4q8n, review T-k2ec #6).
 */
export function alsoFilters(c: FilterColumnView, sources: SourceSheet[]): string[] {
  const family = typeFamily(c.type);
  return sources
    .filter(
      (s) =>
        normName(s.name) !== normName(c.sheet) &&
        s.columns.some(
          (x) => normName(x.name) === normName(c.column) && typeFamily(x.type) === family,
        ),
    )
    .map((s) => s.name);
}
