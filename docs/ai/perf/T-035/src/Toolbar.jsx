/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
import { useState } from "react";
import { IconArrowBarToDown } from "@tabler/icons-react";
import { ROWS, formatInt } from "./data.js";

/** "Ke baris N" (1-based, sama dengan nomor baris tampilan). */
export function GoToRow({ onGo }) {
  const [v, setV] = useState("9999999");
  const submit = (e) => {
    e.preventDefault();
    const n = Number(String(v).replace(/\D/g, ""));
    if (n >= 1 && n <= ROWS) onGo(n);
  };
  return (
    <form className="toolbar" onSubmit={submit} aria-label="Navigasi">
      <label htmlFor="goto">Ke baris</label>
      <input
        id="goto"
        data-testid="goto-input"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <button type="submit" data-testid="goto-btn">
        <IconArrowBarToDown size={20} stroke={1.5} />
        Ke baris
      </button>
      <span aria-live="polite" className="sr-only" id="live" />
    </form>
  );
}

export function StatusBar({ first, last }) {
  return (
    <div className="status" data-testid="status">
      {first == null
        ? `${formatInt(ROWS)} baris`
        : `Baris ${formatInt(first)}–${formatInt(last)} dari ${formatInt(ROWS)}`}
    </div>
  );
}

export function announce(text) {
  const el = document.getElementById("live");
  if (el) el.textContent = text;
}
