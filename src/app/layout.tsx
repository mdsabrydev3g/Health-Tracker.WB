import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health Tracker",
  description: "متابعة الأدوية والصحة — للعائلة",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Health Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately allow zoom — the mother must be able to pinch-zoom (§14).
  maximumScale: 5,
  themeColor: "#1d70f1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
