"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import { FormAlert } from "@/components/auth/form-alert";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { AccessRefreshProvider } from "@/components/widgets/access-refresh";
import type { SourceSheet, WidgetView } from "@/features/dashboards/service";
import { GRID_COLS, minSizeOf, type LayoutItem } from "@/features/dashboards/validation";
import type { DashboardAccessRole } from "@/features/sharing/types";
import { CanvasEmpty } from "./canvas-empty";
import { CanvasToolbar, UNDO_ATTR } from "./canvas-toolbar";
import { withUnsaved } from "./config-saves";
import { FilterBar } from "./filters/filter-bar";
import { DashboardFiltersProvider } from "./filters/filter-context";
import { crossColumnsOf, type FilterColumnView } from "./filters/filter-model";
import {
  applyStep,
  phoneCardStyle,
  readingOrder,
  stepAvailability,
  TABLET_COLS,
  tabletLayout,
} from "./layout-ops";
import {
  isFrozen,
  useDashboardEditor,
  useFreshAfterHistory,
  viewCanvasKey,
} from "./use-dashboard-editor";
import { useGridWidth } from "./use-grid-width";
import { useIsCoarsePointer, useIsPhone, useIsTablet, useIsWide } from "./use-media-query";
import { DRAG_HANDLE, GRIP_HANDLE, SETTINGS_ATTR, WidgetCard } from "./widget-card";
import { WidgetPanel } from "./widget-panel";
import { WidgetPanelFrame } from "./widget-panel-frame";
import { WidgetSourceSection } from "./widget-source";
import type { SavedPivotOption } from "./bound-config-model";

/*
 * Kanvas dashboard (T-010). ≥ 1024 px: grid 12 kolom (react-grid-layout) — mode edit menyeret lewat
 * kepala kartu dan mengubah ukuran di pojok; mode lihat tanpa pegangan apa pun. 768–1023 px: grid
 * tampilan 6 kolom turunan (tabletLayout, T-031) tanpa menyeret, tidak disimpan. < 768 px: satu kolom
 * urut baca, tanpa menyeret (posisi/ukuran lewat panel pengaturan). DOM grid juga urut baca agar
 * urutan Tab = urutan tampilan. Fokus dipindah eksplisit saat panel dibuka/ditutup dan setelah hapus.
 * Bilah filter (T-012) di atas grid di kedua mode; status filter ikut saat berpindah mode (?f=).
 * Peran (T-016): viewer hanya mode lihat (server mengalihkan ?mode=edit); editor mengedit widget dan
 * tata letak tanpa tautan/pengaturan milik pemilik. Query widget 404 (akses dicabut) → halaman dimuat
 * ulang dari server sekali per keadaan halaman (AccessRefreshProvider; dipasang lagi bila props server
 * berubah, widget yang sudah dihapus di server diabaikan — review T-016 R3-CL-1, R5-CL-1).
 * Back/Forward (review T-016 R2-CL-1): props dari cache riwayat tidak pernah dipakai — kerangka sampai
 * refresh selesai (useFreshAfterHistory). Mode lihat mengisi ulang widget/tata letak dari props server
 * baru TANPA dipasang ulang (R5-CL-2): bilah filter, popover slicer yang terbuka, dan fokus tetap.
 * Kerangka itu setinggi kanvas terakhir dashboard ini (R4-CL-2) agar posisi gulir yang dipulihkan
 * browser tidak terpotong ke atas.
 */
const ROW_HEIGHT = 56;
const MARGIN: [number, number] = [16, 16];
const plain = (l: Layout): LayoutItem[] => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
const settingsOf = (id: string) => `[data-widget-id="${id}"] [${SETTINGS_ATTR}]`;
const STALE_RELOAD = "data-stale-reload";

/**
 * Tinggi kanvas terakhir per dashboard + mode, di modul (riwayat Back/Forward berada di dokumen yang
 * sama). Kuncinya dari props, bukan location.href: saat kanvas lama dilepas, Next sudah menulis URL
 * halaman tujuan (pushState di insertion effect), dan ?f= berubah lewat replaceState tanpa mengubah
 * tinggi grid. 0 (sudah tidak tampil) tidak menimpa (review T-016 R4-CL-2).
 */
const lastHeight = new Map<string, number>();
export const canvasHeightKey = (dashboardId: string, editing: boolean) =>
  `${dashboardId}:${editing ? "edit" : "view"}`;
export function rememberCanvasHeight(key: string, px: number) {
  if (px > 0) lastHeight.set(key, px);
}
export const lastCanvasHeight = (key: string) => lastHeight.get(key);

/**
 * Dialog lain yang terbuka: "Bagikan" beserta konfirmasinya, hapus dashboard, popover filter. Radix
 * membongkar dialog yang tertutup, jadi cukup cek keberadaannya (daftar Select yang terbuka di dalamnya
 * berada di luar DOM dialog, jadi target saja tidak cukup). Lembar pengaturan widget kanvas sendiri
 * (< 1280 px) bukan dialog lain.
 */
export const OTHER_MODAL =
  '[role="dialog"]:not([data-testid="widget-panel"]), [role="alertdialog"]';

/**
 * Ctrl/Cmd+Z milik kanvas: bukan di kolom isian, belum ditangani pihak lain (defaultPrevented), dan
 * tidak ada dialog lain yang terbuka — urungkan di belakang dialog bisa menghapus widget yang baru
 * ditambahkan tanpa terlihat (review T-016 R4-CL-1). Murni.
 */
export function isCanvasUndo(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "defaultPrevented" | "target">,
  doc: Pick<Document, "querySelector">,
): boolean {
  if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return false;
  const typing = (e.target as Element | null)?.closest?.("input, textarea, [contenteditable]");
  return !typing && !doc.querySelector(OTHER_MODAL);
}

/**
 * Simpan semua sebelum meninggalkan mode edit ("Selesai"): panel pengaturan yang terbuka ditutup
 * SINKRON lebih dulu — saat dilepas, panel mengirim simpanannya yang masih menunggu jeda ke antrean
 * editor — lalu flush() menunggu antrean itu. Tanpa ini props mode lihat dibaca sebelum PATCH-nya
 * terkirim: kartu sendiri tampil "Widget ini sudah diubah" atau dengan pengaturan lama sampai dimuat
 * ulang (review T-016 R6-CL-1).
 */
export function saveBeforeLeave(closePanel: (() => void) | null, flush: () => Promise<boolean>) {
  if (closePanel) flushSync(closePanel);
  return flush();
}

type CanvasProps = {
  dashboardId: string;
  role: DashboardAccessRole;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
  editing: boolean;
  datasetId: string;
  /** Sheet + kolom untuk panel konfigurasi (hanya mode edit). */
  sources: SourceSheet[];
  /** Pivot tersimpan dataset untuk "Sumber data" panel (mode edit pemilik/editor, T-074). */
  savedPivots?: SavedPivotOption[];
  /** Filter dashboard (T-012): kolom filter dan kolom filter silang (server); status dari ?f=. */
  filterColumns: FilterColumnView[];
  crossFilterColumns: string[];
};

export function DashboardCanvas(props: CanvasProps) {
  const ready = useFreshAfterHistory();
  if (!ready) {
    return (
      <div
        className="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
        style={{ minHeight: lastCanvasHeight(canvasHeightKey(props.dashboardId, props.editing)) }}
        aria-busy="true"
        data-testid="canvas-refreshing"
      >
        <span className="sr-only">Memuat versi terbaru dashboard…</span>
      </div>
    );
  }
  // Satu pemasangan per mode: props server baru di mode lihat diisi ulang oleh useDashboardEditor.
  return <Canvas key={props.editing ? "edit" : "view"} {...props} />;
}

function Canvas(props: CanvasProps) {
  const { dashboardId, editing } = props;
  const isOwner = props.role === "OWNER";
  const ed = useDashboardEditor(props);
  const frozen = isFrozen(ed.save);
  const router = useRouter();
  const phone = useIsPhone();
  const tablet = useIsTablet();
  const wide = useIsWide();
  const coarse = useIsCoarsePointer();
  const { width, ref: gridRef, containerRef } = useGridWidth();
  const root = useRef<HTMLDivElement>(null);
  // Penanda hidrasi (T-z8y2): kanvas dirender server, jadi tombol kartu sudah terlihat sebelum handler
  // React terpasang; klik di jendela itu hilang. Uji (dan alat bantu) menunggu atribut ini.
  useEffect(() => {
    root.current?.setAttribute("data-hydrated", "");
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Pivot tersimpan yang bisa dipilih panel; "Simpan sebagai pivot tersimpan" menambahkannya di sini.
  const [savedPivots, setSavedPivots] = useState(props.savedPivots ?? []);
  /** Selektor yang difokus setelah commit berikutnya (elemen pertama yang ada menang). */
  const focusTo = useRef<string[] | null>(null);
  /** Widget yang digulir ke dalam pandangan setelah commit berikutnya (panel dibuka / digeser). */
  const reveal = useRef<string | null>(null);
  const canEdit = editing && !frozen;
  const byId = new Map(ed.widgets.map((w) => [w.id, w]));
  // 768–1023 px: posisi tampilan turunan (sudah dipadatkan) untuk grid, gulir, dan urutan DOM/Tab.
  const shown = tablet ? tabletLayout(ed.layout) : null;
  const saved = new Map(ed.layout.map((it) => [it.i, it]));
  // DOM urut tampilan; data-pos tetap satuan 12 kolom tersimpan.
  const ordered = shown ? shown.map((it) => saved.get(it.i)!) : readingOrder(ed.layout);
  const panelItem = canEdit && selected ? ed.layout.find((it) => it.i === selected) : undefined;
  const panelWidget = panelItem ? byId.get(panelItem.i) : undefined;
  /** Ukuran terkecil per jenis widget (tabel 3×4) untuk pojok resize dan tombol panel. */
  const minOf = (id: string) => minSizeOf(byId.get(id)?.type);

  /**
   * Gulir agar widget yang diatur terlihat. Ponsel (tumpukan biasa): langsung lewat DOM. Grid: posisi
   * DOM masih beranimasi (transform 200 ms) saat effect berjalan, jadi tujuan dihitung dari satuan
   * grid. Lembar (< 1280 px) menutup bagian bawah layar → widget ditaruh tepat di bawah topbar; panel
   * menempel → gulir hanya bila widget di luar layar.
   */
  function revealWidget(id: string) {
    const card = root.current?.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
    const item = (shown ?? ed.layout).find((it) => it.i === id);
    const grid = containerRef.current;
    if (!card || !item) return;
    if (phone || !grid) return card.scrollIntoView({ block: "start" });
    const gap = parseFloat(getComputedStyle(card).scrollMarginTop) || 0; // topbar + 0.5rem (sama dengan scroll-padding-top global)
    const top =
      grid.getBoundingClientRect().top + window.scrollY + item.y * (ROW_HEIGHT + MARGIN[1]);
    const height = item.h * ROW_HEIGHT + (item.h - 1) * MARGIN[1];
    const viewTop = window.scrollY + gap;
    const viewBottom = window.scrollY + window.innerHeight - MARGIN[1];
    if (!wide || top < viewTop || height > viewBottom - viewTop) {
      window.scrollTo({ top: top - gap });
    } else if (top + height > viewBottom) {
      window.scrollTo({ top: top + height - window.innerHeight + MARGIN[1] });
    }
  }

  // Tanpa deps: berjalan setelah tiap commit; permintaan fokus/gulir selalu menyertai perubahan state.
  useEffect(() => {
    const id = reveal.current;
    reveal.current = null;
    // Dua frame: widget baru dan tinggi kontainer grid baru ada setelah react-grid-layout menyinkronkan
    // anaknya (effect-nya sendiri); tujuan gulir tetap dari satuan grid, bukan posisi DOM yang beranimasi.
    if (id) requestAnimationFrame(() => requestAnimationFrame(() => revealWidget(id)));
    const wanted = focusTo.current;
    if (!wanted) return;
    focusTo.current = null;
    for (const s of wanted) {
      const el = root.current?.querySelector<HTMLElement>(s);
      if (el) return el.focus();
    }
  });

  // STALE / akses berubah saat panel terbuka: panel hilang dan fokus jatuh ke <body> → "Muat ulang".
  useEffect(() => {
    if (!frozen) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      root.current?.querySelector<HTMLElement>(`[${STALE_RELOAD}]`)?.focus();
    }
  }, [frozen]);

  // Tinggi terakhir untuk kerangka Back/Forward: dibaca saat dilepas (DOM masih terpasang).
  useLayoutEffect(() => {
    const el = root.current;
    const key = canvasHeightKey(dashboardId, editing);
    return () => {
      if (el) rememberCanvasHeight(key, el.offsetHeight);
    };
  }, [dashboardId, editing]);

  // Ctrl/Cmd+Z = urungkan (di luar kolom isian dan dialog lain).
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!ed.canUndo || !isCanvasUndo(e, document)) return;
      e.preventDefault();
      void ed.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, ed]);

  function closePanel() {
    if (selected) focusTo.current = [settingsOf(selected)];
    setSelected(null);
  }
  async function add() {
    setAdding(true);
    const id = await ed.addWidget();
    setAdding(false);
    if (id) {
      reveal.current = id;
      setSelected(id);
      setAnnounce("Widget kosong ditambahkan di bagian bawah.");
    }
  }
  async function remove(id: string) {
    if (!(await ed.removeWidget(id))) return;
    if (selected === id) setSelected(null);
    setAnnounce("Widget dihapus. Gunakan Urungkan untuk mengembalikannya.");
    focusTo.current = [`[${UNDO_ATTR}]`];
  }
  async function done() {
    setFinishing(true);
    // STALE / akses berubah: perubahan lokal memang tidak bisa disimpan; mode lihat menampilkan versi
    // terbaru (atau 404 bila aksesnya dicabut).
    const close = selected ? () => setSelected(null) : null;
    if (!frozen && !(await saveBeforeLeave(close, ed.flush))) return setFinishing(false);
    // Filter yang sedang aktif ikut ke mode lihat.
    const f = new URL(window.location.href).searchParams.get("f");
    router.push(`/dashboards/${dashboardId}${f ? `?f=${encodeURIComponent(f)}` : ""}`);
  }
  const reload = () => window.location.reload();

  const card = (w: WidgetView, it: LayoutItem, extra?: { style?: React.CSSProperties }) => (
    <WidgetCard
      key={w.id}
      widget={w}
      editing={canEdit}
      draggable={!phone && !tablet}
      fixedHeight={!phone}
      selected={canEdit && selected === w.id}
      dataDatasetId={props.role === "VIEWER" ? null : props.datasetId}
      onSettings={() => {
        if (selected !== w.id) reveal.current = w.id;
        setSelected(selected === w.id ? null : w.id);
      }}
      data-pos={`${it.x},${it.y},${it.w},${it.h}`}
      {...extra}
    />
  );

  // Mode edit: kolom filter silang dari spec terbaru di kanvas (sakelar/kolom kategori yang baru
  // disimpan langsung berlaku); mode lihat: dari server.
  const crossColumns = editing
    ? crossColumnsOf(ed.widgets, props.sources)
    : props.crossFilterColumns;

  return (
    // Props server (bukan ed.widgets): refresh yang membawa props lain memasang penjaga lagi.
    <AccessRefreshProvider
      serverWidgetIds={props.widgets.map((w) => w.id)}
      stateKey={viewCanvasKey(props.widgets, props.revision)}
    >
      <DashboardFiltersProvider
        dashboardId={dashboardId}
        columns={props.filterColumns}
        crossColumns={crossColumns}
        widgets={ed.widgets}
      >
        <div
          ref={root}
          data-testid="dashboard-canvas"
          // Lembar pengaturan terbuka: ruang di bawah agar widget paling bawah pun bisa digulir ke atasnya.
          className={`flex flex-col gap-4 ${panelItem && !wide ? "pb-[55dvh]" : ""}`}
        >
          {editing ? (
            <CanvasToolbar
              save={ed.save}
              undoKind={ed.canUndo ? ed.undoKind : null}
              adding={adding}
              finishing={finishing}
              onAdd={() => void add()}
              onUndo={() => void ed.undo()}
              onRetry={() => void ed.flush()}
              onDone={() => void done()}
            />
          ) : null}
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          {ed.notice ? (
            <FormAlert tone="error">
              <span className="block">{ed.notice}</span>
              {frozen ? (
                <Button
                  className="mt-2 h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
                  leadingIcon={<IconRefresh aria-hidden />}
                  onClick={reload}
                  {...{ [STALE_RELOAD]: "" }}
                >
                  Muat ulang
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="mt-2" onClick={ed.dismissNotice}>
                  Tutup
                </Button>
              )}
            </FormAlert>
          ) : null}

          {ed.widgets.length ? <FilterBar editing={editing} columnSettings={isOwner} /> : null}

          {ed.widgets.length === 0 ? (
            <CanvasEmpty
              dashboardId={dashboardId}
              editing={editing}
              canEdit={props.role !== "VIEWER"}
            />
          ) : (
            <div className="flex items-start gap-4">
              <div
                ref={gridRef}
                className="min-w-0 flex-1"
                data-testid="canvas"
                data-layout={phone ? "stack" : tablet ? "tablet" : "grid"}
              >
                {phone ? (
                  <div className="flex flex-col gap-4">
                    {ordered.map((it) => {
                      const w = byId.get(it.i);
                      return w ? card(w, it, { style: phoneCardStyle(w.type) }) : null;
                    })}
                  </div>
                ) : (
                  <ReactGridLayout
                    // Dipasang ulang saat melintasi 1023/1024 px: seret/ubah ukuran yang sedang berjalan
                    // batal, tidak pernah menyimpan posisi 6 kolom (review T-031 N1).
                    key={tablet ? "tablet" : "grid"}
                    layout={
                      shown
                        ? shown
                        : ed.layout.map((it) => {
                            const min = minOf(it.i);
                            return { ...it, minW: min.w, minH: min.h };
                          })
                    }
                    width={width}
                    gridConfig={{
                      cols: tablet ? TABLET_COLS : GRID_COLS,
                      rowHeight: ROW_HEIGHT,
                      margin: MARGIN,
                      containerPadding: [0, 0],
                    }}
                    dragConfig={{
                      enabled: canEdit && !tablet,
                      // Sentuh: hanya ikon pegangan, agar geser jari di kepala kartu tetap menggulir halaman.
                      handle: `.${coarse ? GRIP_HANDLE : DRAG_HANDLE}`,
                      cancel: "button",
                    }}
                    resizeConfig={{ enabled: canEdit && !tablet, handles: ["se"] }}
                    onDragStop={(l) => !tablet && ed.commitLayout(plain(l))}
                    onResizeStop={(l) => !tablet && ed.commitLayout(plain(l))}
                  >
                    {ordered.map((it) => {
                      const w = byId.get(it.i);
                      return w ? card(w, it) : <div key={it.i} />;
                    })}
                  </ReactGridLayout>
                )}
              </div>
              {panelItem && panelWidget ? (
                <WidgetPanelFrame key={panelItem.i} docked={wide} onClose={closePanel}>
                  <WidgetPanel
                    widget={panelWidget}
                    item={panelItem}
                    can={stepAvailability(ed.layout, panelItem.i, minOf(panelItem.i))}
                    onRename={(t) => ed.renameWidget(panelItem.i, t)}
                    onStep={(k) => {
                      reveal.current = panelItem.i;
                      ed.commitLayout(applyStep(ed.layout, panelItem.i, k, minOf(panelItem.i)));
                    }}
                    onDelete={() => void remove(panelItem.i)}
                  >
                    <WidgetSourceSection
                      dashboardId={dashboardId}
                      // Dibuka ulang saat simpanan masih berjalan atau gagal: mulai dari perubahan itu,
                      // bukan spec lama kartu (suntingan berikutnya tidak membatalkannya).
                      widget={withUnsaved(panelWidget, ed.unsavedConfig(panelItem.i))}
                      saveError={ed.configError(panelItem.i)}
                      sources={props.sources}
                      datasetId={props.datasetId}
                      isOwner={isOwner}
                      savedPivots={savedPivots}
                      onSave={(type, spec, savedPivotId) =>
                        ed.configureWidget(panelItem.i, type, spec, savedPivotId)
                      }
                      onDetach={() => ed.detachWidget(panelItem.i)}
                      onCreated={(p) =>
                        setSavedPivots((list) =>
                          [...list.filter((x) => x.id !== p.id), p].sort((a, b) =>
                            a.name.localeCompare(b.name, "id"),
                          ),
                        )
                      }
                    />
                  </WidgetPanel>
                </WidgetPanelFrame>
              ) : null}
            </div>
          )}
        </div>
      </DashboardFiltersProvider>
    </AccessRefreshProvider>
  );
}
