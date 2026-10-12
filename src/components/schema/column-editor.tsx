"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ColumnRow, ROW_GRID } from "./column-row";
import { ColumnToolbar } from "./column-toolbar";
import { draftOf, fmtInt, type ColumnDraft } from "./labels";
import { SaveBar } from "./save-bar";
import { useRecast } from "./use-recast";

/*
 * Editor skema per kolom (T-008 AC 4–5). Hanya draf kolom yang disentuh yang disimpan di state;
 * perubahan dikirim sekaligus (satu recast). Sheet bisa ribuan kolom: cari/saring dan tampil 100
 * per halaman. Validasi nama di klien (kosong, > 120, ganda tanpa peka kapital); server memeriksa ulang.
 */
const PAGE = 100;
const FIELDS = ["name", "type", "numberLocale", "dateFormat", "hidden"] as const;

function diff(d: ColumnDraft, b: ColumnDraft) {
  const out: Partial<ColumnDraft> & { pos: number } = { pos: d.pos };
  for (const f of FIELDS) {
    const v = f === "name" ? d.name.trim() : d[f];
    if (v !== b[f]) Object.assign(out, { [f]: v });
  }
  return out;
}

export function ColumnEditor({ schema }: { schema: ColumnSchema[] }) {
  const { busy, submit, local } = useRecast();
  const base = useMemo(() => new Map(schema.map((c) => [c.pos, draftOf(c)])), [schema]);
  const [drafts, setDrafts] = useState<Record<number, ColumnDraft>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const draftFor = (c: ColumnSchema) => drafts[c.pos] ?? base.get(c.pos)!;
  const changed = Object.values(drafts)
    .filter((d) => Object.keys(diff(d, base.get(d.pos)!)).length > 1)
    .map((d) => d.pos);
  const issues = schema.filter((c) => c.castFailCount > 0).length;
  const q = query.trim().toLowerCase();
  const filtered = schema.filter(
    (c) =>
      (!onlyIssues || c.castFailCount > 0) &&
      (!q || `${draftFor(c).name} ${c.original}`.toLowerCase().includes(q)),
  );

  useEffect(() => {
    if (changed.length === 0 || busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length, busy]);

  function update(next: ColumnDraft) {
    setDrafts((d) => ({ ...d, [next.pos]: next }));
    setErrors(({ [next.pos]: _, ...rest }) => rest);
  }

  function validate(): Record<number, string> {
    const names = new Map(schema.map((c) => [c.pos, draftFor(c).name.trim().toLowerCase()]));
    const count = new Map<string, number>();
    for (const n of names.values()) count.set(n, (count.get(n) ?? 0) + 1);
    const errs: Record<number, string> = {};
    for (const pos of changed) {
      const n = names.get(pos)!;
      if (!n) errs[pos] = "Nama kolom wajib diisi.";
      else if ((count.get(n) ?? 0) > 1) errs[pos] = "Nama ini sudah dipakai kolom lain.";
    }
    return errs;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    const first = Number(Object.keys(errs)[0]);
    if (first) {
      setQuery("");
      setOnlyIssues(false);
      setLimit(Math.max(limit, schema.findIndex((c) => c.pos === first) + 1));
      requestAnimationFrame(() => document.getElementById(`col-${first}-name`)?.focus());
      return;
    }
    const columns = changed.map((pos) => diff(drafts[pos]!, base.get(pos)!));
    await submit({ columns }, { kind: "columns", positions: changed });
  }

  return (
    <form onSubmit={onSave} aria-label="Ubah kolom" noValidate className="@container">
      <ColumnToolbar
        query={query}
        onQuery={(v) => {
          setQuery(v);
          setLimit(PAGE);
        }}
        onlyIssues={onlyIssues}
        onOnlyIssues={(v) => {
          setOnlyIssues(v);
          setLimit(PAGE);
        }}
        issues={issues}
        shown={filtered.length}
        total={schema.length}
      />

      <div
        aria-hidden
        className={`hidden border-y bg-muted/50 px-5 py-2 text-xs font-medium text-muted-foreground ${ROW_GRID}`}
      >
        <span>Nama kolom</span>
        <span>Tipe</span>
        <span>Format</span>
        <span>Isi</span>
        <span>Tampilan</span>
      </div>
      {filtered.length === 0 ? (
        <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
          Tidak ada kolom yang cocok.{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              setQuery("");
              setOnlyIssues(false);
            }}
          >
            Tampilkan semua kolom
          </Button>
        </p>
      ) : (
        <ul className="border-t @4xl:border-t-0" aria-label="Daftar kolom">
          {filtered.slice(0, limit).map((c) => (
            <ColumnRow
              key={c.pos}
              column={c}
              draft={draftFor(c)}
              changed={changed.includes(c.pos)}
              error={errors[c.pos]}
              disabled={busy}
              onChange={update}
            />
          ))}
        </ul>
      )}
      {filtered.length > limit ? (
        <div className="border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setLimit((l) => l + PAGE)}
          >
            Tampilkan {fmtInt(Math.min(PAGE, filtered.length - limit))} kolom berikutnya
          </Button>
        </div>
      ) : null}

      {changed.length > 0 ? (
        <SaveBar
          count={changed.length}
          busy={busy}
          pending={local.phase === "submitting"}
          onReset={() => {
            setDrafts({});
            setErrors({});
          }}
        />
      ) : null}
    </form>
  );
}
