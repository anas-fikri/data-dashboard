"use client";

import { IconPalette } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardColorsContext } from "@/components/widgets/dashboard-colors";
import { PALETTE_LABEL } from "@/features/widgets/status-color";
import {
  PALETTES,
  statusColorsOf,
  type DashboardColors,
  type Palette,
  type Tone,
  type WidgetColors,
} from "@/features/widgets/tone";
import { Choice } from "./config-fields";
import { ColorTemplateFields } from "./status-fields";

/*
 * "Warna dashboard": tema grafik (v1.10.0, warna seri semua Batang/Garis/Pai) dan template warna status
 * (v1.9.0) untuk seluruh dashboard. Widget yang tidak memilih template sendiri (bawaan "Ikuti
 * dashboard") langsung ikut — seragam tanpa mengatur widget satu per satu. Pemilik/editor, mode edit.
 */
const SAVE_DELAY_MS = 350;
// Kelas utuh (Tailwind tidak membaca nama kelas yang disusun saat runtime).
const SWATCHES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

/**
 * Simpanan yang belum tuntas per dashboard (T-q3gm L1): "Selesai"/"Muat ulang" menunggu ini sebelum pindah
 * halaman, sehingga mode lihat tidak memuat template lama.
 */
const settlers = new Map<string, () => Promise<boolean>>();

/**
 * Kirim pilihan warna yang masih menunggu jeda dan tunggu sampai semua permintaan selesai; false = simpan
 * terakhir gagal (pemanggil tetap di mode edit agar pesan galatnya terlihat).
 */
export function settleDashboardColors(dashboardId: string): Promise<boolean> {
  return settlers.get(dashboardId)?.() ?? Promise.resolve(true);
}

export function DashboardColorsControl({
  dashboardId,
  colors,
  onSaved,
  className,
}: {
  dashboardId: string;
  colors: DashboardColors | null;
  onSaved: (colors: DashboardColors | null) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Simpan dengan jeda (geser pemilih warna = banyak perubahan), satu permintaan sekaligus, dan yang
  // terakhir dipilih yang tersimpan. Gagal → kembali ke nilai terakhir yang tersimpan di server.
  const confirmed = useRef(colors);
  const seq = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ n: number; next: DashboardColors | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Permintaan simpan yang sedang berjalan (T-q3gm L3: nilai server hanya diterima saat tidak ada). */
  const inflight = useRef(0);
  /** Hasil simpan terakhir (settle → false bila gagal). */
  const lastOk = useRef(true);
  const body = (next: DashboardColors | null) => JSON.stringify({ colors: next });
  const url = `/api/dashboards/${dashboardId}/colors`;

  const flush = () => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    inflight.current++;
    chain.current = chain.current.then(async () => {
      let ok = false;
      try {
        const r = await fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: body(job.next),
        });
        ok = r.ok;
      } catch {
        ok = false;
      }
      inflight.current--;
      lastOk.current = ok;
      if (ok) confirmed.current = job.next;
      if (job.n !== seq.current) return; // pilihan lebih baru menyusul
      setSaving(false);
      if (!ok) {
        onSaved(confirmed.current);
        setError("Template warna belum tersimpan. Coba lagi.");
      }
    });
  };

  // Gabungan tema grafik + template status; semuanya bawaan → null (kolom kosong).
  const palette: Palette = colors?.palette ?? "default";
  const status = statusColorsOf(colors);
  const tone: Tone | undefined = colors?.tone;
  // Gabungan tema + template + penilaian bawaan; semuanya bawaan → null (kolom kosong).
  const merge = (next: {
    p?: Palette;
    st?: WidgetColors | undefined;
    t?: Tone | undefined;
  }): DashboardColors | null => {
    const p = "p" in next ? next.p! : palette;
    const st = "st" in next ? next.st : status;
    const t = "t" in next ? next.t : tone;
    const v: DashboardColors = {
      ...(st ?? {}),
      ...(p !== "default" ? { palette: p } : {}),
      ...(t ? { tone: t } : {}),
    };
    return Object.keys(v).length ? v : null;
  };

  function change(next: DashboardColors | null) {
    const value = next;
    onSaved(value);
    setError(null);
    setSaving(true);
    pending.current = { n: ++seq.current, next: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Nilai dari server (kanvas mengikuti perubahan rekan, T-q3gm L3) menjadi acuan "terakhir tersimpan" hanya
  // saat tidak ada pilihan yang menunggu/sedang disimpan — pilihan lokal sendiri juga lewat prop ini.
  useEffect(() => {
    if (!pending.current && inflight.current === 0) confirmed.current = colors;
  }, [colors]);

  // "Selesai"/"Muat ulang" (L1): kirim sekarang dan tunggu rantai simpan selesai.
  useEffect(() => {
    const settle = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // Tidak ada yang menunggu/berjalan: gagal lama sudah dipulihkan ke nilai server — tidak menahan Selesai
      // (review T-q3gm r2).
      if (!pending.current && inflight.current === 0) return Promise.resolve(true);
      lastOk.current = true;
      flush();
      return chain.current.then(() => lastOk.current);
    };
    settlers.set(dashboardId, settle);
    return () => {
      if (settlers.get(dashboardId) === settle) settlers.delete(dashboardId);
    };
  });

  // Tutup tab / F5 / pindah halaman sebelum jeda habis (L2): kirim keepalive (tanpa menunggu jawaban).
  // pagehide berjalan juga saat halaman dibuang tanpa cleanup React.
  useEffect(() => {
    const sendNow = (queued: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const job = pending.current;
      pending.current = null;
      if (!job) return;
      const send = () =>
        fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: body(job.next),
          keepalive: true,
        }).then(
          () => undefined,
          () => undefined,
        );
      // Pindah halaman di dalam aplikasi (JS tetap jalan): antre di belakang simpanan yang sedang berjalan agar
      // nilai lama tidak menang (review T-q3gm M2). Halaman dibuang (pagehide): kirim sekarang.
      if (queued) chain.current = chain.current.then(send);
      else void send();
    };
    const onHide = () => sendNow(false);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      sendNow(true);
    };
  }, [url]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={className}
          leadingIcon={<IconPalette aria-hidden />}
          data-testid="dashboard-colors"
        >
          Warna dashboard
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Warna dashboard"
        data-testid="dashboard-colors-panel"
        className="grid gap-3"
      >
        <div className="grid gap-2">
          <Choice
            label="Tema grafik"
            testId="dashboard-palette"
            value={palette}
            options={PALETTES.map((p) => ({ value: p, label: PALETTE_LABEL[p] }))}
            onChange={(p) => change(merge({ p }))}
          />
          {/* Contoh 5 warna seri tema terpilih (warna sungguhan dari globals.css). */}
          <div
            className="flex gap-1"
            aria-hidden
            data-palette={palette === "default" ? undefined : palette}
            data-testid="dashboard-palette-preview"
          >
            {SWATCHES.map((c) => (
              <span key={c} className={`h-3 w-6 rounded-sm ${c}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Warna garis, batang, dan irisan pai di semua grafik dashboard ini.
          </p>
        </div>
        <div className="grid gap-2 border-t pt-3">
          {/* Di luar cakupan dashboard: tanpa pilihan "Ikuti dashboard"; Lembut = bawaan. */}
          <Choice
            label="Penilaian warna bawaan"
            testId="dashboard-tone"
            value={tone ?? "none"}
            options={[
              { value: "none", label: "Tanpa (atur per widget)" },
              { value: "up", label: "Makin tinggi makin baik (mis. tepat waktu)" },
              { value: "down", label: "Makin tinggi makin buruk (mis. klaim, retur)" },
            ]}
            onChange={(v) => change(merge({ t: v === "none" ? undefined : (v as Tone) }))}
          />
          <p className="text-xs text-muted-foreground" data-testid="dashboard-colors-hint">
            Warna status (hijau baik, merah perlu perhatian) untuk semua widget Batang, Garis, Pai,
            dan Pivot yang belum memilih <strong>Penilaian warna</strong> sendiri. Angka yang
            arahnya terbalik (mis. klaim) atau tidak perlu diwarnai: ubah di pengaturan widget itu.
            Tabel diwarnai per kolom di pengaturan Tabel; Angka hanya dengan batas angka.
          </p>
          <DashboardColorsContext.Provider value={null}>
            <ColorTemplateFields colors={status} onChange={(st) => change(merge({ st }))} />
          </DashboardColorsContext.Provider>
        </div>
        <p
          className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"}
          role={error ? "alert" : "status"}
          data-testid="dashboard-colors-status"
        >
          {error ?? (saving ? "Menyimpan…" : "Tersimpan otomatis.")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
