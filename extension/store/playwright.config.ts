import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.ts',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  outputDir: './test-results',
})
