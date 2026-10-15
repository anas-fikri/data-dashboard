import { describe, expect, it, vi } from "vitest";
import {
  forRole,
  resolveWidget,
  runWidgetQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { buildSql, buildTotalsSql } from "@/features/query/sql";
import { buildTableCount, buildTablePage } from "@/features/query/table";
import {
  OWNER as X_OWNER,
  VIEWER as X_VIEWER,
  WID as XWID,
  fakeQueryRepo,
} from "../exports/fixtures";
import { EDITOR, OWNER, VIEWER, WID, makeDeps } from "./sharing-fixtures";

/*
 * T-017: resolveWidget (diekstrak dari widgetResult) dipakai bersama /api/query mode widget dan job
 * ekspor. Paritas: SQL yang dijalankan /api/query = SQL yang dibangun dari rencana resolver; kegagalan
 * (setelah forRole) sama persis dengan jawaban /api/query.
 */

const PATH = "/tmp/t017-parity.parquet";
const NOW = new Date("2026-03-15T05:00:00.000Z");

function deps(repo: QueryRepo) {
  const exec = vi.fn(
    async (_sql: string, _params: Record<string, string | number | boolean>, _ms: number) => ({
      columns: ["n"],
      rows: [[150]] as unknown[][],
    }),
  );
  const d: QueryDeps = {
    repo,
    parquet: { acquire: async () => ({ path: PATH, release: () => {} }) },
    engine: { withSlot: (_u, fn) => fn(), exec },
    cache: null,
    timeoutMs: 5_000,
    now: () => NOW,
  };
  return { d, exec };
}

const CASES: [string, Record<string, unknown>][] = [
  ["table", {}],
  ["table", { page: 1, sort: { column: 2, dir: "desc" } }],
  [
    "table",
    {
      dashboardFilters: [
        { column: "Cabang", op: "in", values: ["Cabang 1", null] },
        { column: "Tanggal", op: "preset", preset: "this_month" },
      ],
      sort: { column: 1, dir: "asc" },
    },
  ],
  ["kpi", { dashboardFilters: [{ column: "Tanggal", op: "range", gte: "2026-02-01" }] }],
  ["bar", { dashboardFilters: [{ column: "Cabang", op: "not_in", values: ["Cabang 0"] }] }],
];

describe("resolveWidget = rencana yang dijalankan /api/query", () => {
  it.each(CASES)("%s %j: SQL + parameter identik", async (name, extra) => {
    const repo = fakeQueryRepo();
    const { d, exec } = deps(repo);
    const body = { widgetId: XWID(name), ...extra };
    const r = await runWidgetQuery(X_OWNER, body, d);
    expect(r.ok).toBe(true);
    const ran = exec.mock.calls.map((c) => ({ sql: c[0], params: c[1] }));

    const w = (await repo.widget(X_OWNER, XWID(name)))!;
    const resolved = await resolveWidget(
      w,
      { page: 0, ...extra } as Parameters<typeof resolveWidget>[1],
      { repo, now: () => NOW },
    );
    if (!resolved.ok) throw new Error(resolved.message);
    const plan = { ...resolved.planned.plan, dash: resolved.dash.clauses };
    const expected =
      resolved.planned.kind === "agg"
        ? [buildSql(plan, PATH), ...(plan.totals ? [buildTotalsSql(plan, PATH)!] : [])]
        : [
            buildTableCount(plan, PATH),
            buildTablePage(plan, resolved.planned.sort, resolved.planned.page, PATH),
          ];
    expect(ran).toEqual(expected);
  });

  it("kegagalan identik setelah forRole (D6, kolom tersembunyi, sheet/kolom hilang, remap)", async () => {
    const shared = makeDeps();
    const typed = fakeQueryRepo();
    const cases: [QueryRepo, string, string, Record<string, unknown>][] = [
      [
        typed,
        X_VIEWER,
        XWID("table"),
        { dashboardFilters: [{ column: "Omzet", op: "range", gte: 1 }] },
      ],
      [typed, X_VIEWER, XWID("hidden"), {}],
      [typed, X_OWNER, XWID("hidden"), {}],
      [typed, X_OWNER, XWID("table"), { sort: { column: 8, dir: "asc" } }],
      [shared.repo, VIEWER, WID("gone"), {}],
      [shared.repo, EDITOR, WID("marked"), {}],
      [shared.repo, OWNER, WID("retired"), {}],
      [shared.repo, VIEWER, WID("retired"), {}],
      [shared.repo, OWNER, WID("remapped"), {}],
      [shared.repo, VIEWER, WID("remapped"), {}],
    ];
    for (const [repo, user, widgetId, extra] of cases) {
      const { d, exec } = deps(repo);
      const r = await runWidgetQuery(user, { widgetId, ...extra }, d);
      expect(r.ok).toBe(false);
      expect(exec).not.toHaveBeenCalled();
      const w = (await repo.widget(user, widgetId))!;
      const resolved = await resolveWidget(
        w,
        { page: 0, ...extra } as Parameters<typeof resolveWidget>[1],
        { repo, now: () => NOW },
      );
      expect(resolved.ok).toBe(false);
      const { widgetVersion: _v, ...rest } = r as typeof r & { widgetVersion?: string };
      expect(forRole(w.role, resolved as Exclude<typeof resolved, { ok: true }>)).toEqual(rest);
    }
  });
});
