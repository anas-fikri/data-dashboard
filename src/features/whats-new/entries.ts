/*
 * "Yang baru" (v1.10.0): daftar perubahan untuk pengguna awam — bahasa sehari-hari, tanpa istilah teknis,
 * dikelompokkan per versi minor (x.y; perbaikan kecil x.y.z masuk ke versi minornya). Berbeda dari
 * CHANGELOG.md yang teknis. Setiap rilis minor menambah entri di PALING ATAS (uji
 * tests/features/whats-new.test.ts menjaga entri teratas tidak tertinggal dari versi aplikasi).
 */
export interface WhatsNewEntry {
  /** Versi minor, mis. "1.10". */
  version: string;
  /** Tanggal rilis (YYYY-MM-DD). */
  date: string;
  items: string[];
}

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    version: "1.14",
    date: "2026-11-10",
    items: [
      "Cari cepat: tekan Ctrl+K (Mac: ⌘K) atau tombol Cari di kanan atas untuk langsung membuka dashboard, dataset, atau panduan tanpa menelusuri menu.",
      "Tampilan tersimpan: simpan kombinasi filter yang sering dipakai (mis. Jakarta – bulan ini) dari menu Tampilan di bilah filter, lalu pilih kembali dengan satu klik. Pemilik/editor bisa membuat tampilan bersama untuk semua yang punya akses.",
      "Mode TV untuk monitor di ruang operasional: buka Lainnya → Mode TV. Dashboard tampil penuh layar tanpa menu dan datanya diperbarui otomatis (bisa juga diatur di tampilan biasa: Lainnya → Muat ulang otomatis).",
      "Duplikat dashboard: buka Lainnya → Duplikat dashboard untuk menyalin dashboard beserta widget, filter, dan warnanya — cocok dijadikan contoh untuk cabang atau periode lain.",
    ],
  },
  {
    version: "1.13",
    date: "2026-11-09",
    items: [
      "Untuk admin — halaman Admin › Backup kini menampilkan daftar arsip backup (sudah di NAS atau belum), sisa ruang disk server dan NAS, serta penjelasan galat dalam bahasa sehari-hari beserta langkah perbaikannya.",
      "Untuk admin — tombol Kirim ulang sekarang mengirim backup yang tertunda ke NAS tanpa menunggu jadwal, dan lama simpan arsip di server maupun di NAS bisa diatur langsung dari halaman itu.",
      "Bila NAS penuh, pengiriman ulang otomatis kini dijeda bertahap (sampai tiap 4 jam) agar server tidak mengunggah arsip besar berulang kali dengan sia-sia.",
    ],
  },
  {
    version: "1.12",
    date: "2026-11-08",
    items: [
      "Filter dashboard kini ada di panel kiri yang tetap terlihat saat halaman digulir (laptop/monitor) — tidak perlu naik ke atas untuk mengganti filter. Tekan ikon Ciutkan filter bila butuh ruang lebih untuk grafik; pilihan itu diingat.",
    ],
  },
  {
    version: "1.11",
    date: "2026-11-08",
    items: [
      'Penilaian warna bawaan: di Warna dashboard pilih "makin tinggi makin baik" (atau buruk) sekali, semua grafik dan pivot di dashboard itu langsung berwarna hijau–kuning–merah. Widget yang arahnya terbalik (mis. klaim) atau tidak perlu diwarnai bisa diubah sendiri, termasuk pilihan "Tanpa warna".',
      "Delapan tema grafik baru: Pantai, Klasik, Bumi, Senja, Cerah, Laut, Beri, dan Ungu–biru — warnanya tetap jelas terbaca di tampilan terang maupun gelap.",
    ],
  },
  {
    version: "1.10",
    date: "2026-11-07",
    items: [
      "Tema warna grafik: buka mode ubah dashboard → Warna dashboard → Tema grafik (Office, Lembut, atau Ramah buta warna). Semua grafik batang, garis, dan pai di dashboard itu langsung ikut.",
      "Diagram batang bisa tegak atau mendatar (pengaturan widget → Arah batang). Grafik per tanggal/bulan otomatis tegak dan urut waktu.",
      'Garis tren: di grafik per tanggal/bulan, pilih Garis tren untuk melihat arah naik/turun (mis. "naik 120 per bulan") atau rata-rata 3/7 periode.',
      "Halaman Yang baru ini: daftar perubahan aplikasi dalam bahasa sederhana.",
    ],
  },
  {
    version: "1.9",
    date: "2026-11-06",
    items: [
      "Template warna cukup diatur sekali untuk satu dashboard (tombol Warna dashboard); semua widget ikut, kecuali yang memilih warna sendiri.",
      "Warna hijau–kuning–merah kini juga ada di grafik Garis (titik), Pai (irisan), dan Tabel (per kolom angka).",
    ],
  },
  {
    version: "1.8",
    date: "2026-11-06",
    items: [
      "Warna bisa memakai target, mis. SLA: Baik bila ≥ 95, Perlu perhatian bila < 90.",
      "Widget Angka ikut berwarna sesuai target.",
      "Admin menerima email bila ada gangguan sistem atau backup bermasalah.",
    ],
  },
  {
    version: "1.7",
    date: "2026-11-06",
    items: [
      "Warna status di Pivot dan diagram Batang: pilih Penilaian warna (makin tinggi makin baik, atau makin tinggi makin buruk) — yang bermasalah langsung terlihat merah.",
    ],
  },
  {
    version: "1.6",
    date: "2026-11-06",
    items: [
      "Unggah file besar lebih tahan gangguan jaringan sesaat — tidak perlu mengulang dari awal.",
      "Ikon aplikasi baru di tab browser.",
    ],
  },
  {
    version: "1.5",
    date: "2026-10-23",
    items: [
      "Kotak cari di semua daftar pilihan: ketik beberapa huruf untuk menemukan kolom atau nilai.",
      "Unggah Excel berisi banyak sheet: pilih sheet yang mau dipakai.",
      "Versi aplikasi tampil di bagian bawah setiap halaman.",
    ],
  },
  {
    version: "1.4",
    date: "2026-10-22",
    items: [
      "Dashboard baru bisa langsung berisi contoh widget dari data Anda.",
      "Filter bawaan: dashboard dibuka dengan filter yang sudah terpasang.",
      "Editor dashboard boleh menambah kolom filter.",
    ],
  },
];

export const WHATS_NEW_LATEST = WHATS_NEW[0]!.version;
