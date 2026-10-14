import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { lastOutcome } from "@/components/mapping/mapping-last";
import { MappingReview } from "@/components/mapping/mapping-review";
import { MappingSaveBar } from "@/components/mapping/mapping-save-bar";
import { MappingSheet } from "@/components/mapping/mapping-sheet";
import { MappingSummary } from "@/components/mapping/mapping-summary";
import type { MappingReviewIssue, MappingSheetView } from "@/components/mapping/mapping-types";

/* T-014 review putaran 2 (UI): panel tinjau, bar simpan, ringkasan, dan teks yang menjanjikan langkah. */

const issue = (column: string): MappingReviewIssue => ({
  sheet: "Penjualan",
  column,
  header: column,
  pct: 0.85,
  typeLabel: "Tanggal (dd/mm/yyyy)",
});

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/<!-- -->/g, "");

/** Kelas tombol bertanda `testId` (urutan atribut bebas). */
function buttonClass(out: string, testId: string): string[] {
  const tag = out.match(/<button[^>]*>/g)?.find((t) => t.includes(`data-testid="${testId}"`));
  return (/ class="([^"]*)"/.exec(tag ?? "")?.[1] ?? "").split(" ").filter(Boolean);
}

function review(targets: (string | null)[], live = true, canAcknowledge = true) {
  return html(
    createElement(MappingReview, {
      issues: targets.map((_, i) => issue(`Kolom ${i + 1}`)),
      targets,
      showSheet: false,
      live,
      canAcknowledge,
      disabled: false,
      onAcknowledge: () => {},
    }),
  );
}

describe("MappingReview", () => {
  it("R2-UI-1: tombol persetujuan membungkus di ponsel (tidak terpotong), satu baris mulai md", () => {
    const cls = buttonClass(review(["map-a1-cast-3-type"]), "mapping-acknowledge");
    expect(cls).toEqual(expect.arrayContaining(["whitespace-normal", "h-auto", "w-full"]));
    expect(cls).toEqual(expect.arrayContaining(["md:whitespace-nowrap", "md:w-auto"]));
    // Base "whitespace-nowrap" tidak tersisa untuk lebar ponsel (tailwind-merge).
    expect(cls).not.toContain("whitespace-nowrap");
    expect(cls).not.toContain("h-(--control-h)");
  });

  it("R2-INT-5: isu tanpa pemicu di halaman ini diarahkan ke halaman Skema, konsisten dengan baris", () => {
    const allOff = review([null]);
    expect(allOff).toContain("Tipenya hanya bisa diubah dari halaman Skema.");
    expect(allOff).toContain(
      "Ubah tipe kolomnya dari halaman Skema lalu simpan lagi, atau simpan apa adanya.",
    );
    expect(allOff).not.toContain("setelah versi aktif");
    expect(allOff).not.toContain("(mis. ke Teks)");

    const mixed = review(["map-a1-cast-3-type", null]);
    expect(mixed).toContain(
      "Ubah tipe kolomnya di sini atau dari halaman Skema (lihat tiap kolom)",
    );

    const onPage = review(["map-a1-cast-3-type"]);
    expect(onPage).toContain(
      "Ubah tipe kolomnya (mis. ke Teks) lalu simpan lagi, atau simpan apa adanya.",
    );
    expect(onPage).not.toContain("halaman Skema");
  });

  it("R2-UI-6: hasil yang tidak live tidak mengaku 'pilihan berubah' dan tanpa persetujuan", () => {
    const out = review(["map-a1-cast-3-type"], false, false);
    expect(out).not.toContain("Pilihan berubah");
    expect(out).not.toContain("mapping-acknowledge");
    expect(out).not.toContain("data-live");
    expect(out).toContain("Buat lagi pilihan kolomnya lalu simpan");
  });
});

describe("MappingSaveBar", () => {
  const bar = (reviewPending: boolean) =>
    html(
      createElement(MappingSaveBar, {
        done: 1,
        total: 1,
        busy: false,
        pending: false,
        reviewPending,
      }),
    );

  it("R2-UI-2: selama persetujuan ditunggu, bar tidak jadi tombol utama kedua", () => {
    const out = bar(true);
    expect(out).toContain("Perlu persetujuan");
    expect(out).toContain("lihat panel di atas");
    expect(out).not.toContain("Siap disimpan");
    expect(out).not.toContain("versi baru langsung aktif");
    expect(out).toContain("Lihat yang perlu diperiksa");
    expect(out).toContain('data-review="true"');
    const cls = buttonClass(out, "mapping-save");
    expect(cls).toContain("border-input");
    expect(cls).not.toContain("bg-primary");
  });

  it("tanpa tinjau: tombol utama 'Simpan & aktifkan' seperti biasa", () => {
    const out = bar(false);
    expect(out).toContain("Siap disimpan");
    expect(out).toContain("Simpan &amp; aktifkan");
    expect(out).not.toContain("data-review");
    const cls = buttonClass(out, "mapping-save");
    expect(cls).toContain("bg-primary");
  });
});

describe("MappingSummary", () => {
  const summary = (reviewing: boolean) =>
    html(
      createElement(MappingSummary, {
        missing: 0,
        lowCast: 0,
        hidden: 0,
        sheets: 0,
        done: 0,
        total: 0,
        reviewing,
      }),
    );

  it("R2-UI-5: selama panel tinjau tampil, tidak menyatakan kolomnya sudah cocok", () => {
    expect(summary(true)).not.toContain("sudah cocok");
    expect(summary(true)).toContain("tinjau tipe kolom lalu simpan");
    expect(summary(false)).toContain("sudah cocok dengan skema aktif");
  });
});

describe("teks langkah tinjau", () => {
  it("R2-INT-7: halaman dataset tidak menjanjikan 'simpan apa adanya' langsung", () => {
    const out = lastOutcome({ jobId: "j1", state: "review", issues: [issue("Tanggal")] });
    expect(out?.text).not.toContain("apa adanya");
    expect(out?.text).toContain("buat lagi pilihannya");
    expect(out?.text).toContain("simpan dan kosongkan nilai yang tidak cocok");
  });

  it("R2-INT-8: petunjuk baris tipe menyebut pemeriksaan ulang + persetujuan, bukan langsung dikosongkan", () => {
    const sheet: MappingSheetView = {
      active: {
        id: "a1",
        name: "Penjualan",
        schemaRevision: 1,
        columns: [
          {
            pos: 1,
            name: "Tanggal",
            original: "Tanggal",
            type: "date",
            dateFormat: "dd/mm/yyyy",
            hidden: false,
            absent: false,
          },
        ],
      },
      target: { id: "n1", name: "Penjualan" },
      candidates: [],
      newColumns: [
        {
          pos: 1,
          original: "Tanggal",
          name: "Tanggal",
          type: "date",
          castFailCount: 6,
          samples: [],
        },
      ],
      autoMatched: [{ activePos: 1, newPos: 1 }],
      missing: [],
      extra: [],
      lowCast: [{ pos: 1, activePos: 1, pct: 0.85, typeLabel: "Tanggal", approx: false }],
    };
    const out = html(
      createElement(MappingSheet, {
        sheet,
        title: "Kolom",
        draft: { columns: {}, casts: {} },
        plans: {},
        planState: undefined,
        flags: undefined,
        candidates: [],
        attempted: false,
        disabled: false,
        onChange: () => {},
        onTarget: () => {},
        onRetry: () => {},
      }),
    );
    expect(out).toContain("Saat disimpan, nilai diperiksa ulang");
    expect(out).toContain("Anda diminta memastikan sebelum nilai itu dikosongkan");
    expect(out).not.toContain("dikosongkan saat disimpan");
  });
});
