import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Data Dashboard", template: "%s · Data Dashboard" },
  description: "Pengganti dashboard Excel PCP Express",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
