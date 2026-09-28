/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Capacitor builds a static shell; the app must remain exportable for the Android webview.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
