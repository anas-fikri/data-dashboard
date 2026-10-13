"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { FormAlert } from "@/components/auth/form-alert";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { SourceSheet, WidgetView } from "@/features/dashboards/service";
import { GRID_COLS, minSizeOf, type LayoutItem } from "@/features/dashboards/validation";
import { CanvasEmpty } from "./canvas-empty";
import { CanvasToolbar, UNDO_ATTR } from "./canvas-toolbar";
import { applyStep, readingOrder, stepAvailability } from "./layout-ops";
import { useDashboardEditor } from "./use-dashboard-editor";
import { useIsCoarsePointer, useIsPhone, useIsWide } from "./use-media-query";
import { DRAG_HANDLE, GRIP_HANDLE, SETTINGS_ATTR, WidgetCard } from "./widget-card";
import { WidgetConfigForm } from "./widget-config";
import { WidgetPanel } from "./widget-panel";
import { WidgetPanelFrame } from "./widget-panel-frame";

/*
 * Kanvas dashboard (T-010). ≥ 768 px: grid 12 kolom (react-grid-layout) — mode edit menyeret lewat
 * kepala kartu dan mengubah ukuran di pojok; mode lihat tanpa pegangan apa pun. < 768 px: satu kolom
 * urut baca, tanpa menyeret (posisi/ukuran lewat panel pengaturan). DOM grid juga urut baca agar
 * urutan Tab = urutan tampilan. Fokus dipindah eksplisit saat panel dibuka/ditutup dan setelah hapus.
 */
const ROW_HEIGHT = 56;
const MARGIN: [number, number] = [16, 16];
const plain = (l: Layout): LayoutItem[] => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
/** Tinggi kartu di tumpukan ponsel per jenis widget (px). */
const PHONE_HEIGHT: Record<string, number> = {
  table: 440,
  bar: 320,
  line: 280,
  pie: 320,
  kpi: 150,
};
const settingsOf = (id: string) => `[data-widget-id="${id}"] [${SETTINGS_ATTR}]`;
const STALE_RELOAD = "data-stale-reload";

export function DashboardCanvas(props: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
  editing: boolean;
  datasetId: string;
  /** Sheet + kolom untuk panel konfigurasi (hanya mode edit). */
  sources: SourceSheet[];
}) {
  const { dashboardId, editing } = props;
  const ed = useDashboardEditor(props);
  const router = useRouter();
  const phone = useIsPhone();
  const wide = useIsWide();
  const coarse = useIsCoarsePointer();
  const { width, containerRef, mounted } = useContainerWidth();
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [announce, setAnnounce] = useState("");
  /** Selektor yang difokus setelah commit berikutnya (elemen pertama yang ada menang). */
  const focusTo = useRef<string[] | null>(null);
  /** Widget yang digulir ke dalam pandangan setelah commit berikutnya (panel dibuka / digeser). */
  const reveal = useRef<string | null>(null);
  const canEdit = editing && ed.save !== "stale";
  const byId = new Map(ed.widgets.map((w) => [w.id, w]));
  const ordered = readingOrder(ed.layout);
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
    const item = ed.layout.find((it) => it.i === id);
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

  // STALE saat panel terbuka: panel hilang dan fokus jatuh ke <body> → pindahkan ke "Muat ulang".
  useEffect(() => {
    if (ed.save !== "stale") return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      root.current?.querySelector<HTMLElement>(`[${STALE_RELOAD}]`)?.focus();
    }
  }, [ed.save]);

  // Ctrl/Cmd+Z = urungkan (di luar kolom isian).
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest(
        "input, textarea, [contenteditable]",
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing && ed.canUndo) {
        e.preventDefault();
        void ed.undo();
      }
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
    // STALE: perubahan lokal memang tidak bisa disimpan; mode lihat menampilkan versi terbaru.
    if (ed.save !== "stale" && !(await ed.flush())) return setFinishing(false);
    router.push(`/dashboards/${dashboardId}`);
  }
  const reload = () => window.location.reload();

  const card = (w: WidgetView, it: LayoutItem, extra?: { style?: React.CSSProperties }) => (
    <WidgetCard
      key={w.id}
      widget={w}
      editing={canEdit}
      draggable={!phone}
      selected={canEdit && selected === w.id}
      onSettings={() => {
        if (selected !== w.id) reveal.current = w.id;
        setSelected(selected === w.id ? null : w.id);
      }}
      data-pos={`${it.x},${it.y},${it.w},${it.h}`}
      {...extra}
    />
  );

  return (
    <div
      ref={root}
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
          {ed.save === "stale" ? (
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

      {ed.widgets.length === 0 ? (
        <CanvasEmpty dashboardId={dashboardId} editing={editing} />
      ) : (
        <div className="flex items-start gap-4">
          <div
            ref={containerRef}
            className="min-w-0 flex-1"
            data-testid="canvas"
            data-layout={phone ? "stack" : "grid"}
          >
            {phone ? (
              <div className="flex flex-col gap-4">
                {ordered.map((it) => {
                  const w = byId.get(it.i);
                  return w
                    ? // Tinggi tetap per jenis (bukan dari grid layar lebar): tabel/grafik menggulir di
                      // dalam kartu tanpa memanjangkan halaman, KPI tidak memboroskan layar (review L6).
                      card(w, it, { style: { height: PHONE_HEIGHT[w.type] ?? 160 } })
                    : null;
                })}
              </div>
            ) : mounted ? (
              <ReactGridLayout
                layout={ed.layout.map((it) => {
                  const min = minOf(it.i);
                  return { ...it, minW: min.w, minH: min.h };
                })}
                width={width}
                gridConfig={{
                  cols: GRID_COLS,
                  rowHeight: ROW_HEIGHT,
                  margin: MARGIN,
                  containerPadding: [0, 0],
                }}
                dragConfig={{
                  enabled: canEdit,
                  // Sentuh: hanya ikon pegangan, agar geser jari di kepala kartu tetap menggulir halaman.
                  handle: `.${coarse ? GRIP_HANDLE : DRAG_HANDLE}`,
                  cancel: "button",
                }}
                resizeConfig={{ enabled: canEdit, handles: ["se"] }}
                onDragStop={(l) => ed.commitLayout(plain(l))}
                onResizeStop={(l) => ed.commitLayout(plain(l))}
              >
                {ordered.map((it) => {
                  const w = byId.get(it.i);
                  return w ? card(w, it) : <div key={it.i} />;
                })}
              </ReactGridLayout>
            ) : (
              <div
                className="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                aria-hidden
              />
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
                <WidgetConfigForm
                  widget={panelWidget}
                  sources={props.sources}
                  datasetId={props.datasetId}
                  onSave={(type, spec) => ed.configureWidget(panelItem.i, type, spec)}
                />
              </WidgetPanel>
            </WidgetPanelFrame>
          ) : null}
        </div>
      )}
    </div>
  );
}
