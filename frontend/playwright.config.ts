import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright E2E Test Configuration
 * 
 * See https://playwright.dev/docs/test-configuration for more information.
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Global setup runs once before all tests */
  globalSetup: './e2e/global-setup.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
      ]
    : 'html',
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    /* WebKit disabled on Ubuntu 20.04 due to frozen browser version */
    /* Uncomment when running on a newer OS or if you need Safari testing */
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      cwd: path.resolve(__dirname),
    },
    {
      command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      url: 'http://localhost:8000/docs',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      cwd: path.resolve(__dirname, '../backend'),
      env: {
        SECRET_KEY: process.env.SECRET_KEY || 'test-secret-key-for-e2e-testing-only-32chars',
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-api-key-for-e2e-testing-only',
        ENVIRONMENT: 'development',
        DATABASE_URL: process.env.DATABASE_URL || 'sqlite:///./test-e2e.db',
        MAIL_USERNAME: '',
        MAIL_PASSWORD: '',
        MAIL_FROM: '',
      },
    },
  ],
});
