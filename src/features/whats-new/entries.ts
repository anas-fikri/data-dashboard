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
    version: "1.19",
    date: "2026-11-12",
    items: [
      "Lewati periode saat meninjau unggahan: bila file berisi bulan yang datanya lebih sedikit dari yang sudah tersimpan (mis. April hanya sebagian), centang Lewati periode ini — data lama bulan itu tetap, bulan lain di file tetap diterapkan.",
      "Data per periode: satu file Excel dengan beberapa sheet berkolom sama (mis. Data 1, Data 2, … karena batas baris Excel) kini bisa diunggah sekaligus. Semua sheet digabung ke satu sheet data walaupun namanya berbeda dan bulannya bercampur; layar tinjauan menyebut sheet mana saja yang digabung sebelum Anda menerapkannya.",
    ],
  },
  {
    version: "1.18",
    date: "2026-11-11",
    items: [
      "Kartu Server di bawah menu samping: lihat sekilas seberapa sibuk server (CPU, memori, ruang disk, lalu lintas jaringan) beserta grafik satu jam terakhir, dan apakah pemroses unggahan sedang aktif. Bila server sedang berat, kartu memberi tanda Beban tinggi — saat itu wajar bila dashboard atau unggahan terasa lebih lambat.",
      "Untuk admin — halaman Admin › Sumber daya server: grafik 1 jam dan 24 jam, ruang tiap disk, serta pemakaian memori dan CPU aplikasi dan pemroses unggahan, untuk mencari penyebab server lambat tanpa masuk ke server.",
      "Untuk admin — tabel Pemakaian per akun (perkiraan) di halaman yang sama: akun mana yang paling banyak membuat server bekerja dalam 15 menit terakhir, berapa query yang sedang berjalan, unggahan/ekspor yang sedang diproses, dan ruang penyimpanan yang dipakai.",
    ],
  },
  {
    version: "1.17",
    date: "2026-11-11",
    items: [
      "Jumlah kosong: hitung berapa baris yang kolomnya belum terisi, mis. resi yang tanggal terimanya masih kosong atau kiriman tanpa kurir. Pilih Nilai → Jumlah kosong di widget Angka, Batang, Garis, Pai, atau Pivot; bisa diberi pembanding periode lalu, dan Lihat baris data langsung menampilkan baris yang kosong itu.",
      "Bila pemroses unggahan di server sedang mati, halaman dataset kini langsung memberi tahu (bukan sekadar menunggu tanpa kabar). File tetap aman di antrean dan otomatis diproses begitu pemroses menyala lagi.",
    ],
  },
  {
    version: "1.16",
    date: "2026-11-11",
    items: [
      "Gabungkan sheet: data yang terpecah ke beberapa sheet karena batas baris Excel (mis. Data 1, Data 2 dengan judul kolom yang sama) kini bisa diunggah sebagai satu sheet. Saat memilih sheet, centang Gabungkan sheet yang judul kolomnya sama — dashboard, pivot, dan Lihat data langsung membaca semua barisnya.",
    ],
  },
  {
    version: "1.15",
    date: "2026-11-10",
    items: [
      "Pembanding di widget Angka: tampilkan bulan (atau minggu, kuartal, tahun) terakhir beserta ▲/▼ persen dibanding periode sebelumnya atau periode yang sama tahun lalu, mis. ▲ +32,3% vs Mar 2026. Hijau/merah mengikuti penilaian warna. Atur di pengaturan widget → Pembanding.",
      "Klik-tembus: klik batang, titik, atau irisan pai tetap menyaring widget lain; lalu tekan Lihat baris data di atas grafik untuk melihat baris data di baliknya (mis. semua kiriman Bandung), lengkap dengan urutan dan halaman. Pemilik/editor menyalakannya per grafik dan memilih kolom yang boleh dilihat.",
    ],
  },
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
