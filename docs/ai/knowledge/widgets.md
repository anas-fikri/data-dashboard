# Knowledge: widgets

- Dialog Radix terkendali tanpa Dialog.Trigger tidak tahu pembukanya: catat document.activeElement saat membuka (di event handler, bukan efek — FocusScope anak sudah memindah fokus) lalu fokuskan lagi di onCloseAutoFocus dengan preventDefault. <!-- aitk:k date=2026-11-10 task=T-d5ev tags=widgets,query -->
- COUNT/SUM atas nol baris tidak membedakan 'tidak ada data' dari 0: hitung jumlah baris periode pembanding di query batas yang sama, dan lewati agregat kedua bila 0. <!-- aitk:k date=2026-11-10 task=T-43hv tags=widgets,query -->
- Tambahan UI di atas grafik harus di luar kotak yang diukur useBoxSize (outer): chartFit/daftar ringkas menghitung dari tinggi kotak itu, jadi bilah di dalamnya memotong baris terakhir di kartu pendek. <!-- aitk:k date=2026-11-11 task=T-j25e tags=widgets -->
