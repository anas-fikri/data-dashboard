-- Ekspor gambar (PNG) dan HTML lewat renderer (T-7c8v, T-yye9, T-c2bh). Nilai enum baru saja: aman untuk
-- rollback image (baris PNG/HTML kedaluwarsa ≤ 1 jam; tanpa baris lama yang berubah).
ALTER TYPE "ExportFormat" ADD VALUE IF NOT EXISTS 'PNG';
ALTER TYPE "ExportFormat" ADD VALUE IF NOT EXISTS 'HTML';
