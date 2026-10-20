"use client";

import type { ReactNode } from "react";
import { fmtInt } from "@/components/schema/labels";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MappingAutoMatched, MappingExtra } from "./mapping-extra";
import { MappingLowCastRow } from "./mapping-lowcast-row";
import { MappingMissingRow } from "./mapping-missing-row";
import {
  castBase,
  castRowId,
  castRows,
  columnKey,
  domId,
  hiddenExtras,
  mappedCast,
  pairOf,
  pickOptions,
  retypedColumns,
  sheetKey,
  withCast,
  withColumn,
  type PairOption,
  type PairPlans,
  type ReviewFlags,
  type SheetDraft,
} from "./mapping-model";
import { MappingPair, PairPlanStatus } from "./mapping-pair";
import type { MappingSheetView } from "./mapping-types";
import type { PlanState } from "./use-pair-plans";

const ERR_COLUMN = "Pilih kolom file baru, atau kosongkan kolom ini.";
const ERR_SHEET = "Pilih sheet file baru, atau nyatakan sheet ini tidak dipakai lagi.";
const ERR_PLAN = "Kolom sheet ini belum termuat. Tunggu sebentar atau muat lagi.";

/** Blok bertajuk di dalam kartu sheet (h3 + penjelasan + daftar baris). */
function Block({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t">
      <div className="flex flex-col gap-1 px-5 pt-4 pb-3">
        <h3 id={id} className="text-sm font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <ul className="border-t">{children}</ul>
    </section>
  );
}

/**
 * Satu sheet aktif yang bermasalah: pasangan sheet (bila tidak ada pasangan otomatis; kolom sheet
 * pilihan dimuat saat dipilih), kolom yang hilang, kolom dengan nilai tidak cocok (termasuk yang
 * ditandai tahap tinjau), kolom baru yang disembunyikan, dan pasangan otomatis.
 */
export function MappingSheet({
  sheet,
  title,
  draft: d,
  plans,
  planState,
  flags,
  candidates,
  attempted,
  disabled,
  onChange,
  onTarget,
  onRetry,
  period = false,
}: {
  sheet: MappingSheetView;
  title: string;
  draft: SheetDraft;
  plans: PairPlans;
  /** Status muat rencana sheet pilihan user (undefined bila tidak ada pilihan sheet). */
  planState: PlanState | undefined;
  flags: ReviewFlags[string] | undefined;
  /** Sheet baru yang bisa dipasangkan (pairOptions); hanya dipakai bila tanpa pasangan otomatis. */
  candidates: PairOption[];
  /** Simpan sudah dicoba: keputusan yang belum dibuat menampilkan galat. */
  attempted: boolean;
  disabled: boolean;
  onChange: (next: SheetDraft) => void;
  /** Sheet pasangan dipilih: draf per pasangan + muat rencana kolomnya. */
  onTarget: (target: string | null) => void;
  onRetry: () => void;
  /**
   * Unggahan periode (T-057): pemetaan hanya untuk periode di file ini, tanpa pilihan tipe (halaman
   * Skema), kolom tambahan menjadi kolom tersembunyi baru.
   */
  period?: boolean;
}) {
  const sid = sheet.active.id;
  const pair = pairOf(sheet, d, plans);
  const active = new Map(sheet.active.columns.map((c) => [c.pos, c]));
  const fresh = new Map((pair?.newColumns ?? []).map((c) => [c.pos, c]));
  const hidden = pair ? hiddenExtras(pair, d) : [];
  const casts = pair && !period ? castRows(pair, flags) : [];
  const retyped = pair && !period ? retypedColumns(sheet, pair, flags) : [];
  const renamed = sheet.target?.name !== sheet.active.name ? sheet.target?.name : undefined;
  const sheetError =
    !attempted || pair ? null : d.target === undefined ? ERR_SHEET : d.target ? ERR_PLAN : null;
  return (
    <Card data-testid="mapping-sheet" data-sheet={sid} className="@container">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {renamed ? <CardDescription>Di file baru bernama “{renamed}”.</CardDescription> : null}
      </CardHeader>

      {!sheet.target ? (
        <MappingPair
          id={domId(sheetKey(sid))}
          sheetName={sheet.active.name}
          candidates={candidates}
          value={d.target}
          error={sheetError}
          disabled={disabled}
          onChange={onTarget}
        >
          {d.target && planState ? (
            <PairPlanStatus state={planState} disabled={disabled} onRetry={onRetry} />
          ) : null}
        </MappingPair>
      ) : null}

      {pair && pair.missing.length > 0 ? (
        <Block
          id={`map-${sid}-missing`}
          title={`Kolom yang tidak ditemukan (${fmtInt(pair.missing.length)})`}
          hint={
            period
              ? "Pilih kolom file baru yang berisi data yang sama; judulnya diingat sehingga unggahan berikutnya terpetakan otomatis. Kosongkan bila kolomnya memang tidak ada: nilainya kosong hanya untuk periode di file ini, periode lama tetap berisi."
              : "Pilih kolom file baru yang berisi data yang sama; kolom itu memakai nama, tipe, dan format kolom aktif sehingga widget tetap jalan. Bila kolomnya memang sudah tidak ada, kosongkan."
          }
        >
          {pair.missing.map((pos) => {
            const column = active.get(pos);
            if (!column) return null;
            const value = d.columns[pos];
            const mismatch = period ? null : mappedCast(sheet, pair, d, pos, flags);
            const cast = mismatch && {
              ...mismatch,
              value: d.casts[mismatch.column.pos] ?? mismatch.base,
            };
            return (
              <MappingMissingRow
                key={pos}
                id={domId(columnKey(sid, pos))}
                column={column}
                options={pickOptions(sheet, pair, d, pos)}
                value={value}
                error={attempted && value === undefined ? ERR_COLUMN : null}
                cast={cast}
                disabled={disabled}
                onChange={(next) => onChange(withColumn(d, pos, next))}
                onCast={(next) => cast && onChange(withCast(d, cast.base, cast.column.pos, next))}
              />
            );
          })}
        </Block>
      ) : null}

      {pair && casts.length > 0 ? (
        <Block
          id={`map-${sid}-lowcast`}
          title={`Nilai yang tidak cocok dengan tipe (${fmtInt(casts.length)})`}
          hint="Saat disimpan, nilai diperiksa ulang; bila masih banyak yang tidak cocok, Anda diminta memastikan sebelum nilai itu dikosongkan. Ganti tipe (mis. ke Teks) atau formatnya bila perlu."
        >
          {casts.map((row) => {
            const base = castBase(sheet, pair, row);
            const column = row.activePos !== null ? active.get(row.activePos) : undefined;
            const original = fresh.get(row.pos)?.original ?? "";
            return (
              <MappingLowCastRow
                key={row.pos}
                id={castRowId(sid, row.pos)}
                row={row}
                name={column?.name ?? (original || `Kolom ${row.pos}`)}
                original={original}
                base={base}
                value={d.casts[row.pos] ?? base}
                disabled={disabled}
                onChange={(next) => onChange(withCast(d, base, row.pos, next))}
              />
            );
          })}
        </Block>
      ) : null}

      {retyped.length > 0 ? (
        <p
          className="border-t px-5 py-3 text-sm text-muted-foreground [overflow-wrap:anywhere]"
          data-testid="mapping-retyped"
        >
          Tipe/format {retyped.map((n) => `“${n}”`).join(", ")} diubah setelah file ini diunggah;
          nilainya diperiksa ulang saat disimpan.
        </p>
      ) : null}

      {hidden.length > 0 ? (
        <MappingExtra id={`map-${sid}-extra`} columns={hidden} period={period} />
      ) : null}
      {pair && pair.autoMatched.length > 0 ? (
        <MappingAutoMatched
          pairs={pair.autoMatched}
          active={sheet.active.columns}
          fresh={pair.newColumns}
        />
      ) : null}
    </Card>
  );
}
