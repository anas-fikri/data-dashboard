/*
 * Lencana kategori di kepala kartu grafik (T-032, T-2nkx, T-7ke3): dipilih dari ruang yang benar-benar
 * tersisa — bukan ambang lebar kartu tetap — sehingga judul selalu ≥ 4rem untuk lebar tombol kepala apa
 * pun (32 px pointer halus, 44 px sentuh) dan panjang teks lencana apa pun ("2 dari 12" sampai
 * "9.999 dari 9.999" / "1.000 teratas").
 */

/** Judul kartu tidak boleh lebih sempit dari ini demi lencana (review desain T-032 r3). */
export const TITLE_MIN_PX = 64;

export type BadgeMode = "full" | "compact" | "none";

/**
 * Lencana yang muat: `room` = ruang judul + lencana (lebar isi kepala dikurangi elemen lain dan jaraknya);
 * setelah lencana dan satu jarak, judul masih ≥ TITLE_MIN_PX. Penuh didahulukan, lalu ringkas. Lebar
 * pecahan dibulatkan ke arah aman (ruang ke bawah, lencana ke atas) agar judul tidak berakhir 63,6 px.
 */
export function badgeMode(m: {
  room: number;
  full: number;
  compact: number;
  gap: number;
}): BadgeMode {
  const left = (badge: number) => Math.floor(m.room) - Math.ceil(badge) - m.gap;
  if (m.full > 0 && left(m.full) >= TITLE_MIN_PX) return "full";
  if (m.compact > 0 && left(m.compact) >= TITLE_MIN_PX) return "compact";
  return "none";
}

/**
 * Ruang judul + lencana di kepala kartu (px): lebar isi dikurangi elemen lain dan jarak antar-elemen.
 * Judul ditandai data-head-title, lencana data-badge (keduanya tidak dihitung); elemen fleksibel
 * (mis. "Memperbarui…" basis 0) dihitung lebar minimumnya; tersembunyi/absolut tidak dihitung. Semua
 * lebar pecahan (getBoundingClientRect), bukan clientWidth/offsetWidth yang dibulatkan.
 */
export function headRoom(head: HTMLElement): { room: number; gap: number } {
  const cs = getComputedStyle(head);
  const gap = parseFloat(cs.columnGap) || 0;
  let room =
    head.getBoundingClientRect().width -
    ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"].reduce(
      (sum, k) => sum + (parseFloat(cs[k as "paddingLeft"]) || 0),
      0,
    );
  for (const el of Array.from(head.children) as HTMLElement[]) {
    if ("headTitle" in el.dataset || "badge" in el.dataset) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.position === "absolute" || s.position === "fixed") continue;
    room -=
      (parseFloat(s.flexGrow) > 0
        ? parseFloat(s.minWidth) || 0
        : el.getBoundingClientRect().width) + gap;
  }
  return { room, gap };
}
