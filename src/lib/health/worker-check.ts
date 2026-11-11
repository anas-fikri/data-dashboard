import "server-only";
import type { HealthCheck } from "@/lib/health";
import { ingestWorkerCount } from "@/lib/queue/versions";

/**
 * Pemroses unggahan (v1.17.1): jumlah worker yang terhubung ke antrean ingest. Hanya untuk halaman
 * /health (admin melihat detail) — sengaja tidak di infraChecks: /api/health dipakai deploy.sh dan
 * monitor email, sedangkan worker boleh sengaja dimatikan sementara (beban server) tanpa membuat deploy
 * gagal. Tidak diketahui (Redis lambat/CLIENT LIST ditolak) → gagal dengan pesan itu, bukan "OK" palsu.
 */
export function ingestWorkerCheck(
  count: () => Promise<number | null> = () => ingestWorkerCount(),
): HealthCheck {
  return {
    name: "Pemroses unggahan",
    run: async () => {
      const n = await count();
      if (n === null) throw new Error("jumlah worker tidak bisa dibaca dari antrean");
      if (n === 0) {
        throw new Error(
          "tidak ada worker yang terhubung ke antrean — unggahan tidak diproses (nyalakan service worker)",
        );
      }
      return `${n} worker terhubung ke antrean ingest`;
    },
  };
}
