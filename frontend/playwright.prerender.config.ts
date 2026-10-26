import path from 'path'
import { fileURLToPath } from 'url'

import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Runs specs against the prerendered production build (`npm run build` output served by
 * `npm run preview`), not the Vite dev server. Prerender-only defects such as static HTML
 * captured from portals cannot be reproduced in dev mode.
 *
 * These specs deliberately do not use e2e/fixtures.ts: its init script sets
 * window.__PLAYWRIGHT__, which suppresses the welcome modal under test.
 *
 * Usage: npm run build && npm run test:e2e:prerender
 */
export default defineConfig({
  testDir: './e2e/prerendered',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60 * 1000,
  expect: { timeout: 15 * 1000 },
  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report-prerender' }], ['list']]
    : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome - Pixel 5', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
    cwd: path.resolve(__dirname),
  },
})
