"use client";

/* eslint-disable jsx-a11y/no-interactive-element-to-noninteractive-role, jsx-a11y/no-redundant-roles --
   peran eksplisit (row/cell) menjaga semantik tabel saat display diubah ke block/grid untuk tampilan
   kartu di ponsel; Safari/VoiceOver membuang semantik tabel tanpa ini (pola version-history-row). */

import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconCircleOff,
  IconCopy,
  IconInfoCircle,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconReplace,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { PeriodUsage } from "@/components/datasets/period-usage";
import { VersionConfirm } from "@/components/datasets/version-history-confirm";
import {
  NETWORK_ERROR,
  formatJakarta,
  versionErrorText,
} from "@/components/datasets/version-history-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import {
  formatNaiveDay,
  identicalPeriods,
  keptSheets,
  requiredAcks,
  reviewRows,
  type RequiredAck,
  type ReviewRow,
  type ReviewTone,
} from "@/features/ingest/period-review";
import {
  confirmPeriodUploadAction,
  discardVersionAction,
  reviewPeriodUploadAction,
} from "@/features/versions/actions";
import type { PeriodReviewContext } from "@/features/versions/period-review";
import type { PeriodReview } from "@/features/versions/period-upload";
import { cn } from "@/lib/utils";

/*
 * Layar tinjauan unggahan periode (T-054, rencana G-6 §4.5 langkah 5 dan §4.6): pemilik melihat
 * persis periode yang ditambah/diganti/dilepas/dikecualikan (baris sekarang → setelah per sheet),
 * batas, dan peringatan sebelum "Terapkan". Centang wajib (menyusut, dilepas, buang baris) direset
 * setiap kali rencana berubah; "Terapkan" mengirim sidik rencana yang sedang tampil — rencana server
 * berbeda → PLAN_STALE, rencana baru dimuat dan ditinjau ulang.
 */

const fmt = (n: number) => n.toLocaleString("id-ID");
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
/** Sel ≥ md; di bawahnya baris menjadi kartu (sel bertumpuk, angka diberi label). */
const CELL = "block md:table-cell md:px-3 md:py-2.5 md:align-top";
const NOT_PENDING = /tidak lagi menunggu konfirmasi/;

const TONE: Record<
  ReviewTone,
  { badge: "neutral" | "primary" | "warning" | "destructive"; icon: ReactNode }
> = {
  added: { badge: "primary", icon: <IconPlus /> },
  replaced: { badge: "warning", icon: <IconReplace /> },
  evicted: { badge: "destructive", icon: <IconCircleOff /> },
  excluded: { badge: "neutral", icon: <IconBan /> },
  rejected: { badge: "destructive", icon: <IconBan /> },
  unchanged: { badge: "neutral", icon: <IconCheck /> },
};

function Rows({ n }: { n: number | null }) {
  return n === null ? (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">tidak ada</span>
    </>
  ) : (
    <>{fmt(n)}</>
  );
}

function Callout({
  tone,
  children,
  testId,
  outside,
}: {
  tone: "warning" | "info";
  children: ReactNode;
  testId: string;
  outside?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "warning" ? "border-warning/50 bg-warning/15" : "bg-muted/40",
      )}
      data-testid={testId}
      data-outside={outside === undefined ? undefined : String(outside)}
    >
      {tone === "warning" ? (
        <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
      ) : (
        <IconInfoCircle
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-px shrink-0 text-muted-foreground"
        />
      )}
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {tone === "warning" ? <span className="sr-only">Peringatan: </span> : null}
        {children}
      </span>
    </li>
  );
}

/** Pilihan periode kemungkinan nyasar: Kecualikan (bawaan) / Masukkan. */
function StrayChoice({
  row,
  included,
  disabled,
  onChange,
}: {
  row: ReviewRow;
  included: boolean;
  disabled: boolean;
  onChange: (include: boolean) => void;
}) {
  const uid = useId();
  const option = (value: boolean, label: string, hint: string) => (
    <label
      htmlFor={`${uid}-${value}`}
      className={cn(
        "flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 rounded-md border px-3 py-1.5 text-sm md:min-h-9",
        included === value ? "border-primary bg-accent/40" : "hover:bg-accent/40",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <input
        id={`${uid}-${value}`}
        type="radio"
        name={`${uid}-stray`}
        checked={included === value}
        // aria-disabled (bukan disabled) selama rencana dihitung ulang: fokus tetap di radio pilihan.
        aria-disabled={disabled || undefined}
        onChange={() => {
          if (!disabled) onChange(value);
        }}
        className="size-4 shrink-0 accent-[hsl(var(--primary))]"
        data-testid={value ? "review-stray-include" : "review-stray-exclude"}
      />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">— {hint}</span>
    </label>
  );
  return (
    <fieldset className="mt-2 flex flex-col gap-1.5" data-testid="review-stray">
      <legend className="mb-1 text-sm">
        {row.label}: {fmt(row.fileRows)} baris di file
      </legend>
      {option(false, "Kecualikan (bawaan)", "baris ini tidak disimpan")}
      {option(
        true,
        "Masukkan",
        row.before !== null
          ? `${row.label} di data aktif diganti utuh`
          : `${row.label} ditambahkan`,
      )}
    </fieldset>
  );
}

function ReviewTable({
  rows,
  unchanged,
  include,
  busy,
  onInclude,
}: {
  rows: ReviewRow[];
  unchanged: number;
  include: string[];
  busy: boolean;
  onInclude: (key: string, on: boolean) => void;
}) {
  const label = "text-muted-foreground md:hidden";
  return (
    <div className="flex flex-col gap-2">
      <table
        role="table"
        className="block w-full text-sm md:table md:border-collapse"
        data-testid="review-table"
      >
        <caption className="sr-only">
          Perubahan periode: baris sekarang dan setelah diterapkan
        </caption>
        <thead
          role="rowgroup"
          className="sr-only md:not-sr-only md:table-header-group md:bg-muted md:text-left"
        >
          <tr role="row">
            <th role="columnheader" scope="col" className="md:px-3 md:py-2 md:font-medium">
              Periode
            </th>
            <th
              role="columnheader"
              scope="col"
              className="md:px-3 md:py-2 md:text-right md:font-medium"
            >
              Sekarang
            </th>
            <th
              role="columnheader"
              scope="col"
              className="md:px-3 md:py-2 md:text-right md:font-medium"
            >
              Setelah
            </th>
            <th role="columnheader" scope="col" className="md:px-3 md:py-2 md:font-medium">
              Keterangan
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="flex flex-col gap-2 md:table-row-group">
          {rows.map((r) => {
            const t = TONE[r.tone];
            return (
              <tr
                key={r.key}
                role="row"
                data-testid="review-row"
                data-period={r.key}
                data-action={r.action}
                className="flex flex-col gap-0.5 rounded-md border p-3 md:table-row md:rounded-none md:border-0 md:border-t md:p-0"
              >
                <th
                  role="rowheader"
                  scope="row"
                  className={cn(CELL, "text-left font-semibold md:font-medium")}
                >
                  {r.label}
                </th>
                <td role="cell" className={cn(CELL, "md:text-right")}>
                  <span className={label}>Sekarang: </span>
                  <span className="tabular-nums" data-testid="review-before">
                    <Rows n={r.before} />
                  </span>
                  {r.sheets.length ? <SheetLines sheets={r.sheets} pick={(s) => s.before} /> : null}
                </td>
                <td role="cell" className={cn(CELL, "md:text-right")}>
                  <span className={label}>Setelah: </span>
                  <span className="font-medium tabular-nums" data-testid="review-after">
                    <Rows n={r.after} />
                  </span>
                  {r.sheets.length ? <SheetLines sheets={r.sheets} pick={(s) => s.after} /> : null}
                </td>
                <td role="cell" className={cn(CELL, "pt-1 md:min-w-64")}>
                  <Badge tone={t.badge} icon={t.icon}>
                    <span data-testid="review-note">{r.note}</span>
                  </Badge>
                  {r.flags.length ? (
                    <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {r.flags.map((f) => (
                        <li key={f} className="[overflow-wrap:anywhere]" data-testid="review-flag">
                          {f}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {r.stray ? (
                    <StrayChoice
                      row={r}
                      included={include.includes(r.key)}
                      disabled={busy}
                      onChange={(on) => onInclude(r.key, on)}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unchanged > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="review-unchanged">
          {fmt(unchanged)} periode lain tidak berubah.
        </p>
      ) : null}
    </div>
  );
}

function SheetLines({
  sheets,
  pick,
}: {
  sheets: ReviewRow["sheets"];
  pick: (s: ReviewRow["sheets"][number]) => number | null;
}) {
  return (
    <ul className="text-xs text-muted-foreground">
      {sheets.map((s) => (
        <li key={s.name} className="[overflow-wrap:anywhere]">
          {s.name}: <Rows n={pick(s)} />
        </li>
      ))}
    </ul>
  );
}

export function PeriodReviewForm({
  context,
  initial,
  initialError,
  initialCode = null,
}: {
  context: PeriodReviewContext;
  initial: PeriodReview | null;
  initialError: string | null;
  /** Kode galat tinjauan awal; PLAN_STALE = skema berubah sejak diproses → tawarkan proses ulang. */
  initialCode?: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [review, setReview] = useState<PeriodReview | null>(initial);
  const [include, setInclude] = useState<string[]>(initial?.plan.include ?? []);
  const [acks, setAcks] = useState<Record<RequiredAck["kind"], boolean>>({
    shrink: false,
    evict: false,
    dropped: false,
  });
  /** Galat terbaru; id baru = FocusNotice dipasang ulang dan menerima fokus lagi. */
  const [error, setError] = useState<{ id: number; text: string } | null>(
    initialError ? { id: 0, text: initialError } : null,
  );
  /** Skema aktif berubah sejak file diproses: rencana tidak bisa dihitung, file harus diproses ulang. */
  const [stale, setStale] = useState(initialCode === "PLAN_STALE");
  const [loading, startLoading] = useTransition();
  const [applying, startApply] = useTransition();
  const busy = loading || applying;

  const fail = (text: string) => setError((e) => ({ id: (e?.id ?? 0) + 1, text }));

  /** Rencana dihitung ulang (pilihan nyasar berubah / PLAN_STALE): centang wajib direset. */
  const reload = (next: string[], after?: string) =>
    startLoading(async () => {
      const r = await reviewPeriodUploadAction(context.datasetId, context.versionId, {
        include: next,
      }).catch(() => null);
      if (!r) {
        setInclude(review?.plan.include ?? []);
        return fail(NETWORK_ERROR);
      }
      if (!r.ok) {
        // Pilihan kembali ke rencana yang masih tampil (radio tidak boleh berbeda dengan tabel).
        setInclude(review?.plan.include ?? []);
        fail(versionErrorText(r.code, r.message));
        if (r.code === "PLAN_STALE") {
          setReview(null);
          setStale(true);
        }
        if (NOT_PENDING.test(r.message) || r.code === "NOT_FOUND") router.refresh();
        return;
      }
      setReview(r.data);
      setInclude(r.data.plan.include);
      setAcks({ shrink: false, evict: false, dropped: false });
      if (after) fail(after);
      else setError(null);
    });

  const onInclude = (key: string, on: boolean) => {
    const next = on ? [...new Set([...include, key])].sort() : include.filter((k) => k !== key);
    setInclude(next);
    reload(next);
  };

  /*
   * Skema berubah sejak file diproses: "Terapkan" di server memproses ulang file dengan skema terbaru
   * (status kembali diproses, sidik tidak dicek karena rencana tidak bisa dihitung).
   */
  const reprocess = () =>
    startApply(async () => {
      const r = await confirmPeriodUploadAction(context.datasetId, context.versionId, {
        include: [],
        digest: "0".repeat(64),
        ack: { shrink: false, droppedRows: 0 },
      }).catch(() => null);
      if (!r) return fail(NETWORK_ERROR);
      if (!r.ok && r.code === "PLAN_STALE") {
        router.push(`/datasets/${context.datasetId}`);
        return;
      }
      if (r.ok) {
        router.push(`/datasets/${context.datasetId}?confirmed=1`);
        return;
      }
      fail(versionErrorText(r.code, r.message));
      if (NOT_PENDING.test(r.message) || r.code === "NOT_FOUND") router.refresh();
    });

  if (!review) {
    return (
      <div className="flex flex-col gap-4" data-testid="review-unavailable">
        {error ? (
          <FocusNotice key={error.id} tone="error">
            {error.text}
          </FocusNotice>
        ) : null}
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          {stale ? (
            <Button
              type="button"
              className={CTA}
              onClick={reprocess}
              pending={applying}
              leadingIcon={<IconRefresh aria-hidden />}
              data-testid="review-reprocess"
            >
              Proses ulang dengan skema terbaru
            </Button>
          ) : null}
          <CancelUpload context={context} />
        </div>
      </div>
    );
  }

  const plan = review.plan;
  const { rows, unchanged } = reviewRows(plan, context.sheets, context.fileRows);
  const needed = requiredAcks(plan);
  const identical = identicalPeriods(plan);
  const kept = keptSheets(plan, context.sheets);
  const sheetName = new Map(context.sheets.map((s) => [s.lineageId, s.name]));
  const noChange = plan.confirm.includes("NO_CHANGE");
  const missingAck = needed.find((a) => !acks[a.kind]);
  const blockedBy = plan.rejection
    ? plan.rejection.message
    : noChange
      ? "Tidak ada periode yang berubah dengan pilihan ini. Batalkan unggahan, atau pilih “Masukkan” untuk periode yang dikecualikan."
      : missingAck
        ? `Centang “${missingAck.text}” untuk melanjutkan.`
        : null;

  const apply = () =>
    startApply(async () => {
      const r = await confirmPeriodUploadAction(context.datasetId, context.versionId, {
        include,
        digest: review.digest,
        ack: { shrink: acks.shrink, droppedRows: acks.dropped ? plan.droppedRows : 0 },
      }).catch(() => null);
      if (!r) return fail(NETWORK_ERROR);
      if (r.ok) {
        router.push(`/datasets/${context.datasetId}?confirmed=1`);
        return;
      }
      const text = versionErrorText(r.code, r.message);
      if (r.code === "PLAN_STALE") {
        // Rencana baru (atau file diproses ulang): muat lagi; bila tidak lagi menunggu, halaman
        // di-refresh ke keadaan "tidak lagi menunggu".
        reload(include, text);
        return;
      }
      fail(text);
      if (NOT_PENDING.test(r.message) || r.code === "NOT_FOUND") router.refresh();
    });

  return (
    <div className="flex flex-col gap-6" data-testid="period-review" aria-busy={busy || undefined}>
      <section className="flex flex-col gap-2" aria-labelledby={`${uid}-summary`}>
        <h2 id={`${uid}-summary`} className="text-base font-semibold">
          Ringkasan
        </h2>
        <p className="text-sm [overflow-wrap:anywhere]" data-testid="review-summary">
          {review.summary}.
        </p>
        <p className="text-sm text-muted-foreground" data-testid="review-expiry">
          Data aktif belum berubah. Bila tidak diputuskan, unggahan ini dibuang otomatis pada{" "}
          <time dateTime={context.expiresAt}>{formatJakarta(context.expiresAt)}</time>.
        </p>
      </section>

      {error ? (
        <div data-testid="review-error">
          <FocusNotice key={error.id} tone="error">
            {error.text}
          </FocusNotice>
        </div>
      ) : null}

      {plan.rejection ||
      identical.length ||
      context.labelRanges.length ||
      kept.length ||
      plan.ignoredSheets.length ? (
        <ul className="flex flex-col gap-2" aria-label="Catatan tinjauan">
          {plan.rejection ? (
            <Callout tone="warning" testId="review-rejection">
              {plan.rejection.message}
            </Callout>
          ) : null}
          {identical.map((p) => (
            <Callout key={p} tone="info" testId="review-identical">
              <IconCopy size={16} stroke={1.5} aria-hidden className="me-1 inline align-[-2px]" />
              File ini identik dengan periode {p}. Menerapkannya tidak mengubah isi data.
            </Callout>
          ))}
          {context.labelRanges.map((l) => (
            <Callout
              key={`${l.sheet}:${l.start}`}
              tone={l.outside ? "warning" : "info"}
              testId="review-label-range"
              outside={l.outside}
            >
              {context.sheets.length > 1 ? `Sheet “${l.sheet}”: ` : ""}
              periode dipilih saat upload: <strong>{l.period}</strong>. Kolom “{l.column}” berisi
              tanggal {formatNaiveDay(l.min!)}
              {l.max && l.max !== l.min ? ` – ${formatNaiveDay(l.max)}` : ""}
              {l.outside
                ? `, ada yang di luar ${l.period}. Pastikan periodenya benar; bila salah, batalkan unggahan lalu unggah ulang dengan periode yang tepat.`
                : "."}
            </Callout>
          ))}
          {kept.map((s) => (
            <Callout key={s} tone="info" testId="review-kept-sheet">
              Sheet “{s}” tidak ada di file ini: <strong>Pertahankan data lama sheet itu</strong>{" "}
              (bawaan). Hanya sheet yang ada di file yang diganti.
            </Callout>
          ))}
          {plan.ignoredSheets.map((s) => (
            <Callout key={s} tone="warning" testId="review-ignored-sheet">
              Sheet “{s}” di file tidak cocok dengan sheet data mana pun, jadi tidak disimpan.
            </Callout>
          ))}
        </ul>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby={`${uid}-table`}>
        <h2 id={`${uid}-table`} className="text-base font-semibold">
          Perubahan periode
        </h2>
        <ReviewTable
          rows={rows}
          unchanged={unchanged}
          include={include}
          busy={busy}
          onInclude={onInclude}
        />
        <p className="sr-only" aria-live="polite">
          {loading ? "Menghitung ulang rencana…" : ""}
        </p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${uid}-limits`}>
        <h2 id={`${uid}-limits`} className="text-base font-semibold">
          Batas setelah diterapkan
        </h2>
        <PeriodUsage
          usage={plan.usage}
          sheetName={(id) => (context.sheets.length > 1 ? (sheetName.get(id) ?? null) : null)}
        />
      </section>

      {needed.length ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={blockedBy ? `${uid}-blocked` : undefined}
        >
          <legend className="mb-1 text-base font-semibold">Konfirmasi</legend>
          {needed.map((a) => (
            <label
              key={a.kind}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={acks[a.kind]}
                disabled={busy}
                onChange={(e) => setAcks((x) => ({ ...x, [a.kind]: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
                data-testid={`review-ack-${a.kind}`}
              />
              <span className="font-medium [overflow-wrap:anywhere]">{a.text}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <IconInfoCircle size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
          Periode yang diganti atau dilepas hanya bisa dipulihkan lewat versi lama yang masih
          tersimpan di Riwayat versi.
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <Button
            type="button"
            className={CTA}
            onClick={apply}
            disabled={busy || blockedBy !== null}
            aria-describedby={blockedBy ? `${uid}-blocked` : undefined}
            data-testid="review-apply"
          >
            {applying ? (
              <IconLoader2 aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <IconCheck aria-hidden />
            )}
            Terapkan
          </Button>
          <Button asChild variant="outline" className={CTA}>
            <Link
              href={`/datasets/${context.datasetId}/data?version=${context.versionId}`}
              data-testid="review-view-file"
            >
              <IconTable aria-hidden />
              Lihat isi file
            </Link>
          </Button>
          <CancelUpload context={context} />
        </div>
        {/* Selalu ada (live region): alasan "Terapkan" nonaktif diumumkan saat berubah. */}
        <p
          id={`${uid}-blocked`}
          aria-live="polite"
          className="text-sm text-muted-foreground [overflow-wrap:anywhere] empty:hidden"
          data-testid="review-apply-blocked"
        >
          {blockedBy ?? ""}
        </p>
      </div>
    </div>
  );
}

/** "Batalkan upload": versi dibuang, data aktif tidak berubah, kembali ke halaman dataset. */
function CancelUpload({ context }: { context: PeriodReviewContext }) {
  const router = useRouter();
  const name = context.fileName ?? "file ini";
  return (
    <div className="md:contents md:[&>button]:h-(--control-h)">
      <VersionConfirm
        label="Batalkan upload"
        icon={<IconTrash aria-hidden />}
        testId="review-cancel"
        title={`Batalkan unggahan “${name}”?`}
        description="File ini tidak dipakai dan dibuang; data aktif sekarang tetap dipakai dashboard. Anda bisa mengunggahnya lagi."
        confirmLabel="Batalkan upload"
        destructive
        run={() => discardVersionAction(context.datasetId, context.versionId)}
        onDone={() => router.push(`/datasets/${context.datasetId}?cancelled=1`)}
      />
    </div>
  );
}
