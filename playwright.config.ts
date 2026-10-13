import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromium =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const testData = mkdtempSync(join(tmpdir(), "questspace-e2e-"));
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: { executablePath: chromium },
  },
  webServer: [
    {
      command: "npm run dev -w @questspace/api",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      env: { DATA_DIR: testData },
    },
    {
      command: "npm run dev -w @questspace/web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
    {
      command: "npm run web -w @questspace/mobile -- --localhost",
      url: "http://localhost:8081",
      reuseExistingServer: false,
      env: { CI: "1", EXPO_NO_TELEMETRY: "1", EXPO_OFFLINE: "1" },
      timeout: 90000,
    },
  ],
});
