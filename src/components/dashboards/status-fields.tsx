"use client";

import { useId } from "react";
import {
  STATUSES,
  STATUS_LABEL,
  TEMPLATE_LABEL,
  statusCssVars,
  statusPalette,
} from "@/features/widgets/status-color";
import { COLOR_TEMPLATES, type Tone, type WidgetColors } from "@/features/widgets/tone";
import { Choice } from "./config-fields";

/*
 * Pengaturan warna status (v1.7.0) di panel widget: arah penilaian per nilai ("Penilaian warna") dan
 * template warna per widget. Bahasa sederhana, tanpa angka ambang: warna ditentukan posisi nilai di
 * antara nilai lain di widget yang sama (sepertiga teratas / tengah / terbawah).
 */
const TONE_OPTIONS: { value: Tone | "none"; label: string }[] = [
  { value: "none", label: "Tanpa warna" },
  { value: "up", label: "Makin tinggi makin baik (mis. tepat waktu)" },
  { value: "down", label: "Makin tinggi makin buruk (mis. klaim, retur)" },
];

/** Nilai dengan arah penilaian baru (tanpa arah = field dihapus, spec tetap ringkas). */
export function withTone<V extends { tone?: Tone }>(v: V, tone: Tone | undefined): V {
  const { tone: _t, ...rest } = v;
  return (tone ? { ...rest, tone } : rest) as V;
}

export function ToneChoice({
  tone,
  onChange,
}: {
  tone: Tone | undefined;
  onChange: (tone: Tone | undefined) => void;
}) {
  return (
    <>
      <Choice
        label="Penilaian warna"
        testId="config-tone"
        value={tone ?? "none"}
        options={TONE_OPTIONS}
        onChange={(v) => onChange(v === "none" ? undefined : v)}
      />
      {tone ? (
        <p className="text-xs text-muted-foreground" data-testid="config-tone-hint">
          Sel/batang diwarnai menurut posisinya di antara nilai lain di widget ini: sepertiga
          teratas, tengah, dan sepertiga terbawah.{" "}
          {tone === "up" ? "Tertinggi = baik." : "Tertinggi = perlu perhatian."}
        </p>
      ) : null}
    </>
  );
}

/** Template warna widget; tampil hanya bila ada nilai yang diberi penilaian warna. */
export function ColorTemplateFields({
  colors,
  onChange,
}: {
  colors: WidgetColors | undefined;
  onChange: (colors: WidgetColors | undefined) => void;
}) {
  const id = useId();
  const template = colors?.template ?? "soft";
  const custom = colors?.custom ?? (["#C00000", "#FFC000", "#00B050"] as [string, string, string]);
  const preview = statusPalette(colors, false);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2" data-testid="config-colors">
      <Choice
        label="Template warna"
        testId="config-color-template"
        value={template}
        options={COLOR_TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_LABEL[t] }))}
        onChange={(t) =>
          // Lembut = bawaan: tidak disimpan agar spec tetap ringkas.
          onChange(
            t === "soft" ? undefined : t === "custom" ? { template: t, custom } : { template: t },
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
        style={statusCssVars(colors) as React.CSSProperties}
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
