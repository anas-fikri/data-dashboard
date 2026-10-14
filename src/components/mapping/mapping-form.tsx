"use client";

import { useEffect, useState } from "react";
import { MappingConfirm } from "./mapping-confirm";
import {
  domId,
  hiddenExtras,
  nullChoices,
  pairOf,
  pairOptions,
  progress,
  sheetDraft,
  toPayload,
  undecided,
  type MappingDraft,
} from "./mapping-model";
import { MappingSaveBar, SAVE_ID } from "./mapping-save-bar";
import { MappingSheet } from "./mapping-sheet";
import { MappingStatus } from "./mapping-status";
import { MappingSummary } from "./mapping-summary";
import type { MappingReady } from "./mapping-types";
import { useMappingJob } from "./use-mapping-job";

/** Angka ringkasan dari pasangan yang sedang dipakai tiap sheet (berubah saat sheet dipasangkan). */
function counts(view: MappingReady, draft: MappingDraft) {
  let missing = 0;
  let lowCast = 0;
  let hidden = 0;
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    const pair = pairOf(s, d);
    missing += pair?.missing.length ?? 0;
    lowCast += pair?.lowCast.length ?? 0;
    hidden += pair ? hiddenExtras(pair, d).length : 0;
  }
  return { missing, lowCast, hidden, sheets: view.sheets.filter((s) => !s.target).length };
}

const focusSave = () => requestAnimationFrame(() => document.getElementById(SAVE_ID)?.focus());

/**
 * Satu form untuk semua sheet yang bermasalah (T-014): draf hanya di klien sampai disimpan; simpan
 * → validasi lokal (fokus ke keputusan pertama yang belum dibuat) → konfirmasi bila ada kolom
 * dikosongkan/sheet tidak dipakai → job map-version. Server memvalidasi ulang semuanya.
 */
export function MappingForm({ view }: { view: MappingReady }) {
  const [draft, setDraft] = useState<MappingDraft>({});
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { local, job, busy, submit, dismiss } = useMappingJob(
    view.datasetId,
    view.awaiting.id,
    view.applying ? view.jobId : null,
  );
  const { done, total } = progress(view, draft);
  const dirty = Object.keys(draft).length > 0;
  const multi = view.sheets.length > 1;
  // CSV = satu sheet bernama otomatis: judul "Kolom", bukan nama sheet.
  const csv = !multi && /\.csv$/i.test(view.awaiting.fileName ?? "");

  // Draf belum disimpan: peringatan saat menutup/memuat ulang tab (navigasi klien tidak terpengaruh).
  useEffect(() => {
    if (!dirty || busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const open = undecided(view, draft);
    if (open.length > 0) {
      setAttempted(true);
      requestAnimationFrame(() => document.getElementById(domId(open[0]!))?.focus());
      return;
    }
    const nulls = nullChoices(view, draft);
    if (nulls.columns.length + nulls.droppedSheets.length > 0) setConfirming(true);
    else void submit(toPayload(view, draft));
  }

  return (
    <div className="flex flex-col gap-6">
      <MappingStatus
        job={job}
        local={local}
        onDismiss={() => {
          dismiss();
          focusSave();
        }}
      />
      <MappingSummary {...counts(view, draft)} done={done} total={total} />
      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Pemetaan kolom"
        className="flex flex-col gap-4"
      >
        {view.sheets.map((s) => (
          <MappingSheet
            key={s.active.id}
            sheet={s}
            title={csv ? "Kolom" : `Sheet “${s.active.name}”`}
            draft={sheetDraft(draft, s.active.id)}
            candidates={pairOptions(view, draft, s)}
            attempted={attempted}
            disabled={busy}
            onChange={(next) => setDraft((prev) => ({ ...prev, [s.active.id]: next }))}
          />
        ))}
        <MappingSaveBar
          done={done}
          total={total}
          busy={busy}
          pending={local.phase === "submitting"}
        />
      </form>
      <MappingConfirm
        open={confirming}
        choices={nullChoices(view, draft)}
        multiSheet={multi}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void submit(toPayload(view, draft));
        }}
      />
    </div>
  );
}
