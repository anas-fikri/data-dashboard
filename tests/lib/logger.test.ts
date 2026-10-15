import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerOptions, scrubRenderPaths, SENSITIVE_KEYS, redactPaths } from "@/lib/logger";

/*
 * T-012 (ASVS V7/V8): nilai filter dashboard, kata cari slicer, dan cross-filter tidak pernah masuk
 * log — kunci-kunci itu diredaksi pada kedalaman berapa pun sampai 4 tingkat dan di body permintaan.
 */
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const log = pino({ redact: { paths: redactPaths(), censor: "[redacted]" } }, stream);
  return { log, lines };
}

describe("redaksi logger", () => {
  it("kunci filter T-012 termasuk kunci sensitif", () => {
    for (const k of ["filters", "dashboardFilters", "values", "value", "q", "cross"]) {
      expect(SENSITIVE_KEYS).toContain(k);
    }
  });

  it("nilai filter, kata cari, dan cross-filter diredaksi; field lain tetap", () => {
    const { log, lines } = capture();
    log.info(
      {
        userId: "u1",
        dashboardFilters: [{ column: "Cabang", op: "in", values: ["Jakarta-RAHASIA"] }],
        req: { body: { q: "cari-RAHASIA", column: "Kota" } },
        state: { cross: { widgetId: "w", filter: { values: ["silang-RAHASIA"] } } },
        nested: { a: { values: ["dalam-RAHASIA"], value: "nilai-RAHASIA" } },
      },
      "uji",
    );
    const out = lines.join("");
    expect(out).not.toContain("RAHASIA");
    expect(out).toContain("[redacted]");
    expect(out).toContain('"userId":"u1"');
    expect(out).toContain('"column":"Kota"');
  });
});

/*
 * T-018 D15: path token render /render/<token> diredaksi dari NILAI string (url, path, pesan galat) dan
 * pesan log, karena redaksi pino berbasis kunci tidak menangkapnya. Kunci `token` tetap diredaksi.
 */
describe("redaksi path token render", () => {
  const TOKEN = "AbC_-123".padEnd(43, "z");

  function captureWith() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    return { log: pino({ ...loggerOptions("info") }, stream), lines };
  }

  it("scrubRenderPaths: string, objek, array sampai kedalaman 3; nilai lain utuh", () => {
    expect(scrubRenderPaths(`GET http://web:3000/render/${TOKEN}?x=1 404`)).toBe(
      "GET http://web:3000/render/[redacted]?x=1 404",
    );
    expect(scrubRenderPaths("/render")).toBe("/render");
    expect(scrubRenderPaths("/api/exports/abc")).toBe("/api/exports/abc");
    const input = { a: { b: [`/render/${TOKEN}`] }, n: 1, ok: true, d: null };
    expect(scrubRenderPaths(input)).toEqual({
      a: { b: ["/render/[redacted]"] },
      n: 1,
      ok: true,
      d: null,
    });
    // Tidak mengubah objek asli; tanpa perubahan → objek yang sama.
    expect(input.a.b[0]).toContain(TOKEN);
    const clean = { a: { b: "x" } };
    expect(scrubRenderPaths(clean)).toBe(clean);
  });

  it("log: token tidak muncul di field mana pun maupun di pesan; kunci token tetap diredaksi", () => {
    const { log, lines } = captureWith();
    log.info(
      {
        url: `/render/${TOKEN}`,
        req: { path: `http://web:3000/render/${TOKEN}`, headers: { referer: `x/render/${TOKEN}` } },
        err: `navigasi gagal: http://web:3000/render/${TOKEN}`,
        token: TOKEN,
      },
      `render gagal /render/${TOKEN}`,
    );
    log.warn(`format %s`, `/render/${TOKEN}`);
    const out = lines.join("");
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("/render/[redacted]");
    expect(out).toContain('"token":"[redacted]"');
  });
});
