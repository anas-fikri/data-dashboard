"use client";

import { useEffect, useState } from "react";
import { MappingConfirm } from "./mapping-confirm";
import { MappingLastNotice } from "./mapping-last";
import {
  domId,
  issueTargets,
  nullChoices,
  pairKey,
  pairOptions,
  progress,
  reviewOf,
  sheetDraft,
  sheetKey,
  summaryCounts,
  toPayload,
  undecided,
  withReview,
  withTarget,
  type MappingDraft,
  type ReviewFlags,
} from "./mapping-model";
import { MappingReview, REVIEW_TITLE_ID } from "./mapping-review";
import { MappingSaveBar } from "./mapping-save-bar";
import { MappingSheet } from "./mapping-sheet";
import { MappingStatus, STATUS_ID } from "./mapping-status";
import { MappingSummary } from "./mapping-summary";
import type { MappingReady } from "./mapping-types";
import { useMappingJob } from "./use-mapping-job";
import { usePairPlans } from "./use-pair-plans";

/**
 * Satu form untuk semua sheet yang bermasalah (T-014): draf hanya di klien sampai disimpan; simpan
 * → validasi lokal (fokus ke keputusan pertama yang belum dibuat) → konfirmasi bila ada kolom
 * dikosongkan/sheet tidak dipakai → job map-version → selesai, atau tahap tinjau (nilai < 98 % cocok:
 * ubah tipe, atau simpan dengan persetujuan). Server memvalidasi ulang semuanya.
 */
export function MappingForm({ view }: { view: MappingReady }) {
  const [draft, setDraft] = useState<MappingDraft>({});
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Hasil terakhir dari server (job sebelumnya) tampil sampai pemetaan disimpan lagi.
  const [showLast, setShowLast] = useState(true);
  // Unggahan periode (T-057): tanpa baris tipe, jadi tanda tinjau per kolom tidak dipakai.
  const [flags, setFlags] = useState<ReviewFlags>(() =>
    view.last?.state === "review" && !view.period
      ? withReview({}, view, view.last.issues ?? [])
      : {},
  );
  const plans = usePairPlans(view.datasetId, view.awaiting.id);
  const { local, job, busy, submit, dismiss } = useMappingJob(
    view.datasetId,
    view.awaiting.id,
    view.applying ? view.jobId : null,
    (issues) => {
      if (!view.period) setFlags((prev) => withReview(prev, view, issues));
    },
  );
  const ready = plans.ready;
  const { done, total } = progress(view, draft, ready);
  const dirty = Object.keys(draft).length > 0;
  const multi = view.sheets.length > 1;
  // CSV = satu sheet bernama otomatis: judul "Kolom", bukan nama sheet.
  const csv = !multi && /\.csv$/i.test(view.awaiting.fileName ?? "");
  const idle = local.phase === "idle" && !job.phase;
  const last = showLast && idle ? view.last : null;
  const review = reviewOf(view, draft, ready, local, last);
  // Keputusan sama dengan yang ditinjau: satu-satunya jalan simpan = persetujuan di panel tinjau.
  const ackable = review?.ackable ?? false;

  // Draf belum disimpan: peringatan saat menutup/memuat ulang tab (navigasi klien tidak terpengaruh).
  useEffect(() => {
    if (!dirty || busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  function send(acknowledge = false) {
    setShowLast(false);
    const payload =
      acknowledge && local.phase === "review" && local.payload
        ? local.payload
        : toPayload(view, draft, ready);
    void submit(payload, acknowledge);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Job yang sama hanya menghasilkan tinjau yang sama: arahkan ke panel, jangan kirim ulang.
    if (ackable) {
      document.getElementById(REVIEW_TITLE_ID)?.focus();
      return;
    }
    const open = undecided(view, draft, ready);
    if (open.length > 0) {
      setAttempted(true);
      requestAnimationFrame(() => document.getElementById(domId(open[0]!))?.focus());
      return;
    }
    const nulls = nullChoices(view, draft, ready);
    if (nulls.columns.length + nulls.droppedSheets.length > 0) setConfirming(true);
    else send();
  }

  return (
    <div className="flex flex-col gap-6">
      <MappingStatus job={job} local={local} onDismiss={dismiss} />
      {last && last.state !== "review" ? <MappingLastNotice last={last} /> : null}
      {review ? (
        <MappingReview
          issues={review.issues}
          targets={issueTargets(view, draft, ready, review.issues)}
          showSheet={!csv}
          live={review.live}
          canAcknowledge={ackable}
          disabled={busy}
          onAcknowledge={() => {
            send(true);
            // Panel tinjau hilang; fokus ke banner status yang menggantikannya.
            requestAnimationFrame(() => document.getElementById(STATUS_ID)?.focus());
          }}
        />
      ) : null}
      {/* Hasil tinjau diumumkan sopan; judul panel juga menerima fokus. */}
      <p className="sr-only" aria-live="polite">
        {local.phase === "review"
          ? `Pemetaan belum disimpan: ${local.issues.length} kolom perlu diperiksa.`
          : ""}
      </p>
      <MappingSummary
        {...summaryCounts(view, draft, ready, flags)}
        done={done}
        total={total}
        reviewing={review !== null}
      />
      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Pemetaan kolom"
        className="flex flex-col gap-4"
      >
        {view.sheets.map((s) => {
          const sid = s.active.id;
          const d = sheetDraft(draft, sid);
          return (
            <MappingSheet
              key={sid}
              sheet={s}
              title={csv ? "Kolom" : `Sheet “${s.active.name}”`}
              draft={d}
              plans={ready}
              planState={d.target ? plans.states[pairKey(sid, d.target)] : undefined}
              flags={flags[sid]}
              candidates={pairOptions(view, draft, s)}
              attempted={attempted}
              disabled={busy}
              onChange={(next) => setDraft((prev) => ({ ...prev, [sid]: next }))}
              onTarget={(target) => {
                setDraft((prev) => ({ ...prev, [sid]: withTarget(sheetDraft(prev, sid), target) }));
                if (target) void plans.load(sid, target);
              }}
              period={view.period}
              onRetry={() => {
                if (!d.target) return;
                // Blok galat (dan tombol "Muat lagi" yang difokus) diganti status memuat: fokus ke
                // pemicu sheet dulu agar tidak jatuh ke <body>.
                document.getElementById(domId(sheetKey(sid)))?.focus();
                void plans.load(sid, d.target);
              }}
            />
          );
        })}
        <MappingSaveBar
          done={done}
          total={total}
          busy={busy}
          pending={local.phase === "submitting"}
          reviewPending={ackable}
          period={view.period}
        />
      </form>
      <MappingConfirm
        open={confirming}
        choices={nullChoices(view, draft, ready)}
        multiSheet={multi}
        period={view.period}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          send();
        }}
      />
    </div>
  );
}
