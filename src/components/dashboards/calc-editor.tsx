"use client";

import {
  IconBackspace,
  IconCheck,
  IconMathFunction,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calcText } from "@/features/widgets/calc";
import {
  OP_NAME,
  OP_SYMBOL,
  calcTokens,
  parseCalcTokens,
  parseConstText,
  tokenText,
  type CalcBinOp,
  type CalcToken,
} from "@/features/widgets/calc-tokens";
import { formatNumber } from "@/features/widgets/format";
import { SHOW_AS_LABEL, isAxisShowAs, showAsChoices } from "@/features/widgets/show-as";
import type { CalcValue, NumberFormat, ShowAs } from "@/features/widgets/spec";
import {
  calcAggOptions,
  calcColumnsForAgg,
  calcLeafForChoice,
  calcLeafText,
  calcPreviewSpec,
  checkCalc,
  defaultCalcLeaf,
  type CalcWidgetType,
} from "./calc-editor-model";
import { Choice, ColumnChoice, FORMAT_OPTIONS } from "./config-fields";
import { aggChoiceOf, type SourceColumn } from "./widget-config-model";

/*
 * Field terhitung di panel widget (T-069, rencana G-7 §3.2): kartu ringkas (nama = rumus, format, cara
 * tampil) dan penyusun rumus berbasis token — ukuran (agregasi + kolom), + − × ÷, kurung, angka. Tidak
 * ada kotak SQL/rumus bebas: token diurai menjadi pohon calc.ts yang divalidasi lagi oleh server.
 * Keyboard: Tab ke daftar token, panah kiri/kanan memilih token, Backspace/Delete menghapusnya; tombol
 * penyusun memakai Enter/Spasi. Galat tampil di bawah rumus, terhubung ke token yang salah
 * (aria-describedby) dan diumumkan (aria-live) sebelum simpan. Pratinjau: teks rumus + nilai contoh
 * total keseluruhan (query editor { dashboardId, spec }, D6 tidak berubah).
 */
const TOUCH = "h-(--control-h-lg) md:h-(--control-h)";
const OPS: CalcBinOp[] = ["add", "sub", "mul", "div"];
const PREVIEW_DELAY_MS = 400;

type Props = {
  dashboardId: string;
  sheetId: string;
  type: CalcWidgetType;
  columns: SourceColumn[];
  /** Format widget (dipakai bila field memilih "Ikuti format widget"). */
  widgetFormat: NumberFormat;
  testId?: string;
};

/**
 * Satu field terhitung: kartu ringkas + tombol "Ubah rumus", atau (tanpa `value`) tombol tambah. Satu
 * instans melayani kedua keadaan sehingga fokus kembali ke tombolnya setelah editor ditutup.
 */
export function CalcField({
  value,
  onSave,
  onRemove,
  removeLabel = "Hapus field terhitung",
  addLabel = "Tambah field terhitung",
  split = false,
  axis,
  ...props
}: Props & {
  value?: CalcValue;
  onSave: (v: CalcValue) => void;
  onRemove?: () => void;
  removeLabel?: string;
  addLabel?: string;
  /** Pivot: ada kolom pemisah ("% dari total baris" ditawarkan). */
  split?: boolean;
  /** Nama field acuan total berjalan/selisih. */
  axis?: string;
}) {
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useLayoutEffect(() => {
    if (!refocus.current || editing) return;
    refocus.current = false;
    button.current?.focus();
  });
  const close = () => {
    refocus.current = true;
    setEditing(false);
  };
  const { type, columns } = props;

  if (editing) {
    return (
      <CalcEditor
        {...props}
        value={value}
        onCancel={close}
        onSave={(v) => {
          close();
          onSave(v);
        }}
      />
    );
  }
  if (!value) {
    return (
      <Button
        ref={button}
        type="button"
        variant="outline"
        size="sm"
        className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto md:self-start"
        leadingIcon={<IconMathFunction aria-hidden />}
        onClick={() => setEditing(true)}
        data-testid="calc-add"
      >
        {addLabel}
      </Button>
    );
  }
  const showAs = "showAs" in value ? value.showAs : undefined;
  const choices = type === "kpi" ? null : showAsChoices(type, split, showAs);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={props.testId ?? "calc-field"}>
      <p className="flex min-w-0 gap-2 text-sm break-words">
        <IconMathFunction size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
        <span className="min-w-0" data-testid="calc-formula">
          <span className="font-medium">{value.label}</span>
          <span className="text-muted-foreground">
            {" "}
            = {calcText(value.expr, (l) => calcLeafText(l, columns))}
          </span>
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Format:{" "}
        {value.format
          ? FORMAT_OPTIONS.find((o) => o.value === value.format!.style)?.label
          : "ikuti format widget"}
        . Total dan subtotal dihitung dari rumus atas total, bukan jumlah hasil per baris.
      </p>
      {choices ? (
        <>
          <Choice
            label="Tampilkan sebagai"
            testId="calc-show-as"
            value={showAs ?? "none"}
            options={choices.map((v) => ({ value: v, label: SHOW_AS_LABEL[v] }))}
            onChange={(v) => {
              const { showAs: _, ...rest } = value as CalcValue & { showAs?: ShowAs };
              onSave(v === "none" ? rest : { ...rest, showAs: v });
            }}
          />
          {showAs && showAs !== "none" ? (
            <p className="text-xs text-muted-foreground">
              {isAxisShowAs(showAs)
                ? `Dihitung urut ${axis ?? "label"} naik, termasuk item yang tidak tampil.`
                : "Dibagi hasil rumus atas seluruh data yang lolos filter."}
            </p>
          ) : null}
        </>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          ref={button}
          type="button"
          variant="outline"
          size="sm"
          className="h-(--control-h-lg) flex-1 md:h-(--control-h-sm) md:flex-none"
          leadingIcon={<IconPencil aria-hidden />}
          aria-label={`Ubah rumus ${value.label}`}
          onClick={() => setEditing(true)}
          data-testid="calc-edit"
        >
          Ubah rumus
        </Button>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-(--control-h-lg) flex-1 md:h-(--control-h-sm) md:flex-none"
            leadingIcon={<IconTrash aria-hidden />}
            onClick={() => {
              // Grafik/KPI: instans ini tetap ada sebagai tombol tambah — fokus pindah ke sana.
              refocus.current = true;
              onRemove();
            }}
            data-testid="calc-remove"
          >
            {removeLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Penyusun rumus. `value` kosong = field baru. */
export function CalcEditor({
  dashboardId,
  sheetId,
  type,
  columns,
  widgetFormat,
  value,
  onSave,
  onCancel,
}: Props & {
  value?: CalcValue;
  onSave: (v: CalcValue) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(value?.label ?? "");
  const [labelTouched, setLabelTouched] = useState(false);
  const [tokens, setTokens] = useState<CalcToken[]>(() => (value ? calcTokens(value.expr) : []));
  const [format, setFormat] = useState<NumberFormat | undefined>(value?.format);
  const [leaf, setLeaf] = useState(() => defaultCalcLeaf(columns));
  const [constText, setConstText] = useState("");
  const [constError, setConstError] = useState<string | null>(null);
  // Token yang bisa difokus dengan Tab (roving tabindex); panah kiri/kanan memindahkannya.
  const [active, setActive] = useState(-1);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAfter = useRef<number | "measure" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const measureButton = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const f = focusAfter.current;
    if (f === null) return;
    focusAfter.current = null;
    if (f === "measure") measureButton.current?.focus();
    else chips.current[f]?.focus();
  });
  // Editor terbuka: fokus ke judulnya (konteks untuk pembaca layar), seperti panel pengaturan.
  useEffect(() => heading.current?.focus(), []);

  const showAs = value && "showAs" in value ? value.showAs : undefined;
  const check = checkCalc({ label, tokens, format, showAs, type, columns });
  const formulaError = !check.ok && check.field === "formula" ? check : null;
  const labelError =
    !check.ok && check.field === "label" && (labelTouched || tokens.length > 0) ? check : null;
  const parsed = parseCalcTokens(tokens);
  const leafName = (l: Parameters<typeof calcLeafText>[0]) => calcLeafText(l, columns);
  const formulaText = parsed.ok
    ? calcText(parsed.expr, leafName)
    : tokens.map((t) => tokenText(t, leafName)).join(" ");
  // Nama field tidak ikut kunci pratinjau: mengetik nama tidak menembak query baru.
  const preview = useCalcPreview(
    dashboardId,
    !formulaError && parsed.ok
      ? calcPreviewSpec(sheetId, { label: "Pratinjau", expr: parsed.expr }, columns)
      : null,
  );
  const serverInvalid = preview.status === "invalid";
  const canSave = check.ok && !serverInvalid;
  const errorId = `${id}-error`;
  const shownActive = Math.min(active < 0 ? tokens.length - 1 : active, tokens.length - 1);

  const insert = (tok: CalcToken) => {
    setTokens((t) => [...t, tok]);
    setActive(tokens.length);
  };
  const removeAt = (i: number, forward = false) => {
    const next = tokens.filter((_, j) => j !== i);
    setTokens(next);
    const target = next.length ? Math.min(forward ? i : Math.max(i - 1, 0), next.length - 1) : -1;
    setActive(target);
    focusAfter.current = target >= 0 ? target : "measure";
  };
  const addConst = () => {
    const n = parseConstText(constText);
    if (n === null) {
      setConstError("Isi angka biasa, mis. 100 atau 0,5 (maks. 1.000.000.000.000.000).");
      return;
    }
    setConstError(null);
    setConstText("");
    insert({ t: "num", value: n });
  };

  const fmtChoice = format ? format.style : "inherit";
  const shownFormat = format ?? widgetFormat;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex w-full min-w-0 flex-col gap-3 rounded-md border border-primary/40 bg-card p-3"
      data-testid="calc-editor"
    >
      <h3
        id={`${id}-title`}
        ref={heading}
        tabIndex={-1}
        className="flex items-center gap-2 text-sm font-medium outline-none"
      >
        <IconMathFunction size={20} stroke={1.5} aria-hidden />
        {value ? `Ubah field terhitung` : "Field terhitung baru"}
      </h3>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${id}-label`} className="text-sm font-medium">
          Nama field
        </label>
        <Input
          id={`${id}-label`}
          value={label}
          maxLength={60}
          placeholder="mis. Margin"
          invalid={!!labelError}
          aria-describedby={labelError ? `${id}-label-error` : undefined}
          className={TOUCH}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => setLabelTouched(true)}
          data-testid="calc-label"
        />
        {labelError ? (
          <p id={`${id}-label-error`} className="text-xs text-destructive" aria-live="polite">
            {labelError.message}
          </p>
        ) : null}
      </div>

      <div
        role="group"
        aria-labelledby={`${id}-formula`}
        aria-describedby={`${id}-formula-hint${formulaError && formulaError.at === null ? ` ${errorId}` : ""}`}
        className="flex min-w-0 flex-col gap-1.5"
      >
        <span id={`${id}-formula`} className="text-sm font-medium">
          Rumus
        </span>
        <p id={`${id}-formula-hint`} className="text-xs text-muted-foreground">
          Bagian baru masuk di akhir rumus. Pilih bagian dengan panah kiri/kanan, hapus dengan
          Backspace.
        </p>
        {tokens.length ? (
          <ol
            aria-label="Bagian rumus"
            className="flex min-w-0 flex-wrap gap-1.5 rounded-md border bg-background p-2"
            data-testid="calc-tokens"
          >
            {tokens.map((tok, i) => {
              const wrong = formulaError?.at === i;
              const text = tokenText(tok, leafName);
              return (
                <li key={i} className="min-w-0 max-w-full">
                  <button
                    ref={(el) => {
                      chips.current[i] = el;
                    }}
                    type="button"
                    tabIndex={i === shownActive ? 0 : -1}
                    aria-label={`${tok.t === "op" ? OP_NAME[tok.op] : text}, bagian ${i + 1} dari ${tokens.length}${wrong ? ", perlu diperbaiki" : ""}`}
                    data-invalid={wrong || undefined}
                    aria-describedby={wrong ? errorId : undefined}
                    className={[
                      "inline-flex min-h-11 max-w-full items-center rounded-md border px-2.5 text-sm md:min-h-8",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      tok.t === "measure"
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "bg-muted font-mono",
                      wrong ? "border-destructive ring-1 ring-destructive" : "",
                    ].join(" ")}
                    onFocus={() => setActive(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" || e.key === "Delete") {
                        e.preventDefault();
                        removeAt(i, e.key === "Delete");
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        const j = Math.max(
                          0,
                          Math.min(tokens.length - 1, i + (e.key === "ArrowLeft" ? -1 : 1)),
                        );
                        setActive(j);
                        chips.current[j]?.focus();
                      } else if (e.key === "Home" || e.key === "End") {
                        e.preventDefault();
                        const j = e.key === "Home" ? 0 : tokens.length - 1;
                        setActive(j);
                        chips.current[j]?.focus();
                      }
                    }}
                    data-testid="calc-token"
                  >
                    <span className="min-w-0 truncate">{text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Rumus masih kosong. Mulai dengan menambahkan ukuran di bawah.
          </p>
        )}
        <p
          id={errorId}
          aria-live="polite"
          className={formulaError && tokens.length ? "text-xs text-destructive" : "sr-only"}
          data-testid="calc-error"
        >
          {formulaError && tokens.length ? formulaError.message : ""}
        </p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tambah ke rumus</legend>
        <div className="grid grid-cols-6 gap-1.5" data-testid="calc-operators">
          {OPS.map((op) => (
            <Button
              key={op}
              type="button"
              variant="outline"
              className={`${TOUCH} px-0 font-mono text-base`}
              aria-label={`${OP_SYMBOL[op]} ${OP_NAME[op]}`}
              onClick={() => insert({ t: "op", op })}
            >
              {OP_SYMBOL[op]}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className={`${TOUCH} px-0 font-mono text-base`}
            aria-label="( kurung buka"
            onClick={() => insert({ t: "lparen" })}
          >
            (
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`${TOUCH} px-0 font-mono text-base`}
            aria-label=") kurung tutup"
            onClick={() => insert({ t: "rparen" })}
          >
            )
          </Button>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 rounded-md bg-muted/50 p-2">
          <Choice
            label="Ukuran"
            testId="calc-agg"
            value={aggChoiceOf(leaf)}
            options={calcAggOptions(columns)}
            onChange={(c) => setLeaf(calcLeafForChoice(c, leaf, columns))}
          />
          {leaf.column !== undefined ? (
            <ColumnChoice
              label="dari kolom"
              testId="calc-column"
              value={leaf.column}
              columns={calcColumnsForAgg(leaf.agg, columns)}
              onChange={(column) => setLeaf({ agg: leaf.agg, column })}
            />
          ) : null}
          <Button
            ref={measureButton}
            type="button"
            variant="secondary"
            className={`${TOUCH} w-full`}
            leadingIcon={<IconPlus aria-hidden />}
            onClick={() => insert({ t: "measure", ...leaf })}
            data-testid="calc-add-measure"
          >
            <span className="min-w-0 truncate">Tambah {leafName(leaf)}</span>
          </Button>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-const`} className="text-sm font-medium">
              Angka
            </label>
            <Input
              id={`${id}-const`}
              inputMode="decimal"
              value={constText}
              placeholder="mis. 100"
              invalid={!!constError}
              aria-describedby={constError ? `${id}-const-error` : undefined}
              className={TOUCH}
              onChange={(e) => setConstText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addConst();
                }
              }}
              data-testid="calc-const"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className={TOUCH}
            leadingIcon={<IconPlus aria-hidden />}
            onClick={addConst}
          >
            Tambah angka
          </Button>
          {constError ? (
            <p
              id={`${id}-const-error`}
              className="col-span-2 text-xs text-destructive"
              aria-live="polite"
            >
              {constError}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          className={`${TOUCH} w-full md:w-auto md:self-start`}
          leadingIcon={<IconBackspace aria-hidden />}
          disabled={!tokens.length}
          onClick={() => removeAt(tokens.length - 1)}
        >
          Hapus bagian terakhir
        </Button>
      </fieldset>

      <div className="flex min-w-0 flex-col gap-2">
        <div
          className={
            fmtChoice === "inherit" || fmtChoice === "auto"
              ? "grid min-w-0"
              : "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
          }
        >
          <Choice
            label="Format nilai"
            testId="calc-format"
            value={fmtChoice}
            options={[{ value: "inherit", label: "Ikuti format widget" }, ...FORMAT_OPTIONS]}
            onChange={(style) =>
              setFormat(
                style === "inherit"
                  ? undefined
                  : { style, decimals: format?.decimals ?? (style === "percent" ? 1 : 0) },
              )
            }
          />
          {format && format.style !== "auto" ? (
            <Choice
              label="Desimal"
              value={String(format.decimals)}
              options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(d) => setFormat({ ...format, decimals: Number(d) })}
            />
          ) : null}
        </div>
      </div>

      <div
        className="flex min-w-0 flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm"
        data-testid="calc-preview"
      >
        <p className="break-words">
          <span className="text-muted-foreground">Pratinjau: </span>
          <span data-testid="calc-preview-text">
            {label.trim() || "Field"} = {formulaText || "…"}
          </span>
        </p>
        <p aria-live="polite" className="break-words" data-testid="calc-sample">
          <span className="text-muted-foreground">Total keseluruhan (seluruh data): </span>
          <span
            className={
              serverInvalid || preview.status === "error" ? "text-destructive" : "font-medium"
            }
            data-testid="calc-sample-value"
            data-state={preview.status}
          >
            {preview.status === "ok"
              ? preview.value === null
                ? "– (tidak bisa dihitung, mis. dibagi nol)"
                : formatNumber(preview.value, shownFormat)
              : preview.status === "loading"
                ? "menghitung…"
                : "message" in preview
                  ? preview.message
                  : "muncul setelah rumus lengkap"}
          </span>
        </p>
      </div>

      <div className="flex min-w-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="outline"
          className={`${TOUCH} w-full md:w-auto`}
          onClick={onCancel}
        >
          Batal
        </Button>
        <Button
          type="button"
          className={`${TOUCH} w-full md:w-auto`}
          leadingIcon={<IconCheck aria-hidden />}
          disabled={!canSave}
          onClick={() => check.ok && onSave(check.value)}
          data-testid="calc-save"
        >
          Simpan field
        </Button>
      </div>
    </section>
  );
}

type Preview =
  | { status: "idle" | "loading" }
  | { status: "ok"; value: number | null }
  | { status: "invalid" | "error"; message: string };

/**
 * Nilai contoh rumus atas seluruh data sheet (satu agregat, murah), lewat query editor
 * { dashboardId, spec } — server memvalidasi rumus (resolveCalc) dan jawabannya menjadi penentu:
 * INVALID menonaktifkan Simpan. Ditunda sebentar agar tidak menembak per token.
 */
function useCalcPreview(dashboardId: string, spec: object | null): Preview {
  const key = spec ? JSON.stringify(spec) : "";
  const [res, setRes] = useState<{ key: string; preview: Preview }>({
    key: "",
    preview: { status: "idle" },
  });
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dashboardId, spec: JSON.parse(key) }),
        signal: ctl.signal,
      })
        .then((r) => r.json().catch(() => null))
        .then(
          (j: { ok?: boolean; rows?: unknown[][]; code?: string; message?: string } | null) => {
            if (ctl.signal.aborted) return;
            if (j?.ok && Array.isArray(j.rows)) {
              const v = j.rows[0]?.[0];
              const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : null;
              return setRes({
                key,
                preview: { status: "ok", value: n !== null && Number.isFinite(n) ? n : null },
              });
            }
            setRes({
              key,
              preview: {
                status:
                  j?.code === "INVALID" || j?.code === "COLUMN_UNAVAILABLE" ? "invalid" : "error",
                message: j?.message ?? "Nilai contoh belum bisa dihitung.",
              },
            });
          },
          () => {
            if (ctl.signal.aborted) return;
            setRes({
              key,
              preview: { status: "error", message: "Nilai contoh belum bisa dihitung (koneksi)." },
            });
          },
        );
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [dashboardId, key]);
  if (!key) return { status: "idle" };
  return res.key === key ? res.preview : { status: "loading" };
}
