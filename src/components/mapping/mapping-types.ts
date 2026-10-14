/*
 * Tipe halaman pemetaan kolom (T-014) yang dipakai UI. Bentuk tampilan berasal dari fitur versi;
 * di sini hanya tampilan yang siap dipetakan dan payload keputusan. Hanya tipe.
 */
import type { MappingCast, MappingInput } from "@/features/ingest/mapping-input";
import type { MappingView } from "@/features/versions/types";

export type {
  MappingActiveColumn,
  MappingCandidate,
  MappingJobState,
  MappingLowCast,
  MappingNewColumn,
  MappingPlanView,
  MappingSheetView,
} from "@/features/versions/types";

/** Tampilan halaman bila ada versi yang menunggu pemetaan. */
export type MappingReady = Extract<MappingView, { none: false }>;

/** Tipe/format pilihan untuk satu kolom baru (tanpa posisi). */
export type CastChoice = Omit<MappingCast, "pos">;

/** Keputusan saja (bukan skema lengkap): jauh di bawah batas body 1 MB. Divalidasi ulang server. */
export type MappingPayload = MappingInput;
