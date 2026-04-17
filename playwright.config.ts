import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    // Auth setup — runs first, saves session state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Smoke tests — no auth needed
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
    // Pulse tests — authenticated, mobile viewport
    {
      name: 'pulse',
      testMatch: /pulse\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
