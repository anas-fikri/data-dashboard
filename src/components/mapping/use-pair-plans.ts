"use client";

import { useRef, useState } from "react";
import { versionErrorText } from "@/components/datasets/version-history-status";
import { pairPlanAction } from "@/features/versions/actions";
import { pairKey, type PairPlans } from "./mapping-model";
import type { MappingPairPlan } from "./mapping-types";

export type PlanState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plan: MappingPairPlan };

/**
 * Rencana kolom sheet baru yang dipasangkan user dimuat saat dipilih (bukan rencana semua kandidat di
 * muka, SEC-1). Hasil disimpan per pasangan, jadi kembali ke pilihan lama tidak memuat ulang. Jawaban
 * usang (ada permintaan lebih baru untuk pasangan yang sama) diabaikan; jawaban untuk pasangan yang
 * sudah tidak dipilih hanya mengisi cache-nya sendiri dan tidak pernah tampil untuk pilihan lain.
 */
export function usePairPlans(datasetId: string, versionId: string) {
  const [states, setStates] = useState<Record<string, PlanState>>({});
  const seq = useRef(0);
  const latest = useRef<Record<string, number>>({});

  async function load(activeSheetId: string, newSheetId: string) {
    const key = pairKey(activeSheetId, newSheetId);
    const cur = states[key];
    // Sudah termuat atau sedang dimuat: tidak ada permintaan ganda. Galat → pilih/coba lagi = muat ulang.
    if (cur && cur.status !== "error") return;
    const token = ++seq.current;
    latest.current[key] = token;
    setStates((prev) => ({ ...prev, [key]: { status: "loading" } }));
    const res = await pairPlanAction(datasetId, versionId, activeSheetId, newSheetId).catch(
      () => null,
    );
    if (latest.current[key] !== token) return;
    const next: PlanState = res?.ok
      ? { status: "ready", plan: res.data }
      : // Tanpa jawaban (jaringan) → kode kosong → NETWORK_ERROR.
        { status: "error", message: versionErrorText(res?.code ?? "", res?.message ?? "") };
    setStates((prev) => ({ ...prev, [key]: next }));
  }

  const ready: PairPlans = {};
  for (const [key, s] of Object.entries(states)) if (s.status === "ready") ready[key] = s.plan;
  return { states, ready, load };
}
