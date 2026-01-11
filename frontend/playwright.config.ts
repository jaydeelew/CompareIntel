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
  
  /* Timeout settings to prevent tests from hanging */
  timeout: process.env.CI ? 60 * 1000 : 30 * 1000, // 60s per test in CI, 30s locally
  expect: {
    timeout: 10 * 1000, // 10s for assertions
  },
  /* Global timeout for entire test run */
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : 30 * 60 * 1000, // 60min in CI, 30min locally
  
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
    // Desktop browsers
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

    // Mobile - iOS Devices
    {
      name: 'Mobile Safari - iPhone SE',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'Mobile Safari - iPhone 12',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'Mobile Safari - iPhone 13 Pro',
      use: { ...devices['iPhone 13 Pro'] },
    },
    {
      name: 'Mobile Safari - iPhone 14 Pro Max',
      use: { ...devices['iPhone 14 Pro Max'] },
    },
    {
      name: 'Mobile Safari - iPad Mini',
      use: { ...devices['iPad Mini'] },
    },
    {
      name: 'Mobile Safari - iPad Pro',
      use: { ...devices['iPad Pro'] },
    },

    // Mobile - Android Devices
    {
      name: 'Mobile Chrome - Pixel 5',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Chrome - Pixel 7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'Mobile Chrome - Galaxy S21',
      use: { ...devices['Galaxy S21'] },
    },
    {
      name: 'Mobile Chrome - Galaxy Tab S4',
      use: { ...devices['Galaxy Tab S4'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      cwd: path.resolve(__dirname),
      env: {
        // Disable reCAPTCHA in test environment
        VITE_RECAPTCHA_SITE_KEY: '',
      },
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
        // Disable reCAPTCHA in test environment - explicitly unset to override .env file
        // Use a special marker value that will be converted to None by the validator
        RECAPTCHA_SECRET_KEY: '',
        recaptcha_secret_key: '',
        // Also ensure VITE_RECAPTCHA_SITE_KEY is empty for frontend
        VITE_RECAPTCHA_SITE_KEY: '',
      },
    },
  ],
});
