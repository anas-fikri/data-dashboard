import { describe, expect, it } from "vitest";
import {
  OTHERS_LABEL,
  barsThatFit,
  chartOption,
  isoToUtcMs,
  middleTruncate,
  percentShares,
  type ChartTheme,
} from "@/components/widgets/chart-option";
import {
  aggOptions,
  columnsForAgg,
  defaultConfig,
  missingColumns,
  sortLabel,
  type Source,
} from "@/components/dashboards/widget-config-model";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";

/*
 * T-011: pilihan awal panel konfigurasi (langsung menghasilkan widget valid) dan opsi grafik yang
 * tidak pernah menafsirkan teks data sebagai HTML.
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const S2 = "cmv4kljx40009oczvdmpurrs2";
const sources: Source[] = [
  {
    id: S1,
    name: "Penjualan",
    columns: [
      { pos: 1, name: "Cabang", type: "text" },
      { pos: 2, name: "Tanggal", type: "date" },
      { pos: 3, name: "Omzet", type: "decimal" },
      { pos: 4, name: "Lunas", type: "boolean" },
    ],
  },
  { id: S2, name: "Kurir", columns: [{ pos: 1, name: "Nama", type: "text" }] },
];
const empty: WidgetConfig = { type: "empty", spec: {} };
const valid = (c: WidgetConfig | null) => !!c && parseWidgetConfig(c.type, c.spec).ok;

describe("pilihan awal panel konfigurasi", () => {
  it("setiap jenis langsung valid: teks × total angka, garis per bulan, tabel 6 kolom pertama", () => {
    const bar = defaultConfig("bar", sources, empty);
    expect(bar).toMatchObject({
      type: "bar",
      spec: {
        sheetId: S1,
        dimension: { column: 1 },
        measure: { agg: "sum", column: 3 },
        sort: "value_desc",
        topN: 12,
      },
    });
    expect(defaultConfig("line", sources, empty)).toMatchObject({
      // Garis: bawaan N periode terbaru (ditampilkan urut waktu naik).
      spec: { dimension: { column: 2, timeGrain: "month" }, sort: "label_desc" },
    });
    expect(defaultConfig("table", sources, empty)).toMatchObject({
      spec: { columns: [1, 2, 3, 4] },
    });
    for (const t of ["kpi", "bar", "line", "pie", "table"] as const) {
      expect(valid(defaultConfig(t, sources, empty))).toBe(true);
    }
  });

  it("ganti jenis mempertahankan pilihan yang masih berlaku; ganti sheet tanpa kolom angka → jumlah baris", () => {
    const bar = defaultConfig("bar", sources, empty)!;
    const pie = defaultConfig("pie", sources, bar)!;
    expect(pie).toMatchObject({
      spec: { dimension: { column: 1 }, measure: { agg: "sum", column: 3 }, topN: 5 },
    });
    const kurir = defaultConfig("bar", sources, bar, S2)!;
    expect(kurir).toMatchObject({
      spec: { sheetId: S2, dimension: { column: 1 }, measure: { agg: "count" } },
    });
    expect(valid(kurir)).toBe(true);
    expect(defaultConfig("bar", [], empty)).toBeNull();
  });

  it("agregasi hanya menawarkan kolom yang cocok", () => {
    const cols = sources[0]!.columns;
    expect(columnsForAgg("sum", cols).map((c) => c.name)).toEqual(["Omzet"]);
    expect(columnsForAgg("max", cols).map((c) => c.name)).toEqual(["Tanggal", "Omzet"]);
    // Grafik hanya menggambar angka: min/maks tanggal tidak ditawarkan.
    expect(columnsForAgg("max", cols, "bar").map((c) => c.name)).toEqual(["Omzet"]);
    expect(columnsForAgg("count_distinct", cols)).toHaveLength(4);
  });
});

describe("opsi grafik aman dari HTML (AC 7)", () => {
  const theme: ChartTheme = {
    colors: ["hsl(221, 83%, 53%)"],
    text: "#000",
    muted: "#555",
    border: "#ddd",
    card: "#fff",
    font: "Inter",
  };
  const XSS = "<img src=x onerror=alert(1)>";
  const input = {
    labels: [XSS, "Bandung"],
    values: [10, null],
    measureLabel: `Total ${XSS}`,
    dimensionLabel: XSS,
    format: { style: "rupiah", decimals: 0 } as const,
    reducedMotion: true,
  };

  it("tooltip richText (bukan HTML) dan formatter mengembalikan teks apa adanya", () => {
    for (const type of ["bar", "line", "pie"] as const) {
      const o = chartOption({ ...input, type }, theme, { width: 600, height: 300 }) as {
        tooltip: { renderMode: string; formatter: (p: unknown) => string };
        animation: boolean;
      };
      expect(o.tooltip.renderMode).toBe("richText");
      expect(o.animation).toBe(false);
      const text =
        type === "pie"
          ? o.tooltip.formatter({ name: XSS, value: 10, percent: 100 })
          : o.tooltip.formatter([{ name: XSS, value: 10 }]);
      expect(text).toContain(XSS);
      expect(text).toContain("Rp 10");
    }
  });

  it("sintaks gaya richText ECharts ({a|b}) di nama kategori tidak ditafsirkan", () => {
    const o = chartOption({ ...input, type: "bar" }, theme, { width: 600, height: 300 }) as {
      tooltip: { formatter: (p: unknown) => string };
    };
    const text = o.tooltip.formatter([{ name: "{a|x}y", value: 1 }]);
    expect(text).not.toMatch(/\{[a-zA-Z0-9_]+\|/);
    expect(text.replace(/\u200b/g, "")).toContain("{a|x}y");
  });

  it("nilai kosong → '(kosong)'; batang horizontal dengan kategori dari atas", () => {
    const o = chartOption({ ...input, type: "bar" }, theme, { width: 600, height: 300 }) as {
      yAxis: { type: string; inverse: boolean; data: string[] };
      tooltip: { formatter: (p: unknown) => string };
    };
    expect(o.yAxis).toMatchObject({ type: "category", inverse: true, data: [XSS, "Bandung"] });
    expect(o.tooltip.formatter([{ name: "Bandung", value: null }])).toContain("(kosong)");
  });
});

describe("review desain T-011", () => {
  const theme: ChartTheme = {
    colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
    text: "#000",
    muted: "#555",
    border: "#ddd",
    card: "#fff",
    font: "Inter",
  };
  const pieInput = {
    type: "pie" as const,
    labels: ["A", "B", "C", "D", "E"],
    values: [5, 4, 3, 2, 1],
    measureLabel: "Total",
    dimensionLabel: "Kantor",
    format: { style: "auto", decimals: 0 } as const,
    reducedMotion: true,
  };

  it("H1: pai — 'Lainnya' memakai warna terakhir; hanya Total/Jumlah baris; maks. 5 irisan", () => {
    const o = chartOption({ ...pieInput, others: 85 }, theme, { width: 600, height: 300 }) as {
      series: { data: { name: string; value: number; itemStyle?: { color: string } }[] }[];
    };
    const last = o.series[0]!.data.at(-1)!;
    expect(last).toMatchObject({ name: OTHERS_LABEL, value: 85, itemStyle: { color: "c6" } });
    expect(aggOptions("pie", sources[0]!.columns)).toEqual(["sum", "count"]);
    const fromAvg = defaultConfig("pie", sources, {
      type: "bar",
      spec: {
        ...(defaultConfig("bar", sources, empty)!.spec as object),
        measure: { agg: "avg", column: 3 },
      },
    } as WidgetConfig);
    expect(fromAvg).toMatchObject({ spec: { measure: { agg: "sum", column: 3 }, topN: 5 } });
    expect(
      parseWidgetConfig("pie", {
        ...(fromAvg!.spec as object),
        measure: { agg: "avg", column: 3 },
      }),
    ).toMatchObject({ ok: false });
    expect(parseWidgetConfig("pie", { ...(fromAvg!.spec as object), topN: 6 })).toMatchObject({
      ok: false,
    });
  });

  it("H2/H3: label dipendekkan di tengah; pai sempit tanpa label luar; batang sesuai tinggi", () => {
    expect(middleTruncate("Kantor PCP Express Gambir Unit 11", 20)).toBe("Kantor P…bir Unit 11");
    expect(middleTruncate("Kantor PCP Express Gambir Unit 11", 20)).toHaveLength(20);
    expect(middleTruncate("Bandung", 20)).toBe("Bandung");
    const narrow = chartOption(pieInput, theme, { width: 240, height: 240 }) as {
      series: { label: { show: boolean } }[];
    };
    expect(narrow.series[0]!.label.show).toBe(false);
    const wide = chartOption(pieInput, theme, { width: 640, height: 320 }) as {
      series: { label: { show: boolean } }[];
    };
    // Pai tidak pernah memakai label luar (terpotong "…" di kartu sempit) — legenda HTML.
    expect(wide.series[0]!.label.show).toBe(false);
    expect(barsThatFit(272)).toBe(13);
    const bar = chartOption(
      { ...pieInput, type: "bar", format: { style: "rupiah", decimals: 0 } },
      theme,
      {
        width: 200,
        height: 300,
      },
    ) as {
      xAxis: { name: string; splitNumber: number };
      yAxis: { axisLabel: { interval: number } };
    };
    expect(bar.xAxis).toMatchObject({ name: "Rp", splitNumber: 2 });
    expect(bar.yAxis.axisLabel.interval).toBe(0);
  });

  it("M2: kolom yang tidak lagi tersedia terdeteksi; L5: label urutan sesuai jenis kolom", () => {
    const bar = defaultConfig("bar", sources, empty)!;
    expect(missingColumns(bar, sources)).toEqual([]);
    const gone = {
      ...bar,
      spec: { ...bar.spec, measure: { agg: "sum", column: 9 } },
    } as WidgetConfig;
    expect(missingColumns(gone, sources)).toEqual([9]);
    expect(sortLabel("label_asc", "date")).toBe("Terlama dulu");
    expect(sortLabel("label_desc", "text")).toBe("Z–A");
  });
});

describe("verifikasi T-011 putaran 2", () => {
  const theme: ChartTheme = {
    colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
    text: "#000",
    muted: "#555",
    border: "#ddd",
    card: "#fff",
    font: "Inter",
  };

  it("persen pai berjumlah tepat 100 (sisa terbesar)", () => {
    expect(percentShares([3, 3, 3, 3, 3, 85])).toEqual([3, 3, 3, 3, 3, 85]);
    const p = percentShares([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentShares([0, 0])).toEqual([0, 0]);
  });

  it("garis bertanggal tanpa grain: sumbu waktu UTC, titik urut naik, tanggal kosong tidak diplot", () => {
    expect(isoToUtcMs("2026-10-01")).toBe(Date.UTC(2026, 9, 1));
    const o = chartOption(
      {
        type: "line",
        labels: ["Nov 2026", "Okt 2026", "(kosong)"],
        values: [5, 3, 1],
        measureLabel: "Total",
        dimensionLabel: "Tanggal",
        format: { style: "auto", decimals: 0 },
        time: { iso: ["2026-11-01", "2026-10-01", null] },
        reducedMotion: true,
      },
      theme,
      { width: 600, height: 300 },
    ) as {
      useUTC: boolean;
      xAxis: { type: string; axisLabel: { formatter: (ms: number) => string } };
      series: { data: [number, number][] }[];
    };
    expect(o.useUTC).toBe(true);
    expect(o.xAxis.type).toBe("time");
    expect(o.series[0]!.data).toEqual([
      [Date.UTC(2026, 9, 1), 3],
      [Date.UTC(2026, 10, 1), 5],
    ]);
    expect(o.xAxis.axisLabel.formatter(Date.UTC(2026, 9, 1))).toContain("Okt 2026");
  });

  it("label tanggal/angka tidak dipendekkan; label teks dipendekkan di tengah", () => {
    const opt = (textLabels: boolean) =>
      chartOption(
        {
          type: "bar",
          labels: ["Kantor PCP Express Gambir Unit 11"],
          values: [1],
          measureLabel: "Total",
          dimensionLabel: "Kantor",
          format: { style: "auto", decimals: 0 },
          textLabels,
          reducedMotion: true,
        },
        theme,
        { width: 200, height: 300 },
      ) as { yAxis: { axisLabel: { formatter: (v: string) => string } } };
    expect(opt(false).yAxis.axisLabel.formatter("12 Okt 2026")).toBe("12 Okt 2026");
    expect(opt(true).yAxis.axisLabel.formatter("Kantor PCP Express Gambir Unit 11")).toContain("…");
  });
});

// --- verifikasi T-011 putaran 3: panel pengaturan (fokus, urutan, kolom hilang setelah data diganti)
import { vi } from "vitest";
import { deferredTask } from "@/components/dashboards/config-focus";
import {
  missingColumnText,
  missingNotice,
  sortOptions,
  withDimension,
  withoutMissingColumns,
} from "@/components/dashboards/widget-config-model";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { MISSING_COLUMN, remapConfig, type SheetInfo } from "@/features/widgets/remap";

describe("verifikasi T-011 putaran 3: panel pengaturan", () => {
  type TableConfig = Extract<WidgetConfig, { type: "table" }>;
  type ChartConfig = Extract<WidgetConfig, { type: "bar" | "line" | "pie" }>;
  const rupiah = { style: "rupiah", decimals: 0 } as const;

  it("D6: pemeriksaan Maks. saat blur ditunda ke giliran berikutnya; flush saat panel ditutup", () => {
    vi.useFakeTimers();
    try {
      const task = deferredTask();
      const first = vi.fn();
      task.schedule(first);
      expect(first).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(first).toHaveBeenCalledTimes(1);

      // Jadwal baru menggantikan yang lama.
      const a = vi.fn();
      const b = vi.fn();
      task.schedule(a);
      task.schedule(b);
      vi.runAllTimers();
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);

      // Dilepas sebelum timer berjalan: dijalankan sekarang, tidak dua kali.
      const c = vi.fn();
      task.schedule(c);
      task.flush();
      expect(c).toHaveBeenCalledTimes(1);
      vi.runAllTimers();
      task.flush();
      expect(c).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hapus kolom tabel: yang hilang dibuang; semua hilang → kolom pertama sheet", () => {
    const table: TableConfig = {
      type: "table",
      spec: { sheetId: S1, columns: [1, 9, 3], format: rupiah, formatColumns: [9, 3] },
    };
    expect(withoutMissingColumns(table, sources)).toMatchObject({
      spec: { columns: [1, 3], formatColumns: [3], format: rupiah },
    });
    const ok = defaultConfig("table", sources, empty) as TableConfig;
    expect(withoutMissingColumns(ok, sources)).toBe(ok);

    const allGone: TableConfig = {
      type: "table",
      spec: { sheetId: S1, columns: [MISSING_COLUMN], format: rupiah },
    };
    // Perubahan lain tidak mengosongkan tabel (user memilih kolomnya sendiri).
    expect(withoutMissingColumns(allGone, sources)).toBe(allGone);
    const fixed = withoutMissingColumns(allGone, sources, true);
    expect(fixed).toMatchObject({
      type: "table",
      spec: { sheetId: S1, columns: [1, 2, 3, 4], format: rupiah },
    });
    expect(valid(fixed)).toBe(true);
    expect(missingColumns(fixed, sources)).toEqual([]);
  });

  it("label urutan: dimensi angka terkecil/terbesar; garis bertanggal hanya periode", () => {
    expect(sortLabel("label_asc", "integer")).toBe("Terkecil ke terbesar");
    expect(sortLabel("label_desc", "decimal", "bar")).toBe("Terbesar ke terkecil");
    expect(sortLabel("label_asc", "text")).toBe("A–Z");
    expect(sortLabel("label_desc", "date", "bar")).toBe("Terbaru dulu");

    expect(sortOptions("line", "date", "label_desc")).toEqual([
      { value: "label_desc", label: "Periode terbaru" },
      { value: "label_asc", label: "Periode terlama" },
    ]);
    // Spec lama dengan urutan nilai tetap jadi pilihan (Select tidak kosong).
    const legacy = sortOptions("line", "timestamp", "value_desc");
    expect(legacy.map((o) => o.value)).toEqual(["label_desc", "label_asc", "value_desc"]);
    expect(legacy.at(-1)!.label).toBe("Titik bernilai terbesar");
    // Garis bukan tanggal dan batang: keempat urutan.
    expect(sortOptions("line", "integer", "value_desc").map((o) => o.label)).toEqual([
      "Nilai terbesar dulu",
      "Nilai terkecil dulu",
      "Terkecil ke terbesar",
      "Terbesar ke terkecil",
    ]);
    expect(sortOptions("bar", "date", "value_desc")).toHaveLength(4);
    expect(sortOptions("pie", undefined, "label_asc")).toHaveLength(4);
  });

  it("ganti kolom pengelompokan: tanggal → per bulan; garis bertanggal → periode terbaru", () => {
    const line = defaultConfig("line", sources, empty) as ChartConfig;
    const byText = withDimension(
      { ...line, spec: { ...line.spec, sort: "value_desc" } },
      1,
      "text",
    );
    expect(byText.spec.dimension).toEqual({ column: 1 });
    expect(byText.spec.sort).toBe("value_desc");
    expect(withDimension(byText, 2, "date").spec).toMatchObject({
      dimension: { column: 2, timeGrain: "month" },
      sort: "label_desc",
    });
    const bar = defaultConfig("bar", sources, empty) as ChartConfig;
    expect(withDimension(bar, 2, "date").spec).toMatchObject({
      dimension: { column: 2, timeGrain: "month" },
      sort: "value_desc",
    });
  });

  it("data diganti, kolom diganti namanya: spec terbaca, kolom ditandai, pengaturan lain tetap", () => {
    const S3 = "cmv4kljx40009oczvdmpurrs3";
    const col = (pos: number, name: string, type: ColumnType): ColumnSchema => ({
      pos,
      name,
      original: name,
      type,
      hidden: false,
      nullPct: 0,
      distinctCount: 1,
      castFailCount: 0,
    });
    const old: SheetInfo = {
      id: S1,
      name: "Penjualan",
      index: 0,
      schema: [
        col(1, "Cabang", "text"),
        col(2, "Tanggal", "date"),
        col(3, "Omzet", "decimal"),
        col(4, "Rasio", "decimal"),
      ],
    };
    const target: SheetInfo = {
      id: S3,
      name: "Penjualan",
      index: 0,
      schema: [
        col(1, "Tanggal", "date"),
        col(2, "Omzet", "decimal"),
        col(3, "Kantor Cabang", "text"),
        col(4, "Rasio Margin", "decimal"),
      ],
    };
    const now: Source[] = [
      {
        id: S3,
        name: "Penjualan",
        columns: target.schema.map(({ pos, name, type }) => ({ pos, name, type })),
      },
    ];

    const bar = remapConfig(
      {
        type: "bar",
        spec: {
          sheetId: S1,
          dimension: { column: 1 },
          measure: { agg: "avg", column: 4 },
          sort: "label_asc",
          topN: 7,
          format: rupiah,
        },
      },
      old,
      target,
    ).config;
    // Panel tidak lagi kosong: spec dengan MISSING_COLUMN lolos validasi klien.
    expect(valid(bar)).toBe(true);
    expect(bar.spec).toMatchObject({ sheetId: S3, sort: "label_asc", topN: 7, format: rupiah });
    const missing = missingColumns(bar, now);
    expect(missing).toEqual([MISSING_COLUMN, MISSING_COLUMN]);
    expect(missingNotice(missing)).toContain("tidak ada di data terbaru");
    expect(missingColumnText(MISSING_COLUMN)).toBe(
      "Kolom tidak ada di data terbaru — pilih pengganti.",
    );
    // Kolom yang disembunyikan di skema: pesan lain.
    expect(missingNotice([9])).toContain("disembunyikan");
    expect(missingColumnText(9)).toBe("Kolom tidak tersedia lagi — pilih pengganti.");

    const kpi = remapConfig(
      { type: "kpi", spec: { sheetId: S1, measure: { agg: "sum", column: 3 }, format: rupiah } },
      old,
      target,
    ).config;
    expect(missingColumns(kpi, now)).toEqual([]);

    const table = remapConfig(
      { type: "table", spec: { sheetId: S1, columns: [1, 2, 3], format: rupiah } },
      old,
      target,
    ).config as TableConfig;
    expect(valid(table)).toBe(true);
    expect(table.spec.columns).toEqual([1, 2, MISSING_COLUMN]);
    expect(missingColumns(table, now)).toEqual([MISSING_COLUMN]);
    // "Hapus kolom itu dari tabel" tetap bisa dipakai.
    expect(withoutMissingColumns(table, now, true)).toMatchObject({ spec: { columns: [1, 2] } });
    expect(missingNotice([MISSING_COLUMN], true)).toMatch(
      /^Semua kolom .* tidak ada di data terbaru/,
    );
  });
});
