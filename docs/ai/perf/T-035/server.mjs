// Server statis kecil dengan header keamanan T-027 (salinan logika src/lib/security-headers.ts).
// Pakai: node server.mjs [port] [dir] [--no-csp]
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";

const port = Number(process.argv[2] || 4173);
const root = process.argv[3] || "dist";
const noCsp = process.argv.includes("--no-csp");
// --https: sertifikat self-signed (certs/). WebKit menerapkan upgrade-insecure-requests juga ke
// http://127.0.0.1 sehingga CSP produksi hanya bisa diuji utuh lewat https.
const useTls = process.argv.includes("--https");
// --strict-style: style-src tanpa 'unsafe-inline' (nonce saja) untuk melihat ketergantungan gaya inline.
const strictStyle = process.argv.includes("--strict-style");

// === salinan buildCsp() (src/lib/security-headers.ts), dev=false, tanpa storageUrl ===
function buildCsp({ nonce, dev = false, upgradeInsecure = !dev, formAction = "'self'" }) {
  const extra = "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    `media-src 'self' blob:${extra}`,
    `connect-src 'self'${extra}${dev ? " ws: wss:" : ""}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formAction}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (upgradeInsecure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
const staticHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const handler = async (req, res) => {
    const url = new URL(req.url, "http://x");
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path === "/" || !extname(path)) path = "/index.html";
    try {
      let body = await readFile(join(root, path));
      const headers = { ...staticHeaders, "Content-Type": TYPES[extname(path)] || "application/octet-stream" };
      if (path === "/index.html") {
        const nonce = randomBytes(16).toString("base64");
        body = Buffer.from(body.toString("utf8").replaceAll("__CSP_NONCE__", nonce));
        let csp = buildCsp({ nonce });
        if (strictStyle) csp = csp.replace("style-src 'self' 'unsafe-inline'", `style-src 'self' 'nonce-${nonce}'`);
        if (!noCsp) headers["Content-Security-Policy"] = csp;
        headers["Cache-Control"] = "no-store";
      } else {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404, staticHeaders);
      res.end("not found");
    }
};

const server = useTls
  ? https.createServer({ key: readFileSync("certs/key.pem"), cert: readFileSync("certs/cert.pem") }, handler)
  : http.createServer(handler);
server.listen(port, "127.0.0.1", () =>
  console.log(`serving ${root} on ${useTls ? "https" : "http"}://127.0.0.1:${port}${noCsp ? " (no CSP)" : ""}`),
);
