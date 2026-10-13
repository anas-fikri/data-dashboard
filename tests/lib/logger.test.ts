import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { SENSITIVE_KEYS, redactPaths } from "@/lib/logger";

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
