import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PrintDashboard } from "@/components/render/print-dashboard";
import { RenderReadyProvider } from "@/components/render/render-ready";
import { consumeRenderSession, RENDER_COOKIE } from "@/features/exports/render-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ekspor PDF",
  robots: { index: false, follow: false },
};

/**
 * Halaman cetak renderer PDF (T-018). Dibuka hanya lewat penukaran token (GET /render/<token> → 303
 * ke sini + cookie dd.render Path=/render); sesi diambil SEKALI (halaman tidak bisa dimuat ulang), akses
 * dashboard dan user aktif dicek ulang, dan semua data widget diambil di server. Gagal apa pun → 404.
 * Siap dicetak saat <html data-render-ready="1"> (render-ready.tsx).
 */
export default async function RenderPage() {
  const sessionId = (await cookies()).get(RENDER_COOKIE)?.value;
  const data = sessionId ? await consumeRenderSession(sessionId) : null;
  if (!data) notFound();
  return (
    <RenderReadyProvider>
      <PrintDashboard data={data} />
    </RenderReadyProvider>
  );
}
