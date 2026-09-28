import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes the web build installable on Android, and is the entry
 * point Capacitor wraps for the native shell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Health Tracker",
    short_name: "Health Tracker",
    description: "متابعة الأدوية والصحة — للعائلة",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1d70f1",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
