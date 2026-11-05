import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Data Dashboard", template: "%s · Data Dashboard" },
  description: "Pengganti dashboard Excel PCP Express",
  // Di luar gerbang sesi (matcher proxy mengecualikan /favicon.ico dan /brand/): tampil juga di halaman login.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce CSP dari proxy (T-027); dipakai script inline tema.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
