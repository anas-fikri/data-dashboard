-- T-046: ekspor tampilan "Lihat data" — Export menunjuk sheet sumber (tanpa FK, seperti widgetId).
ALTER TABLE "Export" ADD COLUMN "sheetId" TEXT;
