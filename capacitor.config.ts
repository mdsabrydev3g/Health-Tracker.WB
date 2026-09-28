import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell for Health Tracker.
 *
 * IMPORTANT — read before building:
 *
 * This app is server-backed (Neon Postgres via Vercel), so the native shell
 * loads the DEPLOYED web app in a webview rather than a static export. That
 * keeps one source of truth and means the mother's phone always sees the same
 * data as the caregiver's.
 *
 * Consequences, stated plainly:
 *   • Online-first. Full offline mode (§12) needs the local SQLite adapter +
 *     outbox queue, which is a later phase — do not claim offline support yet.
 *   • Local notifications are scheduled from the materialised dose list, so the
 *     reminder path still works natively even though data comes from the web.
 *
 * To develop against a local server instead, set CAPACITOR_SERVER_URL and
 * allow cleartext traffic in android/app/src/main/AndroidManifest.xml.
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.healthtracker.app",
  appName: "Health Tracker",
  webDir: ".next/static",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
  android: {
    // Android 15/16 = SDK 35. minSdk 26 covers Android 8+.
    // Set these in android/variables.gradle after `npx cap add android`.
    buildOptions: {
      keystorePath: undefined,
    },
  },
  plugins: {
    LocalNotifications: {
      // Dedicated HIGH-importance channel "تذكير الجرعات" (§9).
      smallIcon: "ic_stat_notify",
      iconColor: "#1d70f1",
    },
  },
};

export default config;
