import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Historical draw.io UI tests are kept for reference, but the OJ now uses
  // the local canvas. Adapter-level draw.io tests remain in the unit suite.
  testIgnore: ['**/basic-shapes.spec.ts', '**/class-title-repair.spec.ts', '**/formal-drawio.spec.ts', '**/formal-safety.spec.ts', '**/multiplicity.spec.ts'],
  use: {
    baseURL: 'http://127.0.0.1:5186', browserName: 'chromium', headless: true,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: { command: 'npm run dev -- --port 5186 --strictPort', url: 'http://127.0.0.1:5186', reuseExistingServer: !process.env.CI },
})
