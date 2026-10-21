---
id: T-069
title: Buat editor field terhitung di panel widget pivot, grafik, dan KPI
status: blocked
profile: strict
profile_pinned: true
goal: G-7
tags:
  - ui
depends_on:
  - T-068
created: "2026-10-21T10:24:08Z"
updated: "2026-10-21T14:15:01Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 864037dfbc9968996401dde80c05a99317d6a3a6
paths:
  - src/components/dashboards/calc-editor-model.ts
  - src/components/dashboards/calc-editor.tsx
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/use-grid-width.ts
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/pivot-markup.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/exports/job.ts
  - src/features/exports/pivot.ts
  - src/features/query/pivot.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/widgets/calc-tokens.ts
  - src/features/widgets/calc.ts
  - src/features/widgets/pivot-table.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - tests/components/calc-editor.test.ts
  - tests/e2e/calc-widgets.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/widgets.spec.ts
  - tests/features/exports/fixtures.ts
  - tests/features/exports/job.test.ts
  - tests/features/query/calc.test.ts
  - tests/features/widgets/calc-tokens.test.ts
  - tests/features/widgets/calc.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T14:10:31Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-21T14:10:31Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 234929
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792592020015,"service":"data-dashboard","host":"127.0.0.1","port":41927,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792592020073,"service":"data-dashboard","host":"127.0.0.1","port":41707,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792592020183,"service":"data-dashboard","host":"127.0.0.1","port":33519,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792592020297,"service":"data-dashboard","host":"127.0.0.1","port":33925,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792592033973,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792592040764,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792592040786,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792592040794,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792592040824,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  212 passed | 1 skipped (213)
            Tests  2840 passed | 10 skipped (2850)
         Start at  14:11:43
         Duration  162.47s (tests 84%, import 13%, transform 3%)

          Isolate  213 workers spawned · ~172ms startup each (spawn + environment, per file)
                   at least ~12.05s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T14:14:27Z"
    tree: 2c8413f072adde989252660feef066a9944cfac7a18cc6397b57a9805da55119
  commits:
    - 14e93e4
    - 17cb5cc
    - 20985af
    - 60920fa
    - 693edf2
    - 6f54377
    - 864037d
    - 8ce72cf
    - a4869d3
    - a80b5ae
    - a821c13
    - c4a56e5
    - d23d4b2
    - d76daf2
    - f9bd2d5
  acceptance:
    total: 5
    done: 4
  audit:
    at: "2026-10-21T14:14:28Z"
    passed: true
    tree: 2c8413f072adde989252660feef066a9944cfac7a18cc6397b57a9805da55119
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4541 inodes visited, 1 Extract calls, 298.624621ms elapsed, 298.62495ms wall time
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
- Review putaran 1 (diperbaiki): angka "0.125" dibaca 125 → titik hanya ribuan bila kelompok sah diawali 1–9, koma = desimal (uji 0.125, 0,125, 1.250, 1,25, 1.250.000, -0.25) + petunjuk di isian Angka; rantai × ÷ > 5 operasi → pesan minta kurung; carryCalc/droppedCalcNotice memeriksa semua nilai pivot dan menyebut setiap field yang dibuang; fokus setelah kartu nilai pivot hilang/berganti (simpan field baru, "Ganti dengan ukuran biasa", "Hapus nilai").
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T14:14:27Z (234929 ms)
- Acceptance criteria: 4/5 satisfied
- Commits: 14e93e4, 17cb5cc, 20985af, 60920fa, 693edf2, 6f54377, 864037d, 8ce72cf, a4869d3, a80b5ae, a821c13, c4a56e5, d23d4b2, d76daf2, f9bd2d5
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
