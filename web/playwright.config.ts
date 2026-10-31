import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * スモーク E2E。本番ビルド(vite preview)に対して主要画面フローを確認する。
 * 「全件パス」を厳密にするため retries は 0(flaky も不合格扱い)。
 * 外部通信(OSMタイル・Nominatim)は e2e/fixtures.ts でモックし、実ネットワークへは出さない。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 本番ビルドは Service Worker を登録するため、テスト間のキャッシュ干渉を避ける
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
