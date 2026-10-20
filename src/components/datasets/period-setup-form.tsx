"use client";

import {
  IconAlertTriangle,
  IconCalendarStats,
  IconCheck,
  IconInfoCircle,
  IconListSearch,
  IconLoader2,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { LIMIT_TEXT, PeriodUsage } from "@/components/datasets/period-usage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PeriodGrain } from "@/features/ingest/period";
import type { OnLimit } from "@/features/ingest/period-plan";
import {
  GRAIN_LABEL,
  setupPeriodLabel,
  type SetupPreview,
} from "@/features/ingest/period-setup-plan";
import {
  applyPeriodSetupAction,
  previewPeriodSetupAction,
  savePeriodSettingsAction,
} from "@/features/versions/actions";
import type { PeriodSetupView } from "@/features/versions/period-setup";
import { cn } from "@/lib/utils";

/*
 * "Atur periode" (T-051, rencana G-6 §4.4): pemilik memilih satuan + sumber periode per sheet (kolom
 * tanggal, atau "Saya pilih saat upload" dengan periode data sekarang), pengaturan "Simpan N periode"
 * dan "Saat batas tercapai", lalu "Tinjau" (tanpa mengubah data) dan "Terapkan". Setiap perubahan
 * isian membuang hasil tinjauan: "Terapkan" selalu untuk isian yang terakhir ditinjau.
 */

const fmt = (n: number) => n.toLocaleString("id-ID");
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const LABEL_SOURCE = "label";

/** Penjelasan "Saat batas tercapai" (AC 4: dijelaskan di layar). */
const ON_LIMIT: { value: OnLimit; label: string; hint: string }[] = [
  {
    value: "REJECT",
    label: "Tolak unggahan (bawaan)",
    hint: "Unggahan yang membuat jumlah periode melewati batas ditolak dan data aktif tidak berubah. Hapus periode lama dulu bila ingin menambah periode baru.",
  },
  {
    value: "EVICT_OLDEST",
    label: "Lepas periode terlama otomatis",
    hint: "Periode terlama (menurut tanggal periodenya, bukan tanggal unggah) dilepas utuh agar periode baru muat. Selalu ditampilkan di layar tinjauan sebelum diterapkan, dan masih bisa dipulihkan selama versi lamanya tersimpan.",
  },
];

function labelIso(grain: PeriodGrain, year: string, part: string): string | null {
  if (!/^\d{4}$/.test(year)) return null;
  if (grain === "YEAR") return `${year}-01-01`;
  const n = Number(part);
  if (grain === "QUARTER") {
    return n >= 1 && n <= 4 ? `${year}-${String((n - 1) * 3 + 1).padStart(2, "0")}-01` : null;
  }
  return n >= 1 && n <= 12 ? `${year}-${String(n).padStart(2, "0")}-01` : null;
}

/** Pengaturan dataset: "Simpan N periode" + "Saat batas tercapai". */
function SettingsFields({
  view,
  keep,
  onKeep,
  onLimit,
  onOnLimit,
  error,
}: {
  view: PeriodSetupView;
  keep: string;
  onKeep: (v: string) => void;
  onLimit: OnLimit;
  onOnLimit: (v: OnLimit) => void;
  error: string | null;
}) {
  const uid = useId();
  const { keepDefault, keepMax } = view.limits;
  return (
    <div className="flex flex-col gap-4">
      <Field
        id={`${uid}-keep`}
        label="Simpan N periode terbaru"
        hint={`Kosongkan untuk memakai bawaan admin (${fmt(keepDefault)} periode). Paling banyak ${fmt(keepMax)} periode.`}
        error={error ?? undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={keepMax}
          step={1}
          placeholder={`${keepDefault} (bawaan)`}
          value={keep}
          onChange={(e) => onKeep(e.target.value)}
          className="h-(--control-h-lg) md:h-(--control-h) md:max-w-48"
          data-testid="period-keep"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Saat batas tercapai</legend>
        {ON_LIMIT.map((o) => (
          <label
            key={o.value}
            className={cn(
              "grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-md border px-3 py-2.5",
              onLimit === o.value ? "border-primary bg-accent/40" : "hover:bg-accent/40",
            )}
          >
            <input
              type="radio"
              name={`${uid}-onlimit`}
              value={o.value}
              checked={onLimit === o.value}
              onChange={() => onOnLimit(o.value)}
              aria-describedby={`${uid}-${o.value}-hint`}
              className="row-span-2 mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
              data-testid={`period-onlimit-${o.value}`}
            />
            <span className="text-sm font-medium">{o.label}</span>
            <span
              id={`${uid}-${o.value}-hint`}
              className="col-start-2 text-sm text-muted-foreground"
            >
              {o.hint}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

const keepValue = (keep: string): number | null | "invalid" => {
  const t = keep.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : "invalid";
};

/** Hasil tinjauan: sebaran per sheet, baris tanpa tanggal valid, meter, proyeksi. */
function PreviewResult({ p }: { p: SetupPreview }) {
  const names = new Map(p.sheets.map((s) => [s.lineageId, s.name]));
  const total = p.sheets.reduce((n, s) => n + s.periods.reduce((a, x) => a + x.rows, 0), 0);
  const proj = p.projection;
  return (
    <div className="flex flex-col gap-5" data-testid="period-preview">
      <p className="text-sm" data-testid="period-preview-summary">
        Data sekarang terbagi menjadi <strong>{fmt(p.plan.totals.periodsAfter)} periode</strong> (
        {GRAIN_LABEL[p.grain]}) dengan {fmt(total)} baris bertanggal valid. Belum ada data yang
        berubah.
      </p>
      {p.sheets.map((s) => (
        <section key={s.sheetId} className="flex flex-col gap-2" aria-label={`Sheet ${s.name}`}>
          <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
            Sheet “{s.name}” ·{" "}
            <span className="font-normal text-muted-foreground">
              {s.column ? `dari kolom “${s.column.name}”` : "periode dipilih saat upload"}
            </span>
          </h3>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm" data-testid="period-distribution">
              <caption className="sr-only">Baris per periode sheet {s.name}</caption>
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Periode
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Baris
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.periods.map((x) => (
                  <tr key={x.start} className="border-t" data-testid="period-row">
                    <td className="px-3 py-1.5">{setupPeriodLabel(p.grain, x.start)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(x.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.missing > 0 ? (
            <div
              className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm"
              data-testid="period-missing"
            >
              <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
              <span className="[overflow-wrap:anywhere]">
                {fmt(s.missing)} baris tanpa tanggal valid di kolom “{s.column?.name}”. Contoh nomor
                baris di file:{" "}
                <span data-testid="period-missing-samples">
                  {s.missingSamples.map(fmt).join(", ")}
                </span>
                {s.missing > s.missingSamples.length ? ", …" : ""}.
              </span>
            </div>
          ) : null}
        </section>
      ))}
      <section className="flex flex-col gap-2" aria-labelledby="period-capacity-title">
        <h3 id="period-capacity-title" className="text-sm font-semibold">
          Kapasitas
        </h3>
        <PeriodUsage
          usage={p.plan.usage}
          sheetName={(id) => (p.sheets.length > 1 ? (names.get(id) ?? null) : null)}
        />
        {proj ? (
          <p className="text-sm text-muted-foreground" data-testid="period-projection">
            Dengan rata-rata {fmt(proj.avgRows)} baris per periode
            {proj.sheetName ? ` (sheet “${proj.sheetName}”)` : ""}, dataset ini bisa menyimpan
            sekitar {fmt(proj.capacity)} periode ({LIMIT_TEXT[proj.binding]}).{" "}
            {proj.remaining > 0
              ? `Masih ±${fmt(proj.remaining)} periode lagi sebelum batas.`
              : "Batas sudah tercapai."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function PeriodSetupForm({ view }: { view: PeriodSetupView }) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [grain, setGrain] = useState<PeriodGrain>("MONTH");
  const [sources, setSources] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      view.sheets.map((s) => [
        s.id,
        s.dateColumns[0] ? `col:${s.dateColumns[0].pos}` : LABEL_SOURCE,
      ]),
    ),
  );
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [part, setPart] = useState(String(now.getMonth() + 1));
  const [keep, setKeep] = useState(view.settings.keepPeriods?.toString() ?? "");
  const [onLimit, setOnLimit] = useState<OnLimit>(view.settings.onLimit);
  const [preview, setPreview] = useState<SetupPreview | null>(null);
  const [drop, setDrop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepError, setKeepError] = useState<string | null>(null);

  /** Isian berubah → hasil tinjauan lama tidak berlaku. */
  const changed =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
      setDrop(false);
      setError(null);
      setKeepError(null);
    };
  const anyLabel = view.sheets.some((s) => sources[s.id] === LABEL_SOURCE);

  const payload = (dropMissing: number) => {
    const k = keepValue(keep);
    if (k === "invalid") {
      setKeepError("Jumlah periode harus angka bulat.");
      return null;
    }
    return {
      grain,
      sheets: view.sheets.map((s) => {
        const v = sources[s.id] ?? LABEL_SOURCE;
        return v === LABEL_SOURCE
          ? { sheetId: s.id, source: "LABEL" as const, column: null }
          : { sheetId: s.id, source: "COLUMN" as const, column: Number(v.slice(4)) };
      }),
      label: anyLabel ? labelIso(grain, year, part) : null,
      keepPeriods: k,
      onLimit,
      dropMissing,
    };
  };

  const review = () => {
    const body = payload(0);
    if (!body) return;
    start(async () => {
      const r = await previewPeriodSetupAction(view.datasetId, body);
      if (r.ok) {
        setPreview(r.data);
        setError(null);
      } else if (/periode/i.test(r.message) && /Simpan/.test(r.message)) {
        setKeepError(r.message);
      } else {
        setError(r.message);
      }
    });
  };

  const apply = () => {
    if (!preview) return;
    const body = payload(drop ? preview.missingTotal : 0);
    if (!body) return;
    // Versi dasar + sidik sebaran yang ditinjau: data berubah sejak itu → STALE, tinjau ulang.
    const reviewed = { baseVersionId: preview.baseVersionId, digest: preview.digest };
    start(async () => {
      const r = await applyPeriodSetupAction(view.datasetId, { ...body, reviewed });
      if (r.ok) {
        router.push(`/datasets/${view.datasetId}?period=1`);
      } else {
        setError(r.message);
        if (r.code === "STALE") setPreview(null);
      }
    });
  };

  const blockedBy = preview
    ? (preview.blockers[0] ??
      (preview.needsDrop && !drop
        ? `Pilih “Buang ${fmt(preview.missingTotal)} baris” atau perbaiki tanggalnya di file lalu unggah ulang.`
        : null))
    : null;

  const label = (text: string, id: string) => (
    <label htmlFor={id} className="text-sm font-medium">
      {text}
    </label>
  );
  const trigger = "h-(--control-h-lg) md:h-(--control-h) md:max-w-80";

  return (
    <div className="flex flex-col gap-6" data-testid="period-setup-form">
      <div className="flex flex-col gap-1.5">
        {label("Satuan periode", `${uid}-grain`)}
        <Select value={grain} onValueChange={(v) => changed(setGrain)(v as PeriodGrain)}>
          <SelectTrigger id={`${uid}-grain`} className={trigger} data-testid="period-grain">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTH">Bulan</SelectItem>
            <SelectItem value="QUARTER">Kuartal</SelectItem>
            <SelectItem value="YEAR">Tahun</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view.sheets.map((s) => (
        <div key={s.id} className="flex flex-col gap-1.5">
          {label(`Sumber periode sheet “${s.name}”`, `${uid}-src-${s.id}`)}
          <Select
            value={sources[s.id]}
            onValueChange={(v) => changed(setSources)({ ...sources, [s.id]: v })}
          >
            <SelectTrigger
              id={`${uid}-src-${s.id}`}
              className={trigger}
              aria-describedby={`${uid}-src-${s.id}-hint`}
              data-testid="period-source"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {s.dateColumns.map((c) => (
                <SelectItem key={c.pos} value={`col:${c.pos}`}>
                  Dari kolom tanggal: {c.name} · {GRAIN_LABEL[grain]}
                </SelectItem>
              ))}
              <SelectItem value={LABEL_SOURCE}>Saya pilih saat upload</SelectItem>
            </SelectContent>
          </Select>
          <p id={`${uid}-src-${s.id}-hint`} className="text-sm text-muted-foreground">
            {s.dateColumns.length
              ? "Kolom tanggal disarankan: satu file boleh berisi banyak periode dan dipecah otomatis."
              : "Sheet ini tidak punya kolom bertipe tanggal, jadi periode dipilih setiap kali mengunggah."}
          </p>
        </div>
      ))}

      {anyLabel ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Periode data sekarang</legend>
          <p className="text-sm text-muted-foreground">
            Untuk sheet yang periodenya dipilih saat upload: semua baris data sekarang masuk periode
            ini.
          </p>
          <div className="flex flex-wrap gap-2">
            {grain !== "YEAR" ? (
              <Select value={part} onValueChange={(v) => changed(setPart)(v)}>
                <SelectTrigger
                  aria-label={grain === "MONTH" ? "Bulan" : "Kuartal"}
                  className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-44"
                  data-testid="period-label-part"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {grain === "MONTH"
                    ? MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))
                    : [1, 2, 3, 4].map((q) => (
                        <SelectItem key={q} value={String(q)}>
                          Kuartal {q}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              aria-label="Tahun"
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(e) => changed(setYear)(e.target.value.replace(/\D/g, ""))}
              className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-28"
              data-testid="period-label-year"
            />
          </div>
        </fieldset>
      ) : null}

      <SettingsFields
        view={view}
        keep={keep}
        onKeep={changed(setKeep)}
        onLimit={onLimit}
        onOnLimit={changed(setOnLimit)}
        error={keepError}
      />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant={preview ? "outline" : "primary"}
          className={CTA}
          onClick={review}
          disabled={pending}
          data-testid="period-review"
        >
          {pending && !preview ? (
            <IconLoader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <IconListSearch aria-hidden />
          )}
          Tinjau
        </Button>
        {!preview ? (
          <p className="text-sm text-muted-foreground">
            Tinjau menghitung sebaran baris per periode tanpa mengubah data.
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive [overflow-wrap:anywhere]"
          data-testid="period-error"
        >
          {error}
        </p>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-5">
        {preview ? (
          <>
            <PreviewResult p={preview} />
            {preview.blockers.length ? (
              <ul
                className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                data-testid="period-blockers"
              >
                {preview.blockers.map((b) => (
                  <li key={b} className="flex items-start gap-2 [overflow-wrap:anywhere]">
                    <IconAlertTriangle
                      size={20}
                      stroke={1.5}
                      aria-hidden
                      className="mt-0.5 shrink-0"
                    />
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            {preview.needsDrop ? (
              <label className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-md border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={drop}
                  onChange={(e) => setDrop(e.target.checked)}
                  aria-describedby={`${uid}-drop-hint`}
                  className="row-span-2 mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
                  data-testid="period-drop"
                />
                <span className="text-sm font-medium">
                  Buang {fmt(preview.missingTotal)} baris tanpa tanggal valid
                </span>
                <span id={`${uid}-drop-hint`} className="col-start-2 text-sm text-muted-foreground">
                  Baris ini tidak ikut ke data per periode dan jumlahnya dicatat di riwayat versi.
                  Data lama tetap bisa dipakai lagi dengan mengaktifkan versi sebelumnya.
                </span>
              </label>
            ) : null}
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <IconInfoCircle size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
                Terapkan memecah data aktif menjadi satu bagian per periode sebagai versi baru.
                Dashboard memakai angka yang sama; versi sebelumnya tetap bisa diaktifkan lagi dari
                Riwayat versi.
              </p>
              <Button
                type="button"
                className={CTA}
                onClick={apply}
                disabled={pending || blockedBy !== null}
                aria-describedby={blockedBy ? `${uid}-blocked` : undefined}
                data-testid="period-apply"
              >
                {pending ? (
                  <IconLoader2 aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <IconCheck aria-hidden />
                )}
                Terapkan
              </Button>
              {blockedBy ? (
                <p
                  id={`${uid}-blocked`}
                  className="text-sm text-muted-foreground"
                  data-testid="period-apply-blocked"
                >
                  {blockedBy}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Dataset sudah per periode: ringkasan mode + pengaturan saja (atur ulang = ganti semua data). */
export function PeriodSettingsForm({ view }: { view: PeriodSetupView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [keep, setKeep] = useState(view.settings.keepPeriods?.toString() ?? "");
  const [onLimit, setOnLimit] = useState<OnLimit>(view.settings.onLimit);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = () => {
    const k = keepValue(keep);
    if (k === "invalid") {
      setError("Jumlah periode harus angka bulat.");
      return;
    }
    start(async () => {
      const r = await savePeriodSettingsAction(view.datasetId, { keepPeriods: k, onLimit });
      if (r.ok) {
        setError(null);
        setSaved(true);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  };
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setSaved(false);
      setError(null);
    };
  return (
    <div className="flex flex-col gap-6" data-testid="period-settings-form">
      <div className="flex flex-col gap-1 text-sm" data-testid="period-mode">
        <p className="flex items-center gap-2 font-medium">
          <IconCalendarStats size={20} stroke={1.5} aria-hidden className="shrink-0" />
          Data disimpan {view.grain ? GRAIN_LABEL[view.grain] : "per periode"} ·{" "}
          {fmt(view.periodCount)} periode
        </p>
        <ul className="ml-7 list-disc text-muted-foreground">
          {view.sheets.map((s) => (
            <li key={s.id} className="[overflow-wrap:anywhere]">
              Sheet “{s.name}”:{" "}
              {s.periodSource === "COLUMN"
                ? `dari kolom “${s.periodColumnName ?? "?"}”`
                : "periode dipilih saat upload"}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          Untuk memakai sumber atau satuan periode lain, ganti semua data lalu atur periode lagi.
        </p>
      </div>
      <SettingsFields
        view={view}
        keep={keep}
        onKeep={edit(setKeep)}
        onLimit={onLimit}
        onOnLimit={edit(setOnLimit)}
        error={error}
      />
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className={CTA}
          onClick={save}
          disabled={pending}
          data-testid="period-settings-save"
        >
          {pending ? (
            <IconLoader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <IconCheck aria-hidden />
          )}
          Simpan pengaturan
        </Button>
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          data-testid="period-settings-saved"
        >
          {saved ? "Pengaturan periode disimpan." : ""}
        </p>
      </div>
    </div>
  );
}
