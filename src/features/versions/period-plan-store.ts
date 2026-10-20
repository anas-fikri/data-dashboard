/*
 * Membekukan rencana periode di versi (T-050, rencana G-6 §4.5 langkah 7). Rencana divalidasi ulang
 * terhadap skema v1 sebelum ditulis, dan hanya versi non-terminal yang boleh ditulis: setelah READY
 * atau FAILED rencananya tidak bisa diubah lagi (PLAN_STALE menghitung ulang sebelum konfirmasi, saat
 * versi masih AWAITING_CONFIRM).
 */
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { periodPlanSchema, type PeriodPlan } from "@/features/ingest/period-plan";
import { prisma } from "@/lib/db";

/** Tulis rencana ke DatasetVersion.plan; false bila versi tidak ada atau sudah terminal. */
export async function freezePeriodPlan(versionId: string, plan: PeriodPlan): Promise<boolean> {
  const frozen = periodPlanSchema.parse(JSON.parse(JSON.stringify(plan)));
  const r = await prisma.datasetVersion.updateMany({
    where: { id: versionId, status: { in: [...NON_TERMINAL_STATUSES] } },
    data: { plan: frozen },
  });
  return r.count === 1;
}
