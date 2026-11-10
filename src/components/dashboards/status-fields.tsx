"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  STATUSES,
  STATUS_LABEL,
  TEMPLATE_LABEL,
  TONE_LABEL,
  statusCssVars,
  statusPalette,
  type TableColumnStatus,
} from "@/features/widgets/status-color";
import {
  COLOR_TEMPLATES,
  statusColorsOf,
  type StatusTarget,
  type Tone,
  type ToneSetting,
  type WidgetColors,
} from "@/features/widgets/tone";
import { useDashboardColorsScope, useDashboardTone } from "@/components/widgets/dashboard-colors";
import { cn } from "@/lib/utils";
import { Choice } from "./config-fields";

/*
 * Pengaturan warna status di panel widget: arah penilaian per nilai ("Penilaian warna"), cara menentukan
 * warna (otomatis = posisi di antara nilai lain di widget, v1.7.0; atau batas angka seperti SLA, v1.8.0),
 * dan template warna per widget. Bahasa sederhana; batas diisi seperti angka yang tampil.
 */
const UP_LABEL = "Makin tinggi makin baik (mis. tepat waktu)";
const DOWN_LABEL = "Makin tinggi makin buruk (mis. klaim, retur)";

/**
 * Pilihan penilaian satu nilai (v1.11.0). "inherit" = tidak disimpan: ikut penilaian bawaan dashboard
 * bila ada (selain itu tanpa warna); "none" = sengaja tanpa warna walau dashboard punya bawaan.
 */
export function toneOptions(
  dashTone: Tone | undefined,
  own: ToneSetting | undefined,
  /** Di luar dashboard (editor pivot tersimpan): nilai dipakai di banyak dashboard (review v1.11.0 #1). */
  outside: boolean,
) {
  if (outside) {
    return [
      { value: "inherit", label: "Ikuti penilaian bawaan dashboard (bila diatur)" },
      { value: "none", label: "Tanpa warna" },
      { value: "up", label: UP_LABEL },
      { value: "down", label: DOWN_LABEL },
    ];
  }
  // Tanpa penilaian bawaan (atau Tabel/Angka): pilihan lama — Tanpa warna, naik, turun.
  return [
    {
      value: "inherit",
      label: dashTone ? `Ikuti dashboard (${TONE_LABEL[dashTone].toLowerCase()})` : "Tanpa warna",
    },
    ...(dashTone || own === "none"
      ? [
          {
            value: "none",
            label: dashTone
              ? "Tanpa warna"
              : "Tanpa warna (tetap, walau dashboard diberi penilaian)",
          },
        ]
      : []),
    { value: "up", label: UP_LABEL },
    { value: "down", label: DOWN_LABEL },
  ];
}

/** Arah + batas warna status satu nilai (tone.ts). */
export type ValueStatus = { tone?: ToneSetting; target?: StatusTarget };

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
  noInherit = false,
  compare = false,
}: {
  value: ValueStatus;
  /**
   * Tabel (aturan kolom hanya arah) dan Angka (warna hanya dengan batas): tanpa pilihan "Ikuti dashboard"
   * / "Tanpa warna" eksplisit (v1.11.0).
   */
  noInherit?: boolean;
  /** Label pilihan arah (tabel: "Penilaian warna kolom …"). */
  label?: string;
  onChange: (next: ValueStatus) => void;
  /** Angka (KPI): satu nilai tanpa pembanding → warna hanya dengan batas. */
  kpi?: boolean;
  /** Format persen: batas diisi seperti yang tampil (95 = 95 %). */
  percent?: boolean;
  /** Angka berpembanding (T-43hv): arah juga mewarnai ▲/▼, tanpa batas sekalipun. */
  compare?: boolean;
}) {
  const id = useId();
  const { target } = value;
  // Arah milik nilai ini (untuk batas angka); "none"/tidak diisi = tanpa arah sendiri.
  const tone: Tone | undefined =
    value.tone === "up" || value.tone === "down" ? value.tone : undefined;
  const scopeTone = useDashboardTone();
  const outside = useDashboardColorsScope() === null && !noInherit;
  const dashTone = noInherit ? undefined : scopeTone;
  const inherited = !value.tone ? dashTone : undefined;
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
        value={value.tone ?? "inherit"}
        options={toneOptions(dashTone, value.tone, outside)}
        // Ganti arah: batas lama tidak lagi sesuai urutannya → dikosongkan (isi ulang batas baru).
        onChange={(v) => {
          if (v !== "up" && v !== "down") setMode(kpi ? "target" : "auto");
          setGood("");
          setBad("");
          send(v === "inherit" ? {} : { tone: v as ToneSetting });
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
              ? `Di antara kedua batas = Sedang.${percent ? " Isi seperti yang tampil, mis. 95 untuk 95 %." : ""}${kpi ? (compare ? " Tanpa batas, Angka tidak diwarnai; ▲/▼ pembanding tetap mengikuti arah ini." : " Tanpa batas, Angka tidak diwarnai.") : ""}`
              : `Sepertiga teratas, tengah, dan sepertiga terbawah rentang nilai. ${tone === "up" ? "Tertinggi = Baik." : "Tertinggi = Perlu perhatian."}`)}
        </p>
      ) : inherited ? (
        <p className="text-xs text-muted-foreground" data-testid="config-tone-hint">
          {kpi
            ? "Angka hanya berwarna dengan batas angka — pilih arah sendiri lalu isi batasnya."
            : "Mengikuti penilaian bawaan dashboard (dibanding nilai lain di widget ini). Pilih arah sendiri untuk memakai batas angka."}
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
  const inherited = scope ? statusColorsOf(scope.colors) : undefined;
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
          ? "Penilaian warna dan batasnya diatur di pivot tersimpan (kartu Nilai), atau mengikuti penilaian bawaan dashboard; di sini bisa ganti template warna untuk widget ini."
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
        noInherit
        key={current.pos}
        label={`Penilaian warna kolom ${current.label}`}
        value={rule ?? {}}
        percent={percentOf(current.pos)}
        onChange={(next) => {
          // Tetap di kolom ini (tanpa ini, menghapus warnanya melompat ke kolom berwarna lain → fokus hilang).
          setPicked(current.pos);
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
