"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";
import { takeDownloadNavigation } from "@/lib/download-navigation";
import { createConfigSaves, type ConfigSave } from "./config-saves";
import { api, type ApiResult } from "./dashboard-api";
import { fitToWidgets, sameLayout } from "./layout-ops";

/*
 * Status editor kanvas (T-010). Semua mutasi melewati satu antrean berurutan dan membawa revisi tata
 * letak terakhir yang diketahui; tata letak yang belum terkirim disimpan dulu sebelum tambah/hapus.
 * Server menolak revisi lama dengan STALE → editor berhenti mengirim sampai halaman dimuat ulang
 * (tidak pernah menimpa perubahan tab lain). Geser/ubah ukuran disimpan otomatis (debounce); halaman
 * yang ditutup sebelum jeda habis tetap mengirim lewat keepalive. "Urungkan" membatalkan satu langkah.
 * Setiap tata letak (awal, dari server, hasil geser/urungkan, ganti jenis) dibuat ≥ ukuran minimum
 * jenis widgetnya (tabel 3×4); tata letak lama hanya diperbesar di tampilan sampai disimpan berikutnya.
 * Pengaturan widget yang gagal disimpan (bukan STALE) membuat status "error" sampai berhasil; flush()
 * ("Coba lagi", "Selesai") mengirimnya ulang lebih dulu (config-saves).
 * Akses edit berubah di tengah sesi (T-016: editor diturunkan jadi viewer → FORBIDDEN/403, akses dicabut
 * → NOT_FOUND/404) membekukan editor seperti STALE ("denied"): tidak ada yang dikirim ulang, tanpa loop
 * "Coba lagi"; satu-satunya jalan adalah muat ulang halaman. Ubah judul / jenis + isi widget membawa
 * versi pengaturan widget yang diketahui tab ini (T-016): widget yang sudah diubah di tab lain → STALE
 * (pesan server, editor membeku); berhasil → versi baru disimpan di widget lokal (patchWidget).
 */
export type SaveState = "saved" | "pending" | "saving" | "error" | "stale" | "denied";

/** Editor berhenti mengirim sampai halaman dimuat ulang. */
export const isFrozen = (s: SaveState) => s === "stale" || s === "denied";
export const ACCESS_CHANGED = "Akses edit Anda berubah. Muat ulang halaman.";

/**
 * Jawaban tulis yang membekukan editor (null = bisa dicoba lagi atau hanya ditampilkan). 404 pada
 * tulis berarti tampilan tab ini sudah usang (akses dicabut, atau dashboard/widget dihapus di tempat
 * lain) — mengirim ulang tidak akan pernah berhasil.
 */
export function freezeOf(code: string): { state: "stale" | "denied"; message?: string } | null {
  if (code === "STALE") return { state: "stale" };
  if (code === "FORBIDDEN" || code === "NOT_FOUND") {
    return { state: "denied", message: ACCESS_CHANGED };
  }
  return null;
}

/**
 * Widget setelah PATCH berhasil: nilai dari server + versi pengaturan barunya (T-016). Ubahan
 * berikutnya mengirim versi ini, dan query yang menjawab dengan versi ini tidak dianggap perubahan dari
 * tab lain (kartu tab yang menyimpan tidak pernah menandai dirinya sendiri). Murni.
 */
export const patchWidget = (
  widgets: WidgetView[],
  widgetId: string,
  patch: Partial<Pick<WidgetView, "type" | "spec" | "title" | "version" | "retargeted">>,
): WidgetView[] => widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w));

/*
 * Back/Forward (review T-016 R2-CL-1): Next memulihkan halaman dari cache riwayat klien — props kanvas
 * (versi widget, revisi tata letak) adalah milik kunjungan lama. Kanvas yang dipasang tepat setelah
 * popstate ke URL ini meminta router.refresh() SEKALI dan belum dirender (tanpa query/tulis) sampai
 * props segar tiba. Tanpa ini: suntingan sendiri tampil "Widget ini sudah diubah" dan tulisan pertama
 * di editor yang dipulihkan ditolak STALE. Back/forward cache browser ditangani `pageshow` di bawah.
 */
let popped: { at: number; href: string } | null = null;
/** popstate yang sudah dipakai kanvas yang dirender di dalam event itu (tidak mempersenjatai `popped`). */
let consumed: Event | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (e) => {
    if (e !== consumed) popped = { at: Date.now(), href: window.location.href };
  });
}
/** Pemulihan dari cache riwayat dirender segera setelah popstate; lebih lambat = props dari server. */
const HISTORY_MOUNT_MS = 2000;
/** Refresh tidak selesai (jaringan/antrean router): muat ulang penuh daripada kerangka selamanya. */
const HISTORY_RELOAD_MS = 8000;
/** Tulisan editor yang dilepas ditunggu paling lama ini sebelum refresh Back/Forward. */
const HISTORY_WRITES_MS = 3000;

/*
 * Tulisan editor yang belum selesai, lintas pemasangan kanvas (review T-016 R6-CL-1): antrean editor
 * (termasuk simpanan tertunda panel pengaturan yang dikirim saat panel dilepas) dan tata letak
 * keepalive dari pelepasan editor. Back dari mode edit melepas editor dan memasang kanvas lihat dalam
 * commit yang sama — effect pelepasan berjalan lebih dulu — jadi refresh kanvas lihat menunggu tulisan
 * itu: props segarnya memuat perubahan terakhir sendiri (bukan "Widget ini sudah diubah" / posisi lama).
 */
let unsettled: Promise<void> = Promise.resolve();
export function trackWrite(p: Promise<unknown>) {
  unsettled = Promise.all([unsettled, p.catch(() => {})]).then(() => {});
}
/** Selesai saat semua tulisan yang tercatat sampai saat ini selesai (berhasil atau gagal), atau `ms`. */
export function writesSettled(ms = HISTORY_WRITES_MS): Promise<void> {
  const writes = unsettled;
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    void writes.then(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Pemasangan ini menyusul Back/Forward ke URL yang sama, belum lama. Murni. */
export function isHistoryMount(
  last: { at: number; href: string } | null,
  now: number,
  href: string,
): boolean {
  return !!last && last.href === href && now >= last.at && now - last.at < HISTORY_MOUNT_MS;
}

/**
 * Pemasangan ini berasal dari Back/Forward. React merender pemulihan riwayat secara sinkron DI DALAM
 * event popstate (window.event, sama dengan yang dipakai React): saat dashboard dibuka lewat navigasi
 * klien (klik baris /dashboards, Beranda), modul ini dimuat SETELAH router Next memasang pendengar
 * popstate-nya, jadi kanvas sudah terpasang sebelum pendengar modul di atas berjalan (lead review T-016
 * R4; atribut capture tidak mengubah urutan di window). Render yang tertunda (bukan di dalam event)
 * tetap tertangkap lewat `popped`.
 */
function mountedFromHistory(): boolean {
  const ev = window.event;
  if (ev?.type === "popstate") {
    consumed = ev;
    return true;
  }
  return isHistoryMount(popped, Date.now(), window.location.href);
}

/** Kanvas boleh dirender: bukan dari riwayat, atau refresh yang diminta sudah selesai. Murni. */
export const historyReady = (fromHistory: boolean, refreshed: boolean, refreshing: boolean) =>
  !fromHistory || (refreshed && !refreshing);

/**
 * false selama props kanvas mungkin dari cache riwayat dan refresh-nya belum selesai. setRefreshed
 * ikut transisi refresh, jadi true bersamaan dengan props segar (isPending selesai di commit yang sama).
 */
export function useFreshAfterHistory(): boolean {
  const router = useRouter();
  const [fromHistory] = useState(() => typeof window !== "undefined" && mountedFromHistory());
  const [refreshed, setRefreshed] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const asked = useRef(false);
  const ready = historyReady(fromHistory, refreshed, refreshing);
  useEffect(() => {
    if (!fromHistory || asked.current) return;
    asked.current = true;
    // Dipakai sekali: kanvas yang dipasang lagi di URL ini sesudahnya tidak menyegarkan lagi.
    popped = null;
    // Simpanan editor yang baru dilepas (Back dari mode edit) diterima server dulu (R6-CL-1).
    void writesSettled().then(() =>
      startRefresh(() => {
        setRefreshed(true);
        router.refresh();
      }),
    );
  }, [fromHistory, router]);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => window.location.reload(), HISTORY_RELOAD_MS);
    return () => clearTimeout(t);
  }, [ready]);
  return ready;
}

/**
 * Kunci keadaan halaman dari props server: id + versi tiap widget + revisi tata letak. Mode lihat:
 * berubah (refresh setelah Back, widget dihapus/diubah di tempat lain) → widget dan tata letak diisi
 * ulang dari props (useDashboardEditor) tanpa memasang ulang kanvas — aman karena mode lihat tidak punya
 * perubahan yang belum terkirim. Mode edit TIDAK diisi ulang: refresh dari ganti nama/kolom filter tidak
 * boleh membuang tata letak tertunda atau panel yang terbuka. Juga memasang lagi penjaga refresh akses
 * (AccessRefreshProvider). Murni.
 */
export const viewCanvasKey = (
  widgets: readonly Pick<WidgetView, "id" | "version">[],
  revision: number,
) => `${revision}|${widgets.map((w) => `${w.id}:${w.version}`).join(",")}`;

type Undo =
  | { kind: "layout"; layout: LayoutItem[] }
  | { kind: "add"; widgetId: string }
  | { kind: "delete"; title: string; item: LayoutItem; type: string; spec: unknown };
type Failure = Extract<ApiResult<unknown>, { ok: false }>;

const SAVE_DELAY_MS = 500;

export function useDashboardEditor(o: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
  /** Mode edit: state lokal tidak pernah diganti props server (lihat viewCanvasKey). */
  editing?: boolean;
}) {
  const [widgets, setWidgetsState] = useState(o.widgets);
  const [layout, setLayoutState] = useState(() => fitToWidgets(o.layout, o.widgets));
  // Mode lihat (review T-016 R5-CL-2): props server baru diisi ulang saat render — bukan dengan memasang
  // ulang kanvas, yang menutup popover slicer yang sedang dipakai dan menjatuhkan fokus ke <body>. Kartu
  // tetap ber-key id widget: versi yang berubah dimuat ulang sendiri, widget yang dihapus hilang. Ref
  // (widgetsNow, latest, revision) hanya dipakai tulisan mode edit, yang tidak pernah diisi ulang.
  const seedKey = viewCanvasKey(o.widgets, o.revision);
  const [seed, setSeed] = useState(seedKey);
  if (!o.editing && seed !== seedKey) {
    setSeed(seedKey);
    setWidgetsState(o.widgets);
    setLayoutState(fitToWidgets(o.layout, o.widgets));
  }
  const [undo, setUndo] = useState<Undo | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const revision = useRef(o.revision);
  const latest = useRef(layout);
  const widgetsNow = useRef(o.widgets);
  /** Ada tata letak yang belum diterima server. */
  const dirty = useRef(false);
  /** Server menjawab STALE atau akses berubah: jangan kirim apa pun lagi sampai dimuat ulang. */
  const stale = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saves] = useState(createConfigSaves);
  /** Alasan gagal simpanan pengaturan per widget (baris status panel). */
  const [configErrors, setConfigErrors] = useState(saves.errors);
  const id = o.dashboardId;

  const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(op);
    queue.current = next.catch(() => {});
    trackWrite(queue.current);
    return next;
  }, []);

  /** Tata letak baru (sudah ≥ minimum jenis tiap widget, lihat fitToWidgets). */
  const setLayout = useCallback((next: LayoutItem[]) => {
    const fitted = fitToWidgets(next, widgetsNow.current);
    latest.current = fitted;
    setLayoutState(fitted);
  }, []);
  const setWidgets = useCallback((next: WidgetView[]) => {
    widgetsNow.current = next;
    setWidgetsState(next);
  }, []);

  /** unsaved: perubahannya belum tersimpan → toolbar "Belum tersimpan. Coba lagi" (flush). */
  const failed = useCallback((r: Failure, unsaved = false) => {
    const frozen = freezeOf(r.code);
    if (frozen) {
      stale.current = true;
      clearTimeout(timer.current);
      setSave(frozen.state);
    } else if (unsaved) setSave("error");
    setNotice(frozen?.message ?? r.message);
  }, []);

  /** Simpanan berhasil: tanpa tata letak tertunda, status mengikuti pengaturan widget yang gagal. */
  const settled = useCallback(() => {
    if (!dirty.current && !stale.current) setSave(saves.retries().length ? "error" : "saved");
  }, [saves]);

  /** Kirim tata letak yang belum tersimpan. Hanya dari dalam antrean. */
  const saveNow = useCallback(async () => {
    if (stale.current) return false;
    if (!dirty.current) return true;
    dirty.current = false;
    setSave("saving");
    const r = await api.saveLayout(id, revision.current, latest.current);
    if (!r.ok) {
      dirty.current = true;
      failed(r, true);
      return false;
    }
    revision.current = r.data.layoutRevision;
    // Digeser lagi selama permintaan berjalan → tetap "pending", simpan berikutnya menyusul.
    settled();
    setNotice(null);
    return true;
  }, [id, failed, settled]);

  /** Tata letak baru dari geser/ubah ukuran (atau tombol posisi): simpan otomatis setelah jeda. */
  const commitLayout = useCallback(
    (raw: LayoutItem[], recordUndo = true) => {
      const next = fitToWidgets(raw, widgetsNow.current);
      // Klik pegangan tanpa bergeser / langkah di tepi grid: tidak ada yang disimpan atau diurungkan.
      if (stale.current || sameLayout(next, latest.current)) return;
      if (recordUndo) setUndo({ kind: "layout", layout: latest.current });
      setLayout(next);
      dirty.current = true;
      setSave("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(saveNow), SAVE_DELAY_MS);
    },
    [run, saveNow, setLayout],
  );

  const addWidget = useCallback(
    (restore?: { title: string; at: Omit<LayoutItem, "i">; type: string; spec: unknown }) => {
      clearTimeout(timer.current); // simpan tertunda ikut antrean, sebelum tambah
      return run(async () => {
        if (!(await saveNow())) return null;
        const r = await api.addWidget(id, revision.current, restore);
        if (!r.ok) {
          failed(r);
          return null;
        }
        const { widget, layout: server, layoutRevision } = r.data;
        revision.current = layoutRevision;
        setWidgets([...widgetsNow.current, widget]);
        // Digeser selama permintaan berjalan: posisi lokal dipertahankan, simpan otomatis menyusul.
        const added = server.find((it) => it.i === widget.id);
        setLayout(dirty.current && added ? [...latest.current, added] : server);
        setUndo(restore ? null : { kind: "add", widgetId: widget.id });
        setNotice(
          r.data.configDropped
            ? "Widget dipulihkan tanpa isi karena datanya sudah berubah (mis. kolomnya disembunyikan). Atur ulang lewat tombol pengaturan."
            : null,
        );
        return widget.id;
      });
    },
    [id, run, saveNow, failed, setLayout, setWidgets],
  );

  const removeWidget = useCallback(
    (widgetId: string, recordUndo = true) => {
      clearTimeout(timer.current);
      return run(async () => {
        if (!(await saveNow())) return false;
        const item = latest.current.find((it) => it.i === widgetId);
        const gone = widgetsNow.current.find((w) => w.id === widgetId);
        const title = gone?.title ?? "";
        const r = await api.deleteWidget(id, widgetId, revision.current);
        if (!r.ok) {
          failed(r);
          return false;
        }
        revision.current = r.data.layoutRevision;
        setWidgets(widgetsNow.current.filter((w) => w.id !== widgetId));
        setLayout(dirty.current ? latest.current.filter((it) => it.i !== widgetId) : r.data.layout);
        // Pengaturannya yang gagal tidak perlu dikirim ulang lagi.
        saves.forget(widgetId);
        setConfigErrors(saves.errors());
        settled();
        setUndo(
          recordUndo && item
            ? {
                kind: "delete",
                title,
                item,
                type: gone?.type ?? "empty",
                // Spec widget yang dialihkan hanya tampilan (T-013): tidak valid → dipulihkan kosong.
                spec: gone?.retargeted ? null : (gone?.spec ?? {}),
              }
            : null,
        );
        setNotice(null);
        return true;
      });
    },
    [id, run, saveNow, failed, setLayout, setWidgets, saves, settled],
  );

  /** Versi pengaturan widget yang terakhir diketahui tab ini (dikirim bersama ubahan, T-016). */
  const versionOf = useCallback(
    (widgetId: string) => widgetsNow.current.find((w) => w.id === widgetId)?.version,
    [],
  );

  const renameWidget = useCallback(
    (widgetId: string, title: string) =>
      run(async () => {
        const r = await api.renameWidget(id, widgetId, title, versionOf(widgetId));
        if (!r.ok) {
          // STALE (diubah di tab lain) membekukan editor seperti tata letak: pesan server + "Muat ulang".
          failed(r);
          return false;
        }
        setWidgets(
          patchWidget(widgetsNow.current, widgetId, {
            title: r.data.title,
            version: r.data.version,
          }),
        );
        return true;
      }),
    [id, run, failed, setWidgets, versionOf],
  );

  /**
   * Kirim pengaturan widget; hasil server (spec ternormalisasi) jadi sumber kebenaran. Hanya dari dalam
   * antrean, setelah saves.start(widgetId, c).
   */
  const sendConfig = useCallback(
    async (widgetId: string, c: ConfigSave) => {
      // Widget sudah dihapus (mis. simpanan tertunda panel saat "Hapus widget"): tidak ada yang disimpan.
      if (!widgetsNow.current.some((w) => w.id === widgetId)) {
        saves.finish(widgetId, c, null);
        return true;
      }
      const r = await api.configureWidget(id, widgetId, c.type, c.spec, versionOf(widgetId));
      // Gagal biasa: diingat untuk dikirim ulang; alasannya juga untuk baris status panel (di layar
      // < 1280 px pesan kanvas tertutup panel). Pengaturan tidak valid: alasan tetap tampil, tidak dikirim
      // ulang, tidak menahan "Selesai". STALE / akses berubah / sudah dihapus di tempat lain (freezeOf):
      // editor membeku — panel tertutup, tidak ada yang dikirim ulang.
      const frozen = !r.ok && freezeOf(r.code) !== null;
      const invalid = !r.ok && r.code === "INVALID";
      saves.finish(widgetId, c, r.ok || frozen ? null : r.message, !invalid);
      setConfigErrors(saves.errors());
      if (!r.ok) {
        failed(r, !invalid);
        if (invalid) settled();
        return false;
      }
      setWidgets(
        // Tersimpan → spec sudah di sheet aktif; tanda "dialihkan" (T-013) tidak berlaku lagi.
        patchWidget(widgetsNow.current, widgetId, {
          type: r.data.type,
          spec: r.data.spec,
          version: r.data.version,
          retargeted: undefined,
        }),
      );
      settled();
      // Jadi tabel di kartu kecil: diperbesar ke minimum tabel dan disimpan otomatis.
      commitLayout(latest.current, false);
      setNotice(null);
      return true;
    },
    [id, saves, failed, setWidgets, settled, commitLayout, versionOf],
  );

  /** Atur jenis + isi widget (T-011). Tercatat "dikirim" sejak masuk antrean (panel yang dibuka ulang). */
  const configureWidget = useCallback(
    (widgetId: string, type: string, spec: unknown) => {
      const c = { type, spec };
      saves.start(widgetId, c);
      return run(() => sendConfig(widgetId, c));
    },
    [run, saves, sendConfig],
  );

  /** Simpan semua yang belum tersimpan ("Coba lagi", "Selesai"): pengaturan widget yang gagal dulu. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return run(async () => {
      if (stale.current) return false;
      for (const [widgetId, c] of saves.retries()) {
        // Sudah ada simpanan lebih baru untuk widget ini di antrean: yang gagal tidak dikirim ulang.
        if (saves.unsaved(widgetId) !== c) continue;
        // Per kiriman: settled() simpanan sebelumnya mengembalikan "error" selama sisa antrean gagal.
        setSave("saving");
        saves.start(widgetId, c);
        if (!(await sendConfig(widgetId, c))) {
          // Ditolak permanen dengan tata letak belum terkirim: settled() tidak mengubah status saat dirty.
          if (!stale.current && dirty.current) setSave("error");
          return false;
        }
      }
      return saveNow();
    });
  }, [run, saves, sendConfig, saveNow]);

  const undoLast = useCallback(async () => {
    const u = undo;
    if (!u || stale.current) return;
    setUndo(null);
    if (u.kind === "layout") commitLayout(u.layout, false);
    else if (u.kind === "add") await removeWidget(u.widgetId, false);
    else {
      const { i: _i, ...at } = u.item;
      await addWidget({ title: u.title, at, type: u.type, spec: u.spec });
    }
  }, [undo, commitLayout, removeWidget, addWidget]);

  // Perubahan yang belum tersimpan: peringatkan sebelum meninggalkan halaman.
  useEffect(() => {
    if (save !== "pending" && save !== "saving" && save !== "error") return;
    // Navigasi unduhan ekspor (302 lintas origin → attachment) tidak meninggalkan halaman.
    const warn = (e: BeforeUnloadEvent) => {
      if (!takeDownloadNavigation()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // Perubahan yang belum terkirim saat meninggalkan editor: tab ditutup → kirim sekarang dengan
  // keepalive (tidak bisa menunggu); pindah halaman di dalam aplikasi → kirim setelah antrean selesai
  // agar memakai revisi terbaru. Kembali dari back/forward cache: revisi di memori bisa sudah usang
  // (keepalive tadi menaikkannya) → muat ulang daripada menampilkan STALE palsu. Kiriman saat dilepas
  // dicatat (trackWrite): refresh setelah Back menunggunya (R6-CL-1).
  useEffect(() => {
    const send = () => {
      clearTimeout(timer.current);
      if (!dirty.current || stale.current) return;
      dirty.current = false;
      return api.saveLayout(id, revision.current, latest.current, { keepalive: true });
    };
    const hide = () => void send();
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restored);
    const pending = queue;
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restored);
      clearTimeout(timer.current);
      trackWrite(pending.current.then(send));
    };
  }, [id]);

  return {
    widgets,
    layout,
    save,
    notice,
    canUndo: undo !== null && !isFrozen(save),
    undoKind: undo?.kind ?? null,
    commitLayout,
    addWidget,
    removeWidget,
    renameWidget,
    configureWidget,
    /** Spec widget yang sedang dikirim atau gagal: panel yang dibuka ulang mulai dari sini. */
    unsavedConfig: saves.unsaved,
    configError: (widgetId: string) => configErrors[widgetId],
    undo: undoLast,
    flush,
    dismissNotice: () => setNotice(null),
  };
}
