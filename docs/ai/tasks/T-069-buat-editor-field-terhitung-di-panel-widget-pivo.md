---
id: T-069
title: Buat editor field terhitung di panel widget pivot, grafik, dan KPI
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ui
depends_on:
  - T-068
created: "2026-10-21T10:24:08Z"
updated: "2026-10-21T13:57:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 864037dfbc9968996401dde80c05a99317d6a3a6
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 226301
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792591028342,"service":"data-dashboard","host":"127.0.0.1","port":40529,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792591028405,"service":"data-dashboard","host":"127.0.0.1","port":46665,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792591028503,"service":"data-dashboard","host":"127.0.0.1","port":46485,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792591028625,"service":"data-dashboard","host":"127.0.0.1","port":37131,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792591041358,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792591045383,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792591045406,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792591045409,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792591045420,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  212 passed | 1 skipped (213)
            Tests  2826 passed | 10 skipped (2836)
         Start at  13:55:15
         Duration  157.45s (tests 83%, import 13%, transform 3%)

          Isolate  213 workers spawned · ~170ms startup each (spawn + environment, per file)
                   at least ~11.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T13:57:55Z"
    tree: 19693c05e96e778016c43708efed13ca4aee08c734a68c504d4e04cb79a61428
  audit:
    at: "2026-10-21T13:52:28Z"
    passed: true
    tree: e1602ee81c928b3ba1cc207fd4dd380a6a4f4a08cae00cd5f027c32a20e1ee27
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4485 inodes visited, 1 Extract calls, 261.546344ms elapsed, 261.546609ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
UI untuk menyusun field terhitung tanpa mengetik SQL: pilih ukuran (agregat + kolom), operator, kurung, dan konstanta; pratinjau hasil; dipakai di pivot, bar/line/pie, dan KPI. Lewat rantai frontend-expert, ikon Tabler. Rencana G-7 §3.2.

## Acceptance criteria
- [x] Given panel widget pivot, when editor klik 'Tambah field terhitung', then penyusun ekspresi menampilkan token (ukuran, + − × ÷, kurung, konstanta) dengan pratinjau teks 'Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan' dan nilai contoh total keseluruhan, tanpa input SQL bebas
- [x] Given ekspresi tidak lengkap/tidak valid (kurung tak seimbang, operator ganda, ukuran tak cocok tipe), then tombol Simpan nonaktif dan pesan galat Indonesia muncul di dekat token yang salah (aria-describedby), bukan setelah simpan
- [x] Given field terhitung tersimpan, then dapat dipilih sebagai nilai di pivot, ukuran di bar/line/pie (pai menampilkan peringatan bila hasilnya memuat nilai negatif), dan KPI, dengan format (otomatis/angka/persen/Rupiah) per field
- [ ] Given hanya keyboard dan lebar 360 px, then penyusun bisa dipakai penuh (Tab/Enter/Backspace hapus token), target sentuh ≥ 44 px, tanpa gulir horizontal; /frontend-expert:audit tanpa Critical/High dan blok Conventions check terisi
- [x] Given e2e terarah (playwright project widget), when editor membuat Margin pada pivot lalu viewer membuka dashboard bersama, then viewer melihat nilai yang sama dan tidak bisa membuka editor ekspresi

## Risk
- Impact: hanya UI panel widget (editor) + model klien; spec field terhitung sama dengan T-068 (tanpa perubahan skema/SQL/migrasi). Ganti jenis kini membawa field terhitung ke KPI/batang/garis/pai aditif/pivot di sheet yang sama.
- Security (STRIDE): Tampering/Elevation — klien tidak mengirim SQL; token diurai ke pohon calc.ts lalu server memvalidasi ulang saat simpan (parseWidgetConfig + widgetPlan/resolveCalc) dan saat query. Pratinjau memakai mode editor { dashboardId, spec } yang sudah ada (D6, editor/pemilik saja). Information disclosure — viewer tidak mendapat panel/editor (e2e AC5).
- Rollback: revert commit T-069; spec yang tersimpan tetap valid untuk T-068 (panel lama menampilkan rumus baca-saja).
- Validation: unit calc-tokens (urai/galat/bolak-balik/penyeimbangan), calc-editor (model, carryCalc, markup); e2e calc-widgets (project widgets) + regresi widgets & pivot.

## Notes
- Editor: `src/components/dashboards/calc-editor.tsx` (kartu ringkas `CalcField` + penyusun `CalcEditor`), model `calc-editor-model.ts`, token → pohon `src/features/widgets/calc-tokens.ts` (rekursi turun; galat menunjuk indeks token; rantai ± > kedalaman 6 disusun seimbang dengan nilai sama). Tidak ada input rumus/SQL bebas: hanya nama field dan angka konstanta.
- Bagian baru selalu masuk di akhir rumus (penyisipan di tengah belum ada — hapus dari belakang dengan Backspace/"Hapus bagian terakhir"); kandidat polesan lanjutan.
- Pratinjau nilai contoh = rumus atas seluruh data sheet (tanpa Saring/filter dashboard), ditunda 400 ms; jawaban INVALID server menonaktifkan Simpan (server penentu).
- T-068 L3: `carryCalc` membawa field terhitung saat ganti jenis (termasuk pengaturan jenis yang diingat panel); pai hanya rumus aditif; tabel/sheet lain → pemberitahuan `config-calc-dropped`.
- Pai: peringatan nilai negatif memakai `pie-negative` yang sudah ada (e2e: rumus Biaya − Pendapatan).
- Dilewati: plugin frontend-expert (/frontend-expert:audit) tidak tersedia di sesi cloud — prinsip diterapkan manual (lihat Conventions check). AC4 bagian audit menunggu orkestrator/pemilik.
- e2e: `tests/e2e/calc-widgets.spec.ts` (cocok project `widgets`): 6 tes lulus; regresi `--project=widgets` 13 lulus, `--project=pivot` 9 lulus.

## Conventions check
- Tokens: kelas Tailwind dari token (`--control-h-lg` 44 px, primary/destructive/warning/muted); tanpa hex mentah
- Icons: @tabler/icons-react saja (IconMathFunction, IconPencil, IconTrash, IconBackspace, IconPlus, IconCheck, IconAlertTriangle), size 20 stroke 1.5 lewat Button
- Audit: plugin frontend-expert tidak tersedia di sesi cloud; prinsip diterapkan manual
- States: rumus kosong / galat per token / pratinjau idle-menghitung-ok-galat server / ÷0 → "–"
- Responsive: 360 px tanpa gulir horizontal (e2e), tombol aksi full-width < 768, target ≥ 44 px
- A11y: editor = section berjudul (fokus ke judul saat dibuka), token = daftar tombol roving tabindex (panah/Home/End, Backspace/Delete), galat aria-live + aria-describedby ke token salah, fokus kembali ke "Ubah rumus"/tombol tambah setelah tutup

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: klien menyusun pohon calc.ts; server (simpan widget: parseWidgetConfig + widgetPlan/resolveCalc; query) tetap penentu
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: tanpa endpoint baru; pratinjau lewat mode editor /api/query { dashboardId, spec } yang sudah dicek peran (D6); viewer tanpa panel (e2e AC5)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: tidak ada teks SQL/rumus bebas; nama field lewat calcLabelSchema, konstanta parseConstText + batas 1e15 lalu zod server; teks dirender React (ter-escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: galat editor berbahasa Indonesia dari model/pesan server yang sudah ada, tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya satu agregat contoh untuk editor yang sudah berhak membaca dataset
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru; satu fetch ke /api/query milik aplikasi
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: batas 32 node/kedalaman 6/8 agregat tetap di server; pratinjau ditunda 400 ms + dibatalkan saat berubah, tetap lewat antrean/rate per user mesin query
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: body pratinjau = dashboardBodySchema/specSchema strict yang sudah ada
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi
