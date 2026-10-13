import { IconChartBar, IconChartLine, IconChartPie, IconTable } from "@tabler/icons-react";
import { describe, expect, it } from "vitest";
import { cardConfig, dataToggle, toggleMode } from "@/components/dashboards/widget-card-model";
import { bodyState, configVersion } from "@/components/widgets/body-state";
import {
  chooseKpi,
  formatDurationCompact,
  KPI_MIN_PX,
  kpiFontPx,
  kpiTexts,
  type KpiOption,
} from "@/components/widgets/kpi-fit";
import type { WidgetData } from "@/components/widgets/widget-query";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isIdLikeName, nameTokens } from "@/features/widgets/id-like";
import { MISSING_COLUMN, remapConfig, type SheetInfo } from "@/features/widgets/remap";
import { DEFAULT_FORMAT, type NumberFormat } from "@/features/widgets/spec";

/*
 * T-011 putaran 3: kolom kode/tahun tanpa pemisah ribuan (nama snake/camelCase, KPI min/maks), angka
 * KPI yang tidak pernah terpotong berelipsis, tombol data grafik, dan spec dengan kolom hilang tetap
 * dirender sebagai kartu berisi (pesan dari server).
 */
const RP: NumberFormat = { style: "rupiah", decimals: 0 };
const PCT: NumberFormat = { style: "percent", decimals: 1 };
/** Intl id-ID memakai spasi tak terputus sebelum satuan ringkas ("6,22 M"). */
const NB = " ";

describe("kolom kode/nomor/tahun (id-like)", () => {
  it("memecah nama per kata: snake, camel, kebab, spasi, titik, singkatan", () => {
    expect(nameTokens("tahunLahir")).toEqual(["tahun", "lahir"]);
    expect(nameTokens("IDPelanggan")).toEqual(["id", "pelanggan"]);
    expect(nameTokens("No. HP")).toEqual(["no", "hp"]);
    expect(nameTokens("kode_pos-baru 2")).toEqual(["kode", "pos", "baru"]);
    expect(nameTokens("NoHP")).toEqual(["no", "hp"]);
  });

  it.each([
    "kode_pos",
    "tahunLahir",
    "noResi",
    "id_pelanggan",
    "no_resi",
    "kode_cabang",
    "KodeCabang",
    "Kode_Pos",
    "Thn",
    "Tahun_Ajaran",
    "Tahun",
    "Year",
    "No",
    "No.",
    "NIK",
    "nik-karyawan",
    "Nomor HP",
    "No. HP",
    "NoHP",
    "Order ID",
    "user_id",
    "IDPelanggan",
    "Invoice No",
    "kodepos",
    "ZIP",
  ])("%s → tanpa pemisah ribuan", (name) => {
    expect(isIdLikeName(name)).toBe(true);
  });

  it.each([
    // Besaran tetap berpemisah walau ada kata yang mirip penanda kode.
    "Penjualan HP",
    "Jumlah WA terkirim",
    "Gaji th 2024",
    "Gaji per tahun",
    "Pendapatan Tahun Ini",
    "Jumlah Resi",
    "jumlah_id",
    "totalNo",
    "nilai_kode",
    "Qty",
    "Omzet",
    "Jumlah",
    "Nominal",
    // Bukan kata utuh: "id" di dalam kata lain tidak dihitung.
    "Hidup",
    "Video",
    "Paid",
    "",
  ])("%s → tetap berpemisah ribuan", (name) => {
    expect(isIdLikeName(name)).toBe(false);
  });
});

describe("KPI: teks lengkap dan bentuk ringkas", () => {
  it("min/maks kolom tahun/kode tanpa pemisah; jumlah/rata-rata tetap berpemisah", () => {
    expect(kpiTexts(2026, "integer", DEFAULT_FORMAT, "max", "Maksimum Tahun")).toEqual({
      full: "2026",
      options: [{ text: "2026", unit: null }],
    });
    expect(kpiTexts(40115, "integer", DEFAULT_FORMAT, "min", "Minimum kode_pos").full).toBe(
      "40115",
    );
    expect(kpiTexts(2026, "integer", DEFAULT_FORMAT, "max", "Maksimum Jumlah").full).toBe("2.026");
    expect(kpiTexts(40115, "integer", DEFAULT_FORMAT, "sum", "Total kode_pos").full).toBe("40.115");
    expect(kpiTexts(2026, "decimal", DEFAULT_FORMAT, "avg", "Rata-rata Tahun").full).toBe("2.026");
    // Format pilihan user (bukan Otomatis) dihormati.
    expect(kpiTexts(2026, "integer", RP, "max", "Maksimum Tahun").full).toBe("Rp 2.026");
  });

  it("rupiah: lengkap → ringkas → ringkas tanpa 'Rp' (satuan pindah ke label)", () => {
    const t = kpiTexts(6_215_000_000, "decimal", RP, "sum", "Total Omzet");
    expect(t.full).toBe("Rp 6.215.000.000");
    expect(t.options).toEqual([
      { text: "Rp 6.215.000.000", unit: null },
      { text: `Rp 6,22${NB}M`, unit: null },
      { text: `6,22${NB}M`, unit: "Rp" },
    ]);
    const neg = kpiTexts(-50_000_000, "decimal", RP, "sum", "Total Selisih");
    expect(neg.options.at(-1)).toEqual({ text: `-50${NB}jt`, unit: "Rp" });
  });

  it("persen dan durasi selalu punya nilai lengkap; durasi ringkas dua satuan", () => {
    expect(kpiTexts(0.468, "decimal", PCT, "avg", "Rata-rata Rasio")).toEqual({
      full: "46,8%",
      options: [{ text: "46,8%", unit: null }],
    });
    const d = kpiTexts(751_000, "duration", DEFAULT_FORMAT, "sum", "Total Durasi");
    expect(d.full).toBe("8 hari 16:36");
    expect(d.options.map((o) => o.text)).toEqual(["8 hari 16:36", "8 h 17 j"]);
    // Jumlah baris mengikuti format pilihan; teks/tanggal tidak diringkas.
    expect(kpiTexts(250, "count", DEFAULT_FORMAT, "count", "Jumlah baris").options).toHaveLength(1);
    expect(kpiTexts("2026-10-12", "date", DEFAULT_FORMAT, "max", "Maksimum Tanggal").full).toBe(
      "12 Okt 2026",
    );
  });

  it("formatDurationCompact membulatkan ke dua satuan terbesar", () => {
    expect(formatDurationCompact(751_000)).toBe("8 h 17 j");
    expect(formatDurationCompact(86_400 * 2 + 3600 * 23.6)).toBe("3 h");
    expect(formatDurationCompact(3600 + 5 * 60 + 9)).toBe("1 j 5 m");
    expect(formatDurationCompact(3600 * 23 + 59 * 60 + 50)).toBe("1 h");
    expect(formatDurationCompact(362_700)).toBe("4 h 5 j");
    expect(formatDurationCompact(309)).toBe("5 m 9 d");
    expect(formatDurationCompact(120)).toBe("2 m");
    expect(formatDurationCompact(-45)).toBe("-45 d");
    expect(formatDurationCompact(-0.2)).toBe("0 d");
    expect(formatDurationCompact(86_400 * 1234)).toBe("1.234 h");
  });
});

describe("KPI: memilih bentuk yang muat", () => {
  // Lebar tiruan: 0,6 × ukuran huruf per karakter (kira-kira huruf tebal sistem).
  const measure = (text: string, px: number) => text.length * px * 0.6;
  const rp = kpiTexts(6_215_000_000, "decimal", RP, "sum", "Total Omzet").options;

  it("belum diukur atau tidak bisa diukur → bentuk lengkap", () => {
    expect(chooseKpi(rp, null, measure)).toMatchObject({ text: "Rp 6.215.000.000", small: false });
    expect(chooseKpi(rp, 40, () => null)).toMatchObject({ text: "Rp 6.215.000.000" });
  });

  it("ukuran huruf mengikuti lebar isi (sama dengan clamp 1.125rem/15cqi/2.25rem)", () => {
    expect(kpiFontPx(60)).toBe(18);
    expect(kpiFontPx(160)).toBe(24);
    expect(kpiFontPx(400)).toBe(36);
  });

  it("turun bertahap: lengkap → ringkas → tanpa Rp → huruf kecil → dua baris", () => {
    expect(chooseKpi(rp, 400, measure)).toMatchObject({ text: "Rp 6.215.000.000", unit: null });
    expect(chooseKpi(rp, 160, measure)).toMatchObject({ text: `Rp 6,22${NB}M`, small: false });
    expect(chooseKpi(rp, 90, measure)).toMatchObject({
      text: `6,22${NB}M`,
      unit: "Rp",
      small: false,
    });
    const small = chooseKpi(rp, 60, measure);
    expect(small).toMatchObject({ text: `6,22${NB}M`, unit: "Rp", small: true, wrap: false });
    expect(measure(small.text, KPI_MIN_PX)).toBeLessThanOrEqual(60);
    expect(chooseKpi(rp, 30, measure)).toMatchObject({ small: true, wrap: true });
  });

  it("persen tanpa bentuk ringkas tetap lengkap di kartu sangat sempit (huruf kecil, bukan '4…')", () => {
    const pct: KpiOption[] = kpiTexts(0.468, "decimal", PCT, "avg", "Rasio").options;
    expect(chooseKpi(pct, 48, measure)).toMatchObject({ text: "46,8%", small: true, wrap: false });
  });
});

describe("kartu widget", () => {
  it("tombol data: tooltip dan ikon berganti, sesuai jenis grafik", () => {
    expect(dataToggle("bar", false)).toEqual({ tooltip: "Tampilkan tabel data", Icon: IconTable });
    expect(dataToggle("bar", true)).toEqual({ tooltip: "Tampilkan grafik", Icon: IconChartBar });
    expect(dataToggle("line", true).Icon).toBe(IconChartLine);
    expect(dataToggle("pie", true).Icon).toBe(IconChartPie);
  });

  const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
    ({ pos, name, original: name, type, hidden: false, nullPct: 0 }) as ColumnSchema;
  const SHEET_OLD = "cmv4kljx40009oczvdmpurrol";
  const SHEET_NEW = "cmv4kljx40009oczvdmpurrnw";
  const old: SheetInfo = {
    id: SHEET_OLD,
    name: "Penjualan",
    index: 0,
    schema: [col(1, "Cabang", "text"), col(2, "Omzet", "decimal"), col(3, "Catatan", "text")],
  };
  // Unggahan baru: "Cabang" diganti namanya, "Omzet" dan "Catatan" hilang.
  const next: SheetInfo = {
    id: SHEET_NEW,
    name: "Penjualan",
    index: 0,
    schema: [col(1, "Kantor Cabang", "text"), col(2, "Tanggal", "date")],
  };

  it.each([
    ["kpi", { sheetId: SHEET_OLD, measure: { agg: "sum", column: 2 }, format: DEFAULT_FORMAT }],
    [
      "bar",
      {
        sheetId: SHEET_OLD,
        dimension: { column: 1 },
        measure: { agg: "count", column: 2 },
        sort: "value_desc",
        topN: 12,
        format: DEFAULT_FORMAT,
      },
    ],
    ["table", { sheetId: SHEET_OLD, columns: [1, 2, 3], format: RP, formatColumns: [2] }],
  ] as const)(
    "%s dengan kolom hilang (MISSING_COLUMN) tetap kartu berisi → pesan server",
    (type, spec) => {
      const before = cardConfig(type, spec);
      if (!before) throw new Error("spec awal tidak valid");
      const { config, missing } = remapConfig(before, old, next);
      expect(missing.length).toBeGreaterThan(0);
      expect(JSON.stringify(config.spec)).toContain(String(MISSING_COLUMN));
      // Bukan null → kartu memuat /api/query dan menampilkan COLUMN_UNAVAILABLE, bukan "belum berisi data".
      expect(cardConfig(type, config.spec)).toMatchObject({ type, spec: { sheetId: SHEET_NEW } });
    },
  );

  it("spec kosong atau rusak → null (kartu 'belum berisi data')", () => {
    expect(cardConfig("empty", {})).toBeNull();
    expect(cardConfig("kpi", { sheetId: SHEET_OLD })).toBeNull();
    expect(cardConfig("radar", {})).toBeNull();
  });
});

describe("putaran 4", () => {
  describe("kolom kode/tahun: kata pertama menentukan", () => {
    it.each([
      // Tahun dengan kata keterangan biasa tetap kolom tahun.
      "Tahun Lahir",
      "Tahun Anggaran",
      "thn_masuk",
      // Penanda di depan menang atas kata uang sesudahnya (frasa berkepala di depan).
      "No Tagihan",
      "Kode Biaya",
      "ID Penjualan",
      "Nomor Telepon",
      "Telepon Kantor",
      "Resi",
      "No AWB",
      // Penanda kuat setelah kata netral.
      "Pengirim No HP",
      "Penerima Kode Pos",
      "Customer Code",
      "1. Kode Cabang",
    ])("%s → tanpa pemisah ribuan", (name) => {
      expect(isIdLikeName(name)).toBe(true);
    });

    it.each([
      // Tahun relatif atau tahun tertentu: kolom nilai per periode.
      "Tahun Lalu",
      "Tahun Ini",
      "Tahun Sebelumnya",
      "Tahun Depan",
      "tahunLalu",
      "Tahun 2024",
      "Thn 2025",
      "thn2025",
      "Year to Date",
      // "per <kode>" = tarif per satuan.
      "Ongkir per Resi",
      "Pendapatan per Kode Pos",
      "Tarif per AWB",
      "Pendapatan per ID",
      "Order per ID",
      // Kata uang di depan; penanda sesudahnya hanya keterangan.
      "Tagihan Telepon",
      "Pulsa Telp",
      "Pemakaian Telepon",
      "Penjualan Kode Pos",
      // Telepon/resi bukan di depan: bukan kepala frasa.
      "Penerima Telp",
      // Agregat di mana pun.
      "ID Count",
      "No. of Orders",
    ])("%s → tetap berpemisah ribuan", (name) => {
      expect(isIdLikeName(name)).toBe(false);
    });

    it("KPI min/maks kolom besaran tetap berpemisah; kolom tahun tidak", () => {
      expect(
        kpiTexts(1234567890, "integer", DEFAULT_FORMAT, "max", "Maksimum Tahun Lalu").full,
      ).toBe("1.234.567.890");
      expect(
        kpiTexts(15000, "integer", DEFAULT_FORMAT, "max", "Maksimum Ongkir per Resi").full,
      ).toBe("15.000");
      expect(kpiTexts(1990, "integer", DEFAULT_FORMAT, "min", "Minimum Tahun Lahir").full).toBe(
        "1990",
      );
    });
  });

  describe("tombol data grafik mengikuti isi kartu", () => {
    const rows = (n: number): WidgetData => ({
      columns: [
        { key: "d", label: "Cabang", type: "text" },
        { key: "m", label: "Omzet", type: "decimal" },
      ],
      rows: Array.from({ length: n }, (_, i) => [`C${i}`, i]),
    });
    const err = (data?: WidgetData) =>
      ({ status: "error", code: "COLUMN_UNAVAILABLE", message: "x", data }) as const;

    it("memuat → loading; ada baris → rows; kosong → none", () => {
      expect(bodyState({ status: "loading" }, false)).toBe("loading");
      expect(bodyState({ status: "ok", data: rows(3) }, false)).toBe("rows");
      expect(bodyState({ status: "ok", data: rows(0) }, false)).toBe("none");
      // Memuat ulang dengan data lama: data lama yang tampil menentukan.
      expect(bodyState({ status: "loading", data: rows(2) }, false)).toBe("rows");
    });

    it("galat grafik → none walau ada data lama; tabel tetap menampilkan data lama", () => {
      expect(bodyState(err(), false)).toBe("none");
      expect(bodyState(err(rows(4)), false)).toBe("none");
      expect(bodyState(err(rows(4)), true)).toBe("rows");
      expect(bodyState(err(), true)).toBe("none");
    });

    it("aktif bila ada baris, nonaktif saat memuat, tidak ada saat galat/kosong", () => {
      expect(toggleMode("rows")).toBe("on");
      expect(toggleMode("loading")).toBe("wait");
      expect(toggleMode("none")).toBeNull();
    });

    it("versi isi berubah saat spec berubah (status lama tidak dipakai)", () => {
      const a = configVersion({ type: "bar", spec: { topN: 5 } });
      expect(configVersion({ type: "bar", spec: { topN: 5 } })).toBe(a);
      expect(configVersion({ type: "bar", spec: { topN: 6 } })).not.toBe(a);
      expect(configVersion({ type: "pie", spec: { topN: 5 } })).not.toBe(a);
    });
  });
});

describe("putaran 5", () => {
  describe("kolom hitungan kurir: penanda kata-pertama + kata status = besaran", () => {
    it.each([
      "Resi Terkirim",
      "Resi Masuk",
      "Resi Gagal",
      "Resi Retur",
      "AWB Terkirim",
      "AWB Masuk Harian",
      "Telepon Masuk",
      "Telp Keluar",
      "Paket Diterima",
      "resi_terkirim",
      "resiTerkirim",
      "awb-dikirim",
    ])("%s → tetap berpemisah ribuan", (name) => {
      expect(isIdLikeName(name)).toBe(false);
    });

    it.each([
      // Tanpa kata status: tetap kode/nomor seperti putaran 3–4.
      "Resi",
      "AWB",
      "No Resi",
      "Nomor AWB",
      "Resi Pengirim",
      "Telepon Kantor",
      "Kode Pos",
      "Tahun Lahir",
      // Penanda kuat di depan menang: nomor resi dari pengiriman yang terkirim.
      "No Resi Terkirim",
    ])("%s → tanpa pemisah ribuan", (name) => {
      expect(isIdLikeName(name)).toBe(true);
    });

    it("tabel dan KPI maks: hitungan resi berpemisah, nomor resi tidak", () => {
      expect(kpiTexts(12398, "integer", DEFAULT_FORMAT, "max", "Maksimum Resi Terkirim").full).toBe(
        "12.398",
      );
      expect(kpiTexts(12398, "integer", DEFAULT_FORMAT, "max", "Maksimum No Resi").full).toBe(
        "12398",
      );
    });
  });
});
