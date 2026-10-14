"use client";

import type { ReactNode } from "react";
import { fmtInt } from "@/components/schema/labels";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MappingAutoMatched, MappingExtra } from "./mapping-extra";
import { MappingLowCastRow } from "./mapping-lowcast-row";
import { MappingMissingRow } from "./mapping-missing-row";
import {
  castBase,
  columnKey,
  domId,
  hiddenExtras,
  pairOf,
  pickOptions,
  sheetKey,
  withCast,
  type SheetDraft,
} from "./mapping-model";
import { MappingPair } from "./mapping-pair";
import type { MappingSheetView } from "./mapping-types";

const ERR_COLUMN = "Pilih kolom file baru, atau kosongkan kolom ini.";
const ERR_SHEET = "Pilih sheet file baru, atau nyatakan sheet ini tidak dipakai lagi.";

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
 * Satu sheet aktif yang bermasalah: pasangan sheet (bila tidak ada pasangan otomatis), kolom yang
 * hilang, kolom dengan nilai tidak cocok, kolom baru yang disembunyikan, dan pasangan otomatis.
 */
export function MappingSheet({
  sheet,
  title,
  draft: d,
  attempted,
  disabled,
  onChange,
}: {
  sheet: MappingSheetView;
  title: string;
  draft: SheetDraft;
  /** Simpan sudah dicoba: keputusan yang belum dibuat menampilkan galat. */
  attempted: boolean;
  disabled: boolean;
  onChange: (next: SheetDraft) => void;
}) {
  const sid = sheet.active.id;
  const pair = pairOf(sheet, d);
  const active = new Map(sheet.active.columns.map((c) => [c.pos, c]));
  const fresh = new Map((pair?.newColumns ?? []).map((c) => [c.pos, c]));
  const hidden = pair ? hiddenExtras(pair, d) : [];
  const renamed = sheet.target?.name !== sheet.active.name ? sheet.target?.name : undefined;
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
          candidates={sheet.candidates}
          value={d.target}
          error={attempted && d.target === undefined ? ERR_SHEET : null}
          disabled={disabled}
          // Pasangan lain = kolom lain: keputusan kolom sebelumnya tidak berlaku lagi.
          onChange={(target) => onChange({ target, columns: {}, casts: {} })}
        />
      ) : null}

      {pair && pair.missing.length > 0 ? (
        <Block
          id={`map-${sid}-missing`}
          title={`Kolom yang tidak ditemukan (${fmtInt(pair.missing.length)})`}
          hint="Pilih kolom file baru yang berisi data yang sama; kolom itu memakai nama, tipe, dan format kolom aktif sehingga widget tetap jalan. Bila kolomnya memang sudah tidak ada, kosongkan."
        >
          {pair.missing.map((pos) => {
            const column = active.get(pos);
            if (!column) return null;
            const value = d.columns[pos];
            return (
              <MappingMissingRow
                key={pos}
                id={domId(columnKey(sid, pos))}
                column={column}
                options={pickOptions(sheet, pair, d, pos)}
                value={value}
                error={attempted && value === undefined ? ERR_COLUMN : null}
                disabled={disabled}
                onChange={(next) => onChange({ ...d, columns: { ...d.columns, [pos]: next } })}
              />
            );
          })}
        </Block>
      ) : null}

      {pair && pair.lowCast.length > 0 ? (
        <Block
          id={`map-${sid}-lowcast`}
          title={`Nilai yang tidak cocok dengan tipe (${fmtInt(pair.lowCast.length)})`}
          hint="Nilai yang tidak cocok dengan tipe yang dipilih dikosongkan saat disimpan. Ganti tipe (mis. ke Teks) atau formatnya bila perlu."
        >
          {pair.lowCast.map((row) => {
            const base = castBase(sheet, pair, row);
            const column = row.activePos !== null ? active.get(row.activePos) : undefined;
            const original = fresh.get(row.pos)?.original ?? "";
            return (
              <MappingLowCastRow
                key={row.pos}
                id={`map-${sid}-cast-${row.pos}`}
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

      {hidden.length > 0 ? <MappingExtra id={`map-${sid}-extra`} columns={hidden} /> : null}
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
