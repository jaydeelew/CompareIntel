# Frontend Testing Guide

Comprehensive guide for testing the CompareIntel frontend, including unit tests, integration tests, E2E tests, setup, running tests, writing new tests, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Setup and Prerequisites](#setup-and-prerequisites)
   - [Install Dependencies](#install-dependencies)
   - [Install Playwright Browsers](#install-playwright-browsers)
   - [Environment Setup](#environment-setup)
   - [E2E Test Setup](#e2e-test-setup)
4. [Running Tests](#running-tests)
5. [Test Configuration](#test-configuration)
6. [Writing Tests](#writing-tests)
7. [Test Utilities](#test-utilities)
8. [E2E Testing with Playwright](#e2e-testing-with-playwright)
   - [Writing E2E Tests](#writing-e2e-tests)
   - [E2E Test Structure](#e2e-test-structure)
   - [Using Test Steps](#using-test-steps)
   - [E2E Test Files](#e2e-test-files)
   - [E2E Test Fixtures](#e2e-test-fixtures)
   - [E2E Test Selectors](#e2e-test-selectors)
   - [E2E Best Practices](#e2e-best-practices)
9. [Testing Major Features](#testing-major-features)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Overview

The frontend test suite uses multiple testing tools:

- **Vitest**: Unit and integration tests (components, hooks, services)
- **React Testing Library**: Component and hook testing
- **Playwright**: End-to-end (E2E) browser tests

### Test Coverage Goals

- **Target**: 70%+ coverage for all frontend code
- **Critical Paths**: Components, hooks, services, user interactions, web search
- **Edge Cases**: Error handling, loading states, empty states, boundary conditions

### Testing Framework Stack

- **Vitest** 2.0+ - Fast test runner (Jest-compatible)
- **@testing-library/react** - React component testing
- **@testing-library/jest-dom** - DOM matchers
- **@testing-library/user-event** - User interaction simulation
- **@playwright/test** - E2E browser testing
- **@vitest/ui** - Interactive test UI
- **@vitest/coverage-v8** - Coverage reporting

## Test Structure

```
frontend/
├── src/
│   └── __tests__/              # Unit and integration tests
│       ├── setup.ts             # Vitest setup and global configuration
│       ├── vitest.d.ts          # TypeScript type definitions
│       ├── components/         # Component tests
│       │   ├── comparison/
│       │   │   ├── ComparisonForm.test.tsx
│       │   │   └── ResultCard.test.tsx
│       │   ├── conversation/
│       │   │   ├── MessageBubble.test.tsx
│       │   │   └── ConversationItem.test.tsx
│       │   └── shared/
│       │       ├── Button.test.tsx
│       │       ├── Input.test.tsx
│       │       └── LoadingSpinner.test.tsx
│       ├── hooks/              # Custom hook tests
│       │   ├── useModelComparison.test.ts
│       │   ├── useModelComparison.edge-cases.test.ts
│       │   ├── useModelSelection.test.ts
│       │   ├── useRateLimitStatus.test.ts
│       │   └── useWebSearch.test.ts          # Web search hook tests
│       ├── services/           # Service layer tests
│       │   ├── compareService.test.ts
│       │   ├── compareService.edge-cases.test.ts
│       │   ├── authService.test.ts
│       │   ├── adminService.test.ts
│       │   └── webSearchService.test.ts     # Web search service tests
│       ├── utils/              # Test utilities and helpers
│       │   ├── test-utils.tsx   # Custom render functions
│       │   ├── test-factories.ts # Mock data factories
│       │   ├── mock-api-responses.ts # API response mocks
│       │   └── mock-services.ts # Service mocks
│       └── config/             # Configuration tests
│           └── rendererConfigs.test.ts
└── e2e/                        # E2E tests with Playwright (organized by user journey)
    ├── 01-unregistered-user-journey.spec.ts    # First-time visitor experience
    ├── 02-registration-onboarding.spec.ts    # Registration and login flows
    ├── 03-authenticated-comparison.spec.ts   # Core comparison functionality
    ├── 04-conversation-management.spec.ts    # Conversation history and management
    ├── 05-advanced-features.spec.ts          # Web search, file uploads, saved selections
    ├── 06-navigation-content.spec.ts         # Navigation and SEO pages
    ├── 07-admin-functionality.spec.ts       # Admin panel and user management
    ├── fixtures.ts                           # Test fixtures (auth, navigation, etc.)
    ├── global-setup.ts                      # Global test setup
    ├── README.md                            # E2E test quick reference
    ├── FIXTURES.md                          # Fixtures quick reference (see main doc for details)
    ├── SELECTOR_GUIDE.md                    # Selector quick reference (see main doc for details)
    └── SETUP.md                             # Setup quick reference (see main doc for details)
```

## Setup and Prerequisites

### Install Dependencies

```bash
cd frontend
npm install
```

Required testing packages (already in package.json):
- `vitest`: Test runner
- `@testing-library/react`: React component testing
- `@testing-library/jest-dom`: DOM matchers
- `@testing-library/user-event`: User interaction simulation
- `@playwright/test`: E2E testing
- `@vitest/ui`: Vitest UI
- `@vitest/coverage-v8`: Coverage reporting

### Install Playwright Browsers

For E2E tests, install Playwright browsers:

```bash
npx playwright install
```

### Environment Setup

No additional environment setup required for unit/integration tests - they work out of the box!

### E2E Test Setup

E2E tests require additional setup to run the frontend and backend servers. The Playwright configuration automatically handles this, but understanding the setup is helpful for troubleshooting.

#### Playwright Configuration

The Playwright configuration (`playwright.config.ts`) automatically:

1. **Starts the frontend dev server** on `http://localhost:5173`
2. **Starts the backend server** on `http://localhost:8000`
3. **Runs global setup** to create test users if needed
4. **Configures test environment** with proper timeouts and retries

#### Global Setup

The `global-setup.ts` file runs once before all tests to:

- Wait for backend to be ready
- Create test users (admin and regular users) if they don't exist
- Set up any required test data

#### Requirements

**1. Python 3.11+ Installed**

The backend server requires Python. Verify installation:

```bash
python3 --version  # Should be 3.11 or higher
```

**2. Backend Dependencies**

Backend dependencies should be installed:

```bash
cd backend
pip install -r requirements.txt
```

**3. Environment Variables (Optional)**

You can override default test credentials via environment variables:

```bash
# Test User Credentials (tier-based users)
export TEST_FREE_EMAIL="free@test.com"
export TEST_FREE_PASSWORD="Test12345678/"
export TEST_STARTER_EMAIL="starter@test.com"
export TEST_STARTER_PASSWORD="Test12345678/"
export TEST_STARTER_PLUS_EMAIL="starter_plus@test.com"
export TEST_STARTER_PLUS_PASSWORD="Test12345678/"
export TEST_PRO_EMAIL="pro@test.com"
export TEST_PRO_PASSWORD="Test12345678/"
export TEST_PRO_PLUS_EMAIL="pro_plus@test.com"
export TEST_PRO_PLUS_PASSWORD="Test12345678/"

# Admin Credentials
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="AdminPassword123!"

# Base URL (if different from default)
export PLAYWRIGHT_BASE_URL="http://localhost:3000"
```

#### How E2E Tests Work

1. **Playwright starts both servers** (frontend and backend) automatically
2. **Global setup runs** to ensure test users exist
3. **Tests execute** using fixtures or manual login
4. **Servers shut down** automatically after tests complete

#### Common E2E Setup Issues

**Backend Not Starting**

**Symptom**: Comparison/websearch tests fail with timeout errors

**Solution**:
- Ensure Python 3.11+ is installed and in PATH
- Ensure backend dependencies are installed
- Check that port 8000 is not already in use

**Test Users Don't Exist**

**Symptom**: Authentication tests fail

**Solution**:
- Global setup should create users automatically
- If it fails, users can be created manually via registration in tests
- Admin role must be set manually in backend (users created via registration are regular users)

**Port Conflicts**

**Symptom**: Tests fail to start servers

**Solution**:
- Stop any existing servers on ports 5173 (frontend) or 8000 (backend)
- Or set `reuseExistingServer: true` in config (already set for local development)

#### Manual Setup (If Needed)

If automatic setup fails, you can manually:

1. **Start backend**:
   ```bash
   cd backend
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

2. **Start frontend** (in another terminal):
   ```bash
   cd frontend
   npm run dev
   ```

3. **Run tests**:
   ```bash
   cd frontend
   npm run test:e2e
   ```

## Running Tests

### Unit and Integration Tests (Vitest)

```bash
# Run tests in watch mode (default)
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test src/__tests__/components/MyComponent.test.tsx

# Run tests matching pattern
npm run test MyComponent
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests in UI mode (interactive)
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Run specific E2E test file
npx playwright test e2e/01-unregistered-user-journey.spec.ts
npx playwright test e2e/03-authenticated-comparison.spec.ts

# Run tests matching pattern
npx playwright test e2e/ --grep "registration"
npx playwright test e2e/ --grep "admin"

# Run tests in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
```

### Advanced Vitest Options

```bash
# Run tests matching pattern
npm run test -- --grep "MyComponent"

# Run tests in specific file
npm run test -- src/__tests__/hooks/useMyHook.test.ts

# Update snapshots
npm run test -- --update

# Run tests with verbose output
npm run test -- --reporter=verbose

# Run tests in parallel (default)
npm run test -- --threads

# Run tests sequentially
npm run test -- --no-threads
```

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# Coverage reports are generated in:
# - Terminal output
# - coverage/ directory (HTML report)
# - coverage/coverage.json (JSON report)
```

## Test Configuration

### Vitest Configuration

Configuration is in `frontend/vite.config.ts`:

```typescript
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './src/__tests__/setup.ts',
  css: true,
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    'e2e/**', // E2E tests excluded from Vitest
  ],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: [
      'node_modules/',
      'src/__tests__/',
      'e2e/**',
      '**/*.d.ts',
      '**/*.config.*',
    ],
  },
}
```

### Playwright Configuration

Configuration is in `frontend/playwright.config.ts`:

- **Base URL**: `http://localhost:5173` (or `PLAYWRIGHT_BASE_URL` env var)
- **Web Server**: Automatically starts dev server before tests
- **Browsers**: Chromium, Firefox, WebKit
- **Retries**: 2 retries on CI, 0 locally
- **Screenshots/Videos**: Captured on failure

## Writing Tests

### Component Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderWithProviders } from '@/__tests__/utils';
import MyComponent from '../components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const { user } = renderWithProviders(<MyComponent />);
    
    const button = screen.getByRole('button', { name: 'Click me' });
    await user.click(button);
    
    expect(screen.getByText('Clicked!')).toBeInTheDocument();
  });

  it('should render with authentication', () => {
    const mockUser = createMockUser({ email: 'test@example.com' });
    
    renderWithProviders(<MyComponent />, {
      authState: { user: mockUser, isAuthenticated: true },
    });
    
    expect(screen.getByText('Welcome, test@example.com')).toBeInTheDocument();
  });
});
```

### Hook Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '../hooks/useMyHook';

describe('useMyHook', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(0);
  });

  it('should update state', () => {
    const { result } = renderHook(() => useMyHook());
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.value).toBe(1);
  });
});
```

### Service Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareService } from '../services/compareService';

describe('compareService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch comparison results', async () => {
    const mockResponse = {
      results: [{ model: 'gpt-4', response: 'Test response' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await compareService.compare({
      input: 'test',
      models: ['gpt-4'],
    });

    expect(result.results).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await expect(
      compareService.compare({ input: 'test', models: ['gpt-4'] })
    ).rejects.toThrow();
  });
});
```

### Testing with Mocks

```typescript
import { vi } from 'vitest';
import { setupMockServices } from '@/__tests__/utils';

describe('MyComponent', () => {
  beforeEach(() => {
    setupMockServices();
  });

  it('should use mocked service', async () => {
    // Service is automatically mocked
    render(<MyComponent />);
    // Test implementation
  });
});
```

### Testing Async Operations

```typescript
import { waitFor } from '@testing-library/react';

it('should handle async data loading', async () => {
  render(<MyComponent />);
  
  // Wait for async operation
  await waitFor(() => {
    expect(screen.getByText('Loaded!')).toBeInTheDocument();
  });
});
```

## Test Utilities

Test utilities are in `src/__tests__/utils/` and can be imported from `@/__tests__/utils`.

### Custom Render Function

`renderWithProviders` wraps components with necessary providers:

```typescript
import { renderWithProviders, createMockUser } from '@/__tests__/utils';

const mockUser = createMockUser({ email: 'test@example.com' });

const { getByText } = renderWithProviders(<MyComponent />, {
  authState: { user: mockUser, isAuthenticated: true },
  route: '/dashboard',
});
```

**Options:**
- `authState`: Initial authentication state
- `route`: Custom route path
- `withRouter`: Wrap with Router (default: true)
- `withAuth`: Wrap with AuthProvider (default: true)

### Test Data Factories

Create mock data with sensible defaults:

```typescript
import {
  createMockUser,
  createMockAdminUser,
  createMockCompareResponse,
  createMockModel,
  createMockWebSearchResult,  // Web search mock data
} from '@/__tests__/utils';

const user = createMockUser({ subscription_tier: 'premium' });
const admin = createMockAdminUser();
const response = createMockCompareResponse(['gpt-4', 'claude-3']);
const model = createMockModel({ id: 'gpt-4', name: 'GPT-4', supports_web_search: true });
const searchResult = createMockWebSearchResult({ query: 'test query' });
```

**Available Factories:**
- `createMockUser`, `createMockAdminUser`, `createMockPremiumUser`
- `createMockModel`, `createMockModelsByProvider`
- `createMockConversationMessage`, `createMockStoredMessage`
- `createMockCompareResponse`, `createMockRateLimitStatus`
- `createMockStreamEvent`, `createMockStreamEvents`
- `createMockWebSearchResult`, `createMockWebSearchResults` - Web search mocks
- And more...

### Mock API Responses

Mock response data for all endpoints:

```typescript
import { mockCompareResponse, mockLoginResponse, mockWebSearchResponse } from '@/__tests__/utils';

const compareResponse = mockCompareResponse(payload, {
  metadata: customMetadata,
});
const loginResponse = mockLoginResponse({ email: 'user@example.com' });
const webSearchResponse = mockWebSearchResponse({ query: 'test query' });
```

### Mock Services

Mock service implementations:

```typescript
import { vi } from 'vitest';
import { mockCompare, mockGetRateLimitStatus, mockWebSearch } from '@/__tests__/utils';

vi.mock('../../services/compareService', () => ({
  compare: mockCompare,
  getRateLimitStatus: mockGetRateLimitStatus,
}));

vi.mock('../../services/webSearchService', () => ({
  search: mockWebSearch,
}));
```

Or use `setupMockServices()` in `beforeEach`:

```typescript
import { setupMockServices } from '@/__tests__/utils';

beforeEach(() => {
  setupMockServices();
});
```

## E2E Testing with Playwright

> **Note**: E2E tests were restructured in January 2025 to focus on **user journeys** rather than technical features. Tests are now organized by user workflows (unregistered → registered → advanced features) for better maintainability and user-centric testing.

### Writing E2E Tests

E2E tests are written from a **user experience perspective**, focusing on real user workflows:

```typescript
import { test, expect } from './fixtures'; // Use fixtures for authenticated state

// Example: Unregistered user journey
test('Unregistered user can perform a comparison', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Enter comparison prompt
  const inputField = page.getByTestId('comparison-input-textarea');
  await inputField.fill('What is artificial intelligence?');
  
  // Select models (unregistered users limited to 3)
  const modelCheckboxes = page.locator('input[type="checkbox"]');
  const modelsToSelect = Math.min(3, await modelCheckboxes.count());
  for (let i = 0; i < modelsToSelect; i++) {
    await modelCheckboxes.nth(i).check();
  }
  
  // Submit comparison
  await page.getByTestId('comparison-submit-button').click();
  
  // Wait for results
  const results = page.locator('[data-testid^="result-card-"], .result-card');
  await expect(results.first()).toBeVisible({ timeout: 30000 });
});

// Example: Using fixtures for authenticated tests
test('User can perform a complete comparison', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in and ready
  const inputField = authenticatedPage.getByTestId('comparison-input-textarea');
  await inputField.fill('Explain machine learning.');
  
  // Select multiple models
  const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]');
  await modelCheckboxes.first().check();
  
  // Submit and verify results
  await authenticatedPage.getByTestId('comparison-submit-button').click();
  const results = authenticatedPage.locator('.result-card');
  await expect(results.first()).toBeVisible({ timeout: 30000 });
});
```

### E2E Test Structure

Tests are organized by user journey with clear, descriptive test names:

```typescript
import { test, expect } from './fixtures';

test.describe('Authenticated User Comparison Flow', () => {
  test('User can perform a complete comparison', async ({ authenticatedPage }) => {
    await test.step('Enter comparison prompt', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea');
      await inputField.fill('What are the key differences between supervised and unsupervised learning?');
    });

    await test.step('Select multiple models', async () => {
      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]');
      await modelCheckboxes.first().check();
      await modelCheckboxes.nth(1).check();
    });

    await test.step('Submit and verify results', async () => {
      await authenticatedPage.getByTestId('comparison-submit-button').click();
      const results = authenticatedPage.locator('.result-card');
      await expect(results.first()).toBeVisible({ timeout: 30000 });
    });
  });
});
```

### Using Test Steps

Break complex user workflows into logical steps:

```typescript
test('User can register and perform first comparison', async ({ page }) => {
  await test.step('Register new account', async () => {
    await page.goto('/');
    await page.getByTestId('nav-sign-up-button').click();
    await page.waitForSelector('[data-testid="auth-modal"]');
    await page.locator('input[type="email"]').first().fill('test@example.com');
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.getByTestId('register-submit-button').click();
    await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 });
  });

  await test.step('Perform first comparison', async () => {
    const inputField = page.getByTestId('comparison-input-textarea');
    await inputField.fill('What is Python?');
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByTestId('comparison-submit-button').click();
    const results = page.locator('.result-card');
    await expect(results.first()).toBeVisible({ timeout: 30000 });
  });
});
```

### E2E Test Files (User Journey Focused)

Tests are organized by user journey and real-world workflows:

- **`01-unregistered-user-journey.spec.ts`**: First-time visitor experience, unregistered comparisons, rate limits, sign-up prompts
- **`02-registration-onboarding.spec.ts`**: User registration, email verification, login/logout flows, first comparison
- **`03-authenticated-comparison.spec.ts`**: Core comparison functionality, model selection, streaming results, follow-up conversations
- **`04-conversation-management.spec.ts`**: Conversation history, saving, loading, deleting, continuing conversations
- **`05-advanced-features.spec.ts`**: Web search functionality, file uploads, saved model selections, model filtering
- **`06-navigation-content.spec.ts`**: Footer navigation, SEO content pages, scroll behavior, consistent navigation
- **`07-admin-functionality.spec.ts`**: Admin panel access, user management, filtering, statistics, user CRUD operations

### E2E Test Fixtures

Fixtures provide reusable setup code that prepares your test environment. Instead of writing login/navigation code in every test, you use fixtures that handle this automatically.

The `fixtures.ts` file provides comprehensive test fixtures for common scenarios. Import fixtures in your tests:

```typescript
import { test, expect } from './fixtures';

test('My test', async ({ freeTierPage }) => {
  // freeTierPage is already logged in as a free tier user
  await freeTierPage.getByTestId('comparison-input-textarea').fill('Test input')
});
```

#### Authentication Fixtures

**Subscription Tier Fixtures**

Use these when you need to test tier-specific functionality:

```typescript
// Free tier user (default registered user)
test('Free tier test', async ({ freeTierPage }) => {
  // Already logged in as free tier user
});

// Starter tier user
test('Starter tier test', async ({ starterTierPage }) => {
  // Already logged in as starter tier user
  // Note: User must be upgraded to starter tier in backend/admin
});

// Starter Plus tier user
test('Starter Plus tier test', async ({ starterPlusTierPage }) => {
  // Already logged in as starter_plus tier user
});

// Pro tier user
test('Pro tier test', async ({ proTierPage }) => {
  // Already logged in as pro tier user
});

// Pro Plus tier user
test('Pro Plus tier test', async ({ proPlusTierPage }) => {
  // Already logged in as pro_plus tier user
});
```

**User Role Fixtures**

```typescript
// Admin user (already on admin panel)
test('Admin test', async ({ adminPage }) => {
  // Already logged in as admin and on /admin page
  const userList = adminPage.locator('[data-testid="user-list"]')
  await expect(userList).toBeVisible()
});

// Moderator user
test('Moderator test', async ({ moderatorPage }) => {
  // Already logged in as moderator
  // Note: User must have moderator role set in backend/admin
});

// Generic authenticated user (free tier)
test('Authenticated test', async ({ authenticatedPage }) => {
  // Already logged in as free tier user
  // Use when tier doesn't matter
});
```

**Unregistered User Fixture**

```typescript
// Unregistered (unauthenticated) user
test('Unregistered test', async ({ unregisteredPage }) => {
  // All cookies and storage cleared
  // No user menu visible
  const signUpButton = unregisteredPage.getByTestId('nav-sign-up-button')
  await expect(signUpButton).toBeVisible()
});
```

#### Page Navigation Fixtures

Use these when you need to start on a specific page:

```typescript
// Comparison page (home page with form ready)
test('Comparison test', async ({ comparisonPage }) => {
  // Already on / with comparison form visible
  await comparisonPage.getByTestId('comparison-input-textarea').fill('Test')
});

// Admin panel page
test('Admin panel test', async ({ adminPanelPage }) => {
  // Already on /admin as admin user
});

// Content pages
test('About page test', async ({ aboutPage }) => {
  // Already on /about
});

test('FAQ page test', async ({ faqPage }) => {
  // Already on /faq
});

test('Features page test', async ({ featuresPage }) => {
  // Already on /features
});

test('Privacy page test', async ({ privacyPage }) => {
  // Already on /privacy-policy
});

test('Terms page test', async ({ termsPage }) => {
  // Already on /terms-of-service
});
```

#### Test Data Helpers

Generate test data dynamically:

```typescript
test('Test with generated data', async ({ page, testData }) => {
  const email = testData.generateEmail('user')
  // email = "user-1234567890-1234@example.com"

  const password = testData.generatePassword()
  // password = "TestPassword123!"

  const comparisonInput = testData.generateComparisonInput()
  // Random comparison prompt from predefined list
});
```

#### API Helpers

Wait for API calls or mock responses:

```typescript
test('Test with API wait', async ({ page, apiHelpers }) => {
  // Wait for a specific API call to complete
  await apiHelpers.waitForApiCall('/api/compare-stream', 30000)

  // Or wait for a pattern
  await apiHelpers.waitForApiCall(/\/api\/models/, 10000)
});

test('Test with mocked API', async ({ page, apiHelpers }) => {
  // Mock an API response
  await apiHelpers.mockApiResponse('/api/models', {
    models: [{ id: 'test-model', name: 'Test Model' }],
  })

  // Now API calls to /api/models will return mocked data
});
```

#### Combining Fixtures

You can use multiple fixtures in a single test:

```typescript
test('Complex test', async ({ freeTierPage, testData, apiHelpers }) => {
  // freeTierPage is already logged in
  const input = testData.generateComparisonInput()

  await apiHelpers.waitForApiCall('/api/compare-stream')
  await freeTierPage.getByTestId('comparison-input-textarea').fill(input)
  // ... rest of test
});
```

#### Fixture Examples

**Example 1: Testing Free Tier Limits**

```typescript
import { test, expect } from './fixtures';

test('Free tier has 3 model limit', async ({ freeTierPage }) => {
  // Already logged in as free tier user
  const modelCheckboxes = freeTierPage.locator('input[type="checkbox"]')
  const count = await modelCheckboxes.count()

  // Free tier can select up to 3 models
  expect(count).toBeLessThanOrEqual(3)
});
```

**Example 2: Testing Admin Functionality**

```typescript
import { test, expect } from './fixtures';

test('Admin can view user list', async ({ adminPage }) => {
  // Already on admin panel
  const userList = adminPage.locator('[data-testid="user-list"]')
  await expect(userList).toBeVisible()

  const userRows = adminPage.locator('tbody tr')
  const count = await userRows.count()
  expect(count).toBeGreaterThan(0)
});
```

**Example 3: Testing Unregistered User Flow**

```typescript
import { test, expect } from './fixtures';

test('Unregistered user sees sign up prompt', async ({ unregisteredPage }) => {
  // Already unregistered (no auth)
  const signUpButton = unregisteredPage.getByTestId('nav-sign-up-button')
  await expect(signUpButton).toBeVisible()

  const comparisonInput = unregisteredPage.getByTestId('comparison-input-textarea')
  await expect(comparisonInput).toBeVisible()
});
```

**Example 4: Testing with Generated Data**

```typescript
import { test, expect } from './fixtures';

test('User can register with unique email', async ({ page, testData }) => {
  const uniqueEmail = testData.generateEmail('newuser')

  await page.goto('/')
  await page.getByTestId('nav-sign-up-button').click()
  await page.locator('input[type="email"]').first().fill(uniqueEmail)
  await page.locator('input[type="password"]').first().fill(testData.generatePassword())
  await page.getByTestId('register-submit-button').click()

  // Verify registration succeeded
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 })
});
```

**Example 5: Testing Comparison Flow**

```typescript
import { test, expect } from './fixtures';

test('User can perform comparison', async ({ comparisonPage, testData }) => {
  // Already on comparison page
  const input = testData.generateComparisonInput()

  await comparisonPage.getByTestId('comparison-input-textarea').fill(input)
  await comparisonPage.getByRole('button', { name: /compare|submit/i }).click()

  // Wait for results
  const results = comparisonPage.locator('[data-testid^="result-card-"]')
  await expect(results.first()).toBeVisible({ timeout: 60000 })
});
```

#### Fixture Best Practices

1. **Use the most specific fixture**: If you need a pro tier user, use `proTierPage` instead of `authenticatedPage`
2. **Combine fixtures**: Use `testData` and `apiHelpers` with authentication fixtures
3. **Don't duplicate setup**: If a fixture already does what you need, use it instead of writing custom setup
4. **Use unregistered fixture**: Use `unregisteredPage` when testing unauthenticated flows
5. **Override credentials**: Use environment variables for CI/CD or different test environments

#### Fixture Troubleshooting

**Fixture fails to authenticate**

- Check that test users exist in the database
- Verify backend is running
- Check environment variables if using custom credentials
- Look at browser console for errors

**Tier-specific fixtures don't work**

- Ensure users are upgraded to the correct tier in backend/admin
- Check that tier upgrade was successful
- Verify user's `subscription_tier` field in database

**Admin fixture fails**

- Ensure admin user exists with `is_admin=true` and `role='admin'`
- Verify admin user can access `/admin` route
- Check backend logs for authorization errors

### E2E Test Selectors

`data-testid` attributes provide stable selectors that don't break when CSS classes change. This guide explains how to add `data-testid` attributes to components and use them in tests.

#### Why Use data-testid?

`data-testid` attributes provide:

- **Stable selectors** that don't break when CSS classes change
- **Clear intent** - explicitly marked for testing
- **Better maintainability** - easier to find and update test selectors

#### Adding data-testid Attributes

Add `data-testid` attributes to key UI elements. Here are examples for common components:

**Navigation Buttons**

```tsx
// File: frontend/src/components/layout/Navigation.tsx
<button
  className="nav-button-text"
  onClick={onSignInClick}
  data-testid="nav-sign-in-button"
>
  Sign In
</button>
<button
  className="nav-button-primary"
  onClick={onSignUpClick}
  data-testid="nav-sign-up-button"
>
  Sign Up
</button>
```

**Auth Modal**

```tsx
// File: frontend/src/components/auth/AuthModal.tsx
<div className="auth-modal-overlay" data-testid="auth-modal-overlay">
  <div className="auth-modal" data-testid="auth-modal">
    <button
      className="auth-modal-close"
      onClick={handleClose}
      aria-label="Close"
      data-testid="auth-modal-close"
    >
      ×
    </button>
  </div>
</div>
```

**Login Form**

```tsx
// File: frontend/src/components/auth/LoginForm.tsx
<input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="your@email.com"
  required
  autoComplete="email"
  disabled={isLoading}
  data-testid="login-email-input"
/>

<input
  id="password"
  type={showPassword ? 'text' : 'password'}
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  placeholder="Password"
  required
  autoComplete="current-password"
  disabled={isLoading}
  data-testid="login-password-input"
/>

<button
  type="submit"
  className="auth-submit-button"
  disabled={isLoading}
  data-testid="login-submit-button"
>
  {isLoading ? 'Signing in...' : 'Sign In'}
</button>
```

**Register Form**

```tsx
// File: frontend/src/components/auth/RegisterForm.tsx
<input
  id="register-email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="your@email.com"
  required
  autoComplete="email"
  disabled={isLoading}
  data-testid="register-email-input"
/>

<input
  id="register-password"
  type={showPassword ? 'text' : 'password'}
  value={password}
  onChange={handlePasswordChange}
  placeholder="Password"
  required
  autoComplete="new-password"
  disabled={isLoading}
  data-testid="register-password-input"
/>

<input
  id="register-confirm-password"
  type={showConfirmPassword ? 'text' : 'password'}
  value={confirmPassword}
  onChange={(e) => setConfirmPassword(e.target.value)}
  placeholder="Confirm Password"
  required
  autoComplete="new-password"
  disabled={isLoading}
  data-testid="register-confirm-password-input"
/>

<button
  type="submit"
  className="auth-submit-button"
  disabled={isLoading}
  data-testid="register-submit-button"
>
  {isLoading ? 'Creating account...' : 'Create Account'}
</button>
```

**Comparison Form**

```tsx
// File: frontend/src/components/comparison/ComparisonForm.tsx
<textarea
  ref={textareaRef}
  value={input}
  onChange={(e) => setInput(e.target.value)}
  placeholder="Let's get started..."
  className="hero-input-textarea"
  rows={1}
  data-testid="comparison-input-textarea"
/>

<button
  onClick={onSubmitClick}
  disabled={/* ... */}
  className="textarea-icon-button submit-button"
  data-testid="comparison-submit-button"
>
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" />
  </svg>
</button>
```

**Model Selection**

```tsx
// File: frontend/src/App.tsx
<input
  type="checkbox"
  checked={isSelected}
  disabled={isDisabled}
  onChange={() => !isDisabled && handleModelToggle(model.id)}
  className="model-checkbox"
  data-testid={`model-checkbox-${model.id}`}
/>

<button
  className="provider-header"
  onClick={() => toggleDropdown(provider)}
  data-testid={`provider-dropdown-${provider}`}
>
  {/* ... */}
</button>
```

**Results Display**

```tsx
// File: frontend/src/App.tsx (where results are rendered)
<div
  className="model-card"
  data-testid={`result-card-${modelId}`}
>
  {/* ... */}
</div>
```

**User Menu**

```tsx
// File: frontend/src/components/layout/UserMenu.tsx
<button
  className="user-menu-button"
  onClick={handleMenuToggle}
  data-testid="user-menu-button"
>
  {/* ... */}
</button>

<button
  onClick={handleLogout}
  data-testid="logout-button"
>
  Logout
</button>
```

#### Using Selectors in Tests

Update E2E tests to use `data-testid` attributes:

**Before (fragile selectors):**

```typescript
const signUpButton = page.getByRole('button', { name: /sign up|register|create account/i })
await signUpButton.click()

await page.fill('input[type="email"]', testEmail)
await page.fill('input[type="password"]', testPassword)
```

**After (stable selectors):**

```typescript
const signUpButton = page.getByTestId('nav-sign-up-button')
await signUpButton.click()

await page.getByTestId('register-email-input').fill(testEmail)
await page.getByTestId('register-password-input').fill(testPassword)
await page.getByTestId('register-confirm-password-input').fill(testPassword)
await page.getByTestId('register-submit-button').click()
```

**Comparison Test Example:**

```typescript
// Before:
const inputField = page.locator('textarea, input[type="text"]').first()
await inputField.fill(testInput)

const modelCheckboxes = page.locator('input[type="checkbox"]')
await modelCheckboxes.first().check()

const compareButton = page.getByRole('button', { name: /compare|submit|run/i })
await compareButton.click()

// After:
await page.getByTestId('comparison-input-textarea').fill(testInput)

// Option 1: Select by specific model ID
await page.getByTestId('model-checkbox-openai/gpt-4').check()

// Option 2: Select first available model checkbox
const firstCheckbox = page.locator('[data-testid^="model-checkbox-"]').first()
await firstCheckbox.check()

await page.getByTestId('comparison-submit-button').click()

// Wait for results
await expect(page.locator('[data-testid^="result-card-"]').first()).toBeVisible({ timeout: 30000 })
```

#### Quick Reference: Common Selectors

| Element                 | data-testid                 | Usage in Tests                                    |
| ----------------------- | --------------------------- | ------------------------------------------------- |
| Sign In Button          | `nav-sign-in-button`        | `page.getByTestId('nav-sign-in-button')`          |
| Sign Up Button          | `nav-sign-up-button`        | `page.getByTestId('nav-sign-up-button')`          |
| Login Email Input       | `login-email-input`         | `page.getByTestId('login-email-input')`           |
| Login Password Input    | `login-password-input`      | `page.getByTestId('login-password-input')`        |
| Login Submit            | `login-submit-button`       | `page.getByTestId('login-submit-button')`         |
| Register Email Input    | `register-email-input`      | `page.getByTestId('register-email-input')`        |
| Register Password Input | `register-password-input`   | `page.getByTestId('register-password-input')`     |
| Register Submit         | `register-submit-button`    | `page.getByTestId('register-submit-button')`      |
| Comparison Textarea     | `comparison-input-textarea` | `page.getByTestId('comparison-input-textarea')`   |
| Comparison Submit       | `comparison-submit-button`  | `page.getByTestId('comparison-submit-button')`    |
| Model Checkbox          | `model-checkbox-{modelId}`  | `page.getByTestId('model-checkbox-openai/gpt-4')` |
| Result Card             | `result-card-{modelId}`     | `page.getByTestId('result-card-openai/gpt-4')`    |
| User Menu               | `user-menu-button`          | `page.getByTestId('user-menu-button')`            |
| Logout Button           | `logout-button`             | `page.getByTestId('logout-button')`               |

#### Selector Best Practices

1. **Use descriptive names**: `comparison-input-textarea` is better than `input-1`
2. **Include context**: `login-email-input` is better than `email-input`
3. **Be consistent**: Use kebab-case for all `data-testid` values
4. **Don't overuse**: Only add `data-testid` to elements that tests actually need to interact with
5. **Prefer semantic selectors first**: Use `getByRole`, `getByText`, `getByLabelText` when possible, fallback to `data-testid`
6. **Document**: Keep selector guide updated as you add new test IDs

#### Testing Your Selector Changes

1. **Add data-testid attributes** to components
2. **Update test selectors** to use `getByTestId()`
3. **Run tests** to verify:
   ```bash
   npm run test:e2e
   ```
4. **Fix any issues** - if selectors don't work, check:
   - Is the `data-testid` attribute correctly added?
   - Is the element visible when the test runs?
   - Are there timing issues (add `await page.waitForLoadState('networkidle')`)?

### E2E Best Practices

1. **User-Centric Approach**: Write tests from the user's perspective, focusing on what users see and do
2. **Use data-testid attributes**: Add `data-testid` to key UI elements for stable selectors (see [E2E Test Selectors](#e2e-test-selectors) section)
3. **Wait for network idle**: Use `await page.waitForLoadState('networkidle')` after navigation
4. **Meaningful test names**: Describe what the test verifies from a user perspective
5. **Keep tests independent**: Each test should run in isolation
6. **Use test fixtures**: Leverage fixtures from `fixtures.ts` for authenticated state and common scenarios (see [E2E Test Fixtures](#e2e-test-fixtures) section)
7. **Organize by user journey**: Group tests by user workflows rather than technical features
8. **Graceful error handling**: Handle cases where features might not be available (e.g., backend not running)
9. **Use test steps**: Break complex workflows into logical steps using `test.step()`
10. **Prefer semantic selectors**: Use `getByRole`, `getByText`, `getByLabelText` when possible, fallback to `data-testid`

## Testing Major Features

### 1. Model Comparison Testing

**Location**: `src/__tests__/components/comparison/`, `src/__tests__/hooks/useModelComparison.test.ts`

**Coverage**:
- Comparison form rendering
- Model selection
- Input validation
- Streaming response handling
- Result card display
- Error handling
- Loading states
- Token estimation

**Example**:
```typescript
describe('ComparisonForm', () => {
  it('should render comparison form', () => {
    renderWithProviders(<ComparisonForm />);
    expect(screen.getByPlaceholderText(/enter your prompt/i)).toBeInTheDocument();
  });

  it('should handle model selection', async () => {
    const { user } = renderWithProviders(<ComparisonForm />);
    const modelCheckbox = screen.getByLabelText('GPT-4');
    await user.click(modelCheckbox);
    expect(modelCheckbox).toBeChecked();
  });
});
```

### 2. Web Search Testing

**Location**: `src/__tests__/hooks/useWebSearch.test.ts`, `src/__tests__/services/webSearchService.test.ts`, `e2e/05-advanced-features.spec.ts`

**Coverage**:
- Web search toggle functionality
- Web search enabled state management
- Search provider availability checking
- Model web search capability detection
- Search execution during comparison
- Search result display
- Error handling (provider unavailable, search failures)
- Integration with comparison flow

**Example**:
```typescript
describe('useWebSearch', () => {
  it('should toggle web search enabled state', () => {
    const { result } = renderHook(() => useWebSearch());
    
    expect(result.current.enabled).toBe(false);
    
    act(() => {
      result.current.toggle();
    });
    
    expect(result.current.enabled).toBe(true);
  });

  it('should check if models support web search', () => {
    const { result } = renderHook(() => useWebSearch());
    
    const models = [
      { id: 'gpt-4', supports_web_search: true },
      { id: 'claude-3', supports_web_search: false },
    ];
    
    expect(result.current.hasWebSearchSupport(models)).toBe(true);
  });
});
```

### 3. Authentication Testing

**Location**: `src/__tests__/services/authService.test.ts`, `e2e/02-registration-onboarding.spec.ts`

**Coverage**:
- Login flow
- Registration flow
- Logout functionality
- Token refresh
- Password reset
- Email verification
- Protected route handling

**Example**:
```typescript
describe('authService', () => {
  it('should login user', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        refresh_token: 'refresh',
      }),
    });

    const result = await authService.login('test@example.com', 'password');
    expect(result.access_token).toBe('token');
  });
});
```

### 4. Conversation History Testing

**Location**: `src/__tests__/hooks/useConversationHistory.test.ts`, `src/__tests__/services/conversationService.test.ts`, `e2e/04-conversation-management.spec.ts`

**Coverage**:
- Conversation list retrieval
- Conversation creation
- Conversation deletion
- Per-model conversation tracking
- Conversation message storage
- Follow-up question handling

**Example**:
```typescript
describe('useConversationHistory', () => {
  it('should load conversation history', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useConversationHistory('gpt-4'));
    
    await waitForNextUpdate();
    
    expect(result.current.conversations).toHaveLength(2);
  });
});
```

### 5. Rate Limiting Testing

**Location**: `src/__tests__/hooks/useRateLimitStatus.test.ts`

**Coverage**:
- Rate limit status fetching
- Credit balance display
- Rate limit warnings
- Over-limit handling
- Reset time display

**Example**:
```typescript
describe('useRateLimitStatus', () => {
  it('should fetch rate limit status', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useRateLimitStatus());
    
    await waitForNextUpdate();
    
    expect(result.current.creditsRemaining).toBeGreaterThan(0);
  });
});
```

### 6. File Upload Testing

**Location**: `src/__tests__/components/comparison/ComparisonForm.test.tsx`

**Coverage**:
- File selection
- File type validation
- File size validation
- File content extraction
- File display in input
- File removal

**Example**:
```typescript
describe('File Upload', () => {
  it('should handle file selection', async () => {
    const { user } = renderWithProviders(<ComparisonForm />);
    const fileInput = screen.getByLabelText(/upload file/i);
    
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    await user.upload(fileInput, file);
    
    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });
});
```

### 7. Admin Panel Testing

**Location**: `src/__tests__/services/adminService.test.ts`, `e2e/07-admin-functionality.spec.ts`

**Coverage**:
- User list retrieval
- User update functionality
- Role management
- Mock mode toggling
- Statistics display

**Example**:
```typescript
describe('adminService', () => {
  it('should fetch user list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    });

    const result = await adminService.getUsers();
    expect(result.users).toBeDefined();
  });
});
```

## Best Practices

### 1. Test Organization

- **One test file per component/hook/service**: `MyComponent.test.tsx` for `MyComponent.tsx`
- **Group related tests**: Use `describe` blocks for related functionality
- **Descriptive names**: Test names should clearly describe what is tested
- **AAA Pattern**: Arrange, Act, Assert

### 2. Test Behavior, Not Implementation

- Test what the component does, not how it does it
- Focus on user-visible behavior
- Avoid testing internal state unless necessary
- Test user interactions, not implementation details

### 3. Use User-Centric Queries

Prefer queries that users would use:

```typescript
// ✅ Good - user-centric
screen.getByRole('button', { name: 'Submit' });
screen.getByLabelText('Email');
screen.getByText('Welcome');

// ❌ Avoid - implementation details
screen.getByTestId('submit-button');
screen.getByClassName('btn-primary');
```

### 4. Test Edge Cases

- Empty states
- Loading states
- Error states
- Boundary conditions
- Invalid inputs
- Network failures

### 5. Keep Tests Simple

- One assertion per test when possible
- Test one thing at a time
- Use helper functions for complex setup
- Keep test data minimal

### 6. Mock External Dependencies

- Mock API calls
- Mock browser APIs (localStorage, fetch, etc.)
- Mock third-party libraries
- Use test utilities for common mocks

### 7. Async Testing

- Use `waitFor` for async operations
- Use `findBy*` queries for elements that appear asynchronously
- Handle loading states properly
- Test error scenarios

### 8. E2E Test Best Practices

- **User-Centric**: Write tests from the user's perspective, focusing on workflows
- **Use fixtures**: Leverage `fixtures.ts` for authenticated state (`authenticatedPage`, `adminPage`, etc.)
- **Stable selectors**: Use `data-testid` attributes for key elements, fallback to semantic selectors
- **Wait for network idle**: Use `await page.waitForLoadState('networkidle')` after navigation
- **Keep tests independent**: Each test should run in isolation
- **Test critical flows**: Focus on user journeys, not every technical detail
- **Organize by journey**: Group tests by user workflows (unregistered → registered → advanced)
- **Graceful handling**: Handle cases where features might not be available

## Troubleshooting

### Tests Fail with Import Errors

**Problem**: Cannot import modules in tests

**Solution**:
- Check `tsconfig.json` path aliases (`@/` should map to `src/`)
- Verify imports use correct paths
- Check that files exist at specified paths
- Restart test watcher

### Tests Fail with "Cannot find module"

**Problem**: Module resolution errors

**Solution**:
- Check `vite.config.ts` alias configuration
- Verify `tsconfig.json` paths match vite config
- Ensure file extensions are correct
- Check node_modules installation

### Component Tests Fail with Context Errors

**Problem**: "useContext must be used within Provider" errors

**Solution**:
- Use `renderWithProviders` instead of `render`
- Ensure all required providers are included
- Check provider setup in test utilities

### Async Tests Timeout

**Problem**: Tests timeout waiting for async operations

**Solution**:
- Increase timeout: `it('test', async () => { ... }, { timeout: 10000 })`
- Use `waitFor` for async elements
- Check that mocks are set up correctly
- Verify async operations complete

### E2E Tests Fail with "Target closed"

**Problem**: Browser closes unexpectedly

**Solution**:
- Ensure dev server is running or webServer config is correct
- Check that base URL is accessible
- Verify backend is running for E2E tests
- Check Playwright browser installation

### E2E Tests Timeout

**Problem**: E2E tests exceed timeout

**Solution**:
- Increase timeout in `playwright.config.ts`
- Check network conditions
- Verify backend is running
- Use `page.waitForLoadState('networkidle')` after navigation

### Coverage Not Showing

**Problem**: Coverage report shows 0%

**Solution**:
- Ensure `--coverage` flag is used
- Check coverage excludes in `vite.config.ts`
- Verify source files are in `src/` directory
- Check that `@vitest/coverage-v8` is installed

### Mock Not Working

**Problem**: Mock doesn't affect test

**Solution**:
- Ensure mock is set up before import
- Use `vi.mock` at top level
- Check mock path matches actual import path
- Verify mock is called correctly

### Playwright Selectors Not Found

**Problem**: E2E tests can't find elements

**Solution**:
- Use Playwright's codegen: `npx playwright codegen`
- Add `data-testid` attributes to key elements
- Check that elements are visible (not hidden)
- Wait for elements to appear: `await page.waitForSelector(...)`

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

---

**Last Updated**: January 2025  
**Test Framework**: Vitest 2.0+  
**E2E Framework**: Playwright  
**Coverage Tool**: @vitest/coverage-v8  
**Target Coverage**: 70%+
