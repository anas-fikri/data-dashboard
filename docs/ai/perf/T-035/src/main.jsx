/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IconMoon, IconSun } from "@tabler/icons-react";
import "./tokens.css";
import "./app.css";

// Rute lazy: kode grid tidak masuk chunk utama (rencana §3.3: rute lazy ≤ 300 KB gzip).
const AgPage = lazy(() => import("./AgPage.jsx"));
const GlidePage = lazy(() => import("./GlidePage.jsx"));

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function App() {
  const hash = useHash();
  const [dark, setDark] = useState(() => new URLSearchParams(location.search).get("theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.dispatchEvent(new Event("themechange"));
  }, [dark]);
  const route = hash.startsWith("#/ag") ? "ag" : hash.startsWith("#/glide") ? "glide" : "home";
  return (
    <div className="shell">
      <nav className="topbar" aria-label="Prototipe">
        <strong>T-035 spike grid</strong>
        <a href="#/ag" aria-current={route === "ag" ? "page" : undefined}>
          AG Grid Community
        </a>
        <a href="#/glide" aria-current={route === "glide" ? "page" : undefined}>
          Glide Data Grid
        </a>
        <button type="button" data-testid="theme" onClick={() => setDark((d) => !d)} aria-pressed={dark}>
          {dark ? <IconSun size={20} stroke={1.5} /> : <IconMoon size={20} stroke={1.5} />}
          {dark ? "Tema terang" : "Tema gelap"}
        </button>
      </nav>
      <Suspense fallback={<p className="toolbar">Memuat grid…</p>}>
        {route === "ag" && <AgPage />}
        {route === "glide" && <GlidePage />}
        {route === "home" && <p className="toolbar">Pilih kandidat di atas.</p>}
      </Suspense>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
