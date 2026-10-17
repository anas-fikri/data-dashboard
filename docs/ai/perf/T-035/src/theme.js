/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
// Membaca token HSL ("221 83% 53%") dari :root/.dark dan mengubahnya ke hex untuk kanvas (Glide).
export function hslToHex(channels) {
  const m = channels.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return "#000000";
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function token(name) {
  return hslToHex(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`));
}

export function isDark() {
  return document.documentElement.classList.contains("dark");
}
