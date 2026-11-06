"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  STATUSES,
  STATUS_LABEL,
  TEMPLATE_LABEL,
  statusCssVars,
  statusPalette,
  type TableColumnStatus,
} from "@/features/widgets/status-color";
import {
  COLOR_TEMPLATES,
  type StatusTarget,
  type Tone,
  type WidgetColors,
} from "@/features/widgets/tone";
import { useDashboardColorsScope } from "@/components/widgets/dashboard-colors";
import { cn } from "@/lib/utils";
import { Choice } from "./config-fields";

/*
 * Pengaturan warna status di panel widget: arah penilaian per nilai ("Penilaian warna"), cara menentukan
 * warna (otomatis = posisi di antara nilai lain di widget, v1.7.0; atau batas angka seperti SLA, v1.8.0),
 * dan template warna per widget. Bahasa sederhana; batas diisi seperti angka yang tampil.
 */
const TONE_OPTIONS: { value: Tone | "none"; label: string }[] = [
  { value: "none", label: "Tanpa warna" },
  { value: "up", label: "Makin tinggi makin baik (mis. tepat waktu)" },
  { value: "down", label: "Makin tinggi makin buruk (mis. klaim, retur)" },
];

/** Arah + batas warna status satu nilai (tone.ts). */
export type ValueStatus = { tone?: Tone; target?: StatusTarget };

/** Nilai dengan arah/batas baru (yang kosong dihapus dari spec agar tetap ringkas). */
export function withStatus<V extends ValueStatus>(v: V, next: ValueStatus): V {
  const { tone: _t, target: _g, ...rest } = v;
  return {
    ...rest,
    ...(next.tone ? { tone: next.tone } : {}),
    ...(next.tone && next.target ? { target: next.target } : {}),
  } as V;
}

/** Teks batas yang diketik → angka (koma desimal Indonesia diterima); kosong = null. */
const num = (t: string): number | null | "bad" => {
  const raw = t.trim();
  // Ada koma: format Indonesia (titik = ribuan); tanpa koma: titik = desimal.
  const s = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
};

const sameStatus = (a: ValueStatus, b: ValueStatus) =>
  a.tone === b.tone && a.target?.good === b.target?.good && a.target?.bad === b.target?.bad;

export function ToneChoice({
  value,
  onChange,
  kpi = false,
  percent = false,
  label = "Penilaian warna",
}: {
  value: ValueStatus;
  /** Label pilihan arah (tabel: "Penilaian warna kolom …"). */
  label?: string;
  onChange: (next: ValueStatus) => void;
  /** Angka (KPI): satu nilai tanpa pembanding → warna hanya dengan batas. */
  kpi?: boolean;
  /** Format persen: batas diisi seperti yang tampil (95 = 95 %). */
  percent?: boolean;
}) {
  const id = useId();
  const { tone, target } = value;
  const [mode, setMode] = useState<"auto" | "target">(target || kpi ? "target" : "auto");
  const [good, setGood] = useState(target ? String(target.good) : "");
  const [bad, setBad] = useState(target ? String(target.bad) : "");
  // Nilai terakhir yang dikirim/diterima: isian lokal disusun ulang HANYA bila nilai berubah dari luar
  // (nilai lain dihapus, kembali ke ukuran biasa) — bukan remount, agar fokus keyboard tidak hilang.
  const last = useRef<ValueStatus>(value);
  useEffect(() => {
    if (sameStatus(value, last.current)) return;
    last.current = value;
    setMode(value.target || kpi ? "target" : "auto");
    setGood(value.target ? String(value.target.good) : "");
    setBad(value.target ? String(value.target.bad) : "");
  }, [value, kpi]);
  const send = (next: ValueStatus) => {
    last.current = next;
    onChange(next);
  };
  const g = num(good);
  const b = num(bad);
  const order = tone === "up" ? "≥" : "≤";
  const worse = tone === "up" ? "<" : ">";
  const error =
    g === "bad" || b === "bad"
      ? "Isi angka saja."
      : g !== null && b !== null && tone && (tone === "up" ? g < b : g > b)
        ? tone === "up"
          ? "Batas Baik harus ≥ batas Perlu perhatian."
          : "Batas Baik harus ≤ batas Perlu perhatian."
        : null;
  const commit = (gs: string, bs: string) => {
    const gn = num(gs);
    const bn = num(bs);
    if (gn === "bad" || bn === "bad" || !tone) return;
    if (gn === null && bn === null) return send({ tone });
    if (gn === null || bn === null) return;
    if (tone === "up" ? gn < bn : gn > bn) return;
    send({ tone, target: { good: gn, bad: bn } });
  };
  return (
    <>
      <Choice
        label={label}
        testId="config-tone"
        value={tone ?? "none"}
        options={TONE_OPTIONS}
        // Ganti arah: batas lama tidak lagi sesuai urutannya → dikosongkan (isi ulang batas baru).
        onChange={(v) => {
          if (v === "none") setMode(kpi ? "target" : "auto");
          setGood("");
          setBad("");
          send(v === "none" ? {} : { tone: v });
        }}
      />
      {tone && !kpi ? (
        <Choice
          label="Cara menentukan warna"
          testId="config-tone-mode"
          value={mode}
          options={[
            { value: "auto", label: "Otomatis: dibanding nilai lain di widget ini" },
            { value: "target", label: "Pakai batas angka (mis. SLA, target)" },
          ]}
          onChange={(m) => {
            setMode(m);
            if (m === "auto") send({ tone });
          }}
        />
      ) : null}
      {tone && mode === "target" ? (
        <fieldset className="grid grid-cols-2 gap-2" data-testid="config-target">
          <legend className="sr-only">Batas warna</legend>
          <label
            htmlFor={`${id}-good`}
            className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          >
            Baik bila {order}
            <Input
              id={`${id}-good`}
              inputMode="decimal"
              value={good}
              aria-invalid={!!error || undefined}
              data-testid="config-target-good"
              onChange={(e) => setGood(e.target.value)}
              onBlur={() => commit(good, bad)}
              placeholder={tone === "up" ? "95" : "2"}
            />
          </label>
          <label
            htmlFor={`${id}-bad`}
            className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          >
            Perlu perhatian bila {worse}
            <Input
              id={`${id}-bad`}
              inputMode="decimal"
              value={bad}
              aria-invalid={!!error || undefined}
              data-testid="config-target-bad"
              onChange={(e) => setBad(e.target.value)}
              onBlur={() => commit(good, bad)}
              placeholder={tone === "up" ? "90" : "5"}
            />
          </label>
        </fieldset>
      ) : null}
      {tone ? (
        <p
          className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
          data-testid="config-tone-hint"
          role={error ? "alert" : undefined}
        >
          {error ??
            (mode === "target"
              ? `Di antara kedua batas = Sedang.${percent ? " Isi seperti yang tampil, mis. 95 untuk 95 %." : ""}${kpi ? " Tanpa batas, Angka tidak diwarnai." : ""}`
              : `Sepertiga teratas, tengah, dan sepertiga terbawah rentang nilai. ${tone === "up" ? "Tertinggi = Baik." : "Tertinggi = Perlu perhatian."}`)}
        </p>
      ) : null}
    </>
  );
}

const CUSTOM_KEY = "dd:status-custom";
const DEFAULT_CUSTOM: [string, string, string] = ["#C00000", "#FFC000", "#00B050"];
function lastCustom(): [string, string, string] {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "null") as unknown;
    if (Array.isArray(v) && v.length === 3 && v.every((x) => /^#[0-9A-F]{6}$/i.test(String(x)))) {
      return v as [string, string, string];
    }
  } catch {
    // Penyimpanan browser tidak tersedia: pakai bawaan.
  }
  return DEFAULT_CUSTOM;
}
function rememberCustom(c: [string, string, string]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(c));
  } catch {
    // Abaikan: hanya kenyamanan.
  }
}

/**
 * Template warna widget; tampil hanya bila ada nilai yang diberi penilaian warna. Di dalam dashboard
 * (v1.9.0) pilihan pertama "Ikuti dashboard" (undefined) dan template lain tersimpan eksplisit di widget;
 * di luar dashboard (editor pivot tersimpan) "Lembut" = bawaan dan tidak disimpan.
 */
const FOLLOW = "follow";
export function ColorTemplateFields({
  colors,
  onChange,
}: {
  colors: WidgetColors | undefined;
  onChange: (colors: WidgetColors | undefined) => void;
}) {
  const id = useId();
  const scope = useDashboardColorsScope();
  const inherited = scope ? (scope.colors ?? undefined) : undefined;
  const template = colors?.template ?? (scope ? FOLLOW : "soft");
  // Warna sendiri terakhir diingat browser: widget lain langsung memakai warna yang sama (konsisten).
  const custom = colors?.custom ?? lastCustom();
  const shown = colors ?? inherited;
  const options = [
    ...(scope
      ? [
          {
            value: FOLLOW,
            label: `Ikuti dashboard — ${TEMPLATE_LABEL[inherited?.template ?? "soft"]}`,
          },
        ]
      : []),
    ...COLOR_TEMPLATES.map((t) => ({ value: t as string, label: TEMPLATE_LABEL[t] })),
  ];
  const preview = statusPalette(shown, false);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2" data-testid="config-colors">
      <Choice
        label="Template warna"
        testId="config-color-template"
        value={template}
        options={options}
        onChange={(t) =>
          onChange(
            t === FOLLOW || (t === "soft" && !scope)
              ? undefined
              : t === "custom"
                ? { template: "custom", custom }
                : { template: t as Exclude<WidgetColors["template"], "custom"> },
          )
        }
      />
      {template === "custom" ? (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Warna sendiri</legend>
          {(["bad", "mid", "good"] as const).map((s, k) => (
            <label key={s} htmlFor={`${id}-${s}`} className="flex items-center gap-1.5 text-sm">
              <input
                id={`${id}-${s}`}
                type="color"
                value={custom[k]}
                data-testid={`config-color-${s}`}
                className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                onChange={(e) => {
                  const next = [...custom] as [string, string, string];
                  next[k] = e.target.value.toUpperCase();
                  rememberCustom(next);
                  onChange({ template: "custom", custom: next });
                }}
              />
              {STATUS_LABEL[s]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div
        className="flex flex-wrap gap-1.5 text-xs"
        aria-hidden
        style={statusCssVars(shown) as React.CSSProperties}
      >
        {STATUSES.map((s) => (
          <span key={s} data-status={s} className="rounded px-2 py-0.5" title={preview.names[s]}>
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Widget terikat pivot tersimpan: arah + batas warna milik nilai pivot tersimpan (satu tempat untuk semua
 * widget yang memakainya); di sini hanya petunjuk ke sana dan pilihan template tampilan ini.
 */
export function BoundStatusFields({
  toned,
  colors,
  editHref,
  onColors,
}: {
  /** Nilai yang ditampilkan widget ini punya penilaian warna di pivot tersimpan. */
  toned: boolean;
  colors: WidgetColors | undefined;
  /** Tautan ubah pivot tersimpan (pemilik dataset); tanpa ini teks saja. */
  editHref?: string;
  onColors: (colors: WidgetColors | undefined) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="bound-status">
      <p className="text-xs text-muted-foreground" data-testid="bound-status-hint">
        {toned
          ? "Penilaian warna dan batasnya diatur di pivot tersimpan (kartu Nilai); di sini bisa ganti template warna untuk widget ini."
          : "Warna status (hijau baik, merah perlu perhatian): atur Penilaian warna di pivot tersimpan — kartu Nilai."}{" "}
        {editHref ? (
          <a
            href={editHref}
            className="underline underline-offset-4"
            data-testid="bound-status-edit"
          >
            Buka pivot tersimpan
          </a>
        ) : null}
      </p>
      {toned ? <ColorTemplateFields colors={colors} onChange={onColors} /> : null}
    </div>
  );
}

/**
 * Warna status Tabel (v1.9.0): pilih kolom angka, lalu penilaian warnanya (sama dengan widget lain).
 * Satu kolom diatur sekaligus agar panel tetap pendek; kolom yang sudah berwarna ditandai di daftar.
 */
export function TableStatusFields({
  columns,
  status,
  colors,
  percentOf,
  onChange,
  onColors,
}: {
  /** Kolom angka yang ditampilkan tabel (urut tabel). */
  columns: { pos: number; label: string }[];
  status: TableColumnStatus[] | undefined;
  colors: WidgetColors | undefined;
  percentOf: (pos: number) => boolean;
  onChange: (status: TableColumnStatus[] | undefined) => void;
  onColors: (colors: WidgetColors | undefined) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  if (!columns.length) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="config-table-status-empty">
        Warna status (hijau baik, merah perlu perhatian) bisa dipakai di kolom angka — tambahkan
        kolom angka ke tabel untuk memakainya.
      </p>
    );
  }
  const rules = new Map((status ?? []).map((s) => [s.column, s]));
  const current =
    columns.find((c) => c.pos === picked) ?? columns.find((c) => rules.has(c.pos)) ?? columns[0]!;
  const rule = rules.get(current.pos);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2" data-testid="config-table-status">
      <Choice
        label="Kolom yang diwarnai"
        testId="config-table-status-column"
        value={String(current.pos)}
        options={columns.map((c) => ({
          value: String(c.pos),
          label: rules.has(c.pos) ? `${c.label} — berwarna` : c.label,
        }))}
        onChange={(v) => setPicked(Number(v))}
      />
      <ToneChoice
        key={current.pos}
        label={`Penilaian warna kolom ${current.label}`}
        value={rule ?? {}}
        percent={percentOf(current.pos)}
        onChange={(next) => {
          const others = (status ?? []).filter((s) => s.column !== current.pos);
          const mine = next.tone ? [{ column: current.pos, ...withStatus({}, next) }] : [];
          const order = columns.map((c) => c.pos);
          const all = [...others, ...(mine as TableColumnStatus[])].sort(
            (a, b) => order.indexOf(a.column) - order.indexOf(b.column),
          );
          onChange(all.length ? all : undefined);
        }}
      />
      {status?.length ? <ColorTemplateFields colors={colors} onChange={onColors} /> : null}
    </div>
  );
}
