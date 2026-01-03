# Frontend Testing Guide

Comprehensive guide for testing the CompareIntel frontend, including unit tests, integration tests, E2E tests, setup, running tests, writing new tests, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Setup and Prerequisites](#setup-and-prerequisites)
4. [Running Tests](#running-tests)
5. [Test Configuration](#test-configuration)
6. [Writing Tests](#writing-tests)
7. [Test Utilities](#test-utilities)
8. [E2E Testing with Playwright](#e2e-testing-with-playwright)
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
└── e2e/                        # E2E tests with Playwright
    ├── auth.spec.ts
    ├── comparison.spec.ts
    ├── conversation.spec.ts
    ├── admin.spec.ts
    ├── websearch.spec.ts       # Web search E2E tests
    └── SELECTOR_GUIDE.md
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

No additional environment setup required - tests work out of the box!

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
npx playwright test e2e/auth.spec.ts

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

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('user can register and login', async ({ page }) => {
  // Navigate to registration page
  await page.goto('/register');
  
  // Fill registration form
  await page.fill('[data-testid="register-email-input"]', 'test@example.com');
  await page.fill('[data-testid="register-password-input"]', 'Password123!');
  await page.fill('[data-testid="register-name-input"]', 'Test User');
  
  // Submit form
  await page.click('[data-testid="register-submit-button"]');
  
  // Wait for redirect
  await page.waitForURL('/login');
  
  // Login
  await page.fill('[data-testid="login-email-input"]', 'test@example.com');
  await page.fill('[data-testid="login-password-input"]', 'Password123!');
  await page.click('[data-testid="login-submit-button"]');
  
  // Verify login success
  await expect(page.getByText('Welcome')).toBeVisible();
});
```

### E2E Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Comparison Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/');
  });

  test('should create comparison', async ({ page }) => {
    // Test implementation
  });

  test('should handle errors', async ({ page }) => {
    // Test error scenarios
  });
});
```

### Using Test Steps

```typescript
test('complex workflow', async ({ page }) => {
  await test.step('Navigate to page', async () => {
    await page.goto('/comparison');
  });

  await test.step('Fill form', async () => {
    await page.fill('[data-testid="input"]', 'test');
  });

  await test.step('Submit', async () => {
    await page.click('[data-testid="submit"]');
  });
});
```

### E2E Test Files

- **`auth.spec.ts`**: User registration → verification → comparison flow
- **`comparison.spec.ts`**: Anonymous user flow and rate limit handling
- **`conversation.spec.ts`**: Conversation management (create, view, delete)
- **`admin.spec.ts`**: Admin user management functionality
- **`websearch.spec.ts`**: Web search feature testing (enable, search execution, results display)

### E2E Best Practices

1. **Use data-testid attributes**: Add `data-testid` to key UI elements
2. **Wait for network idle**: Use `await page.waitForLoadState('networkidle')` after navigation
3. **Meaningful test names**: Describe what the test verifies
4. **Keep tests independent**: Each test should run in isolation
5. **Use test fixtures**: For authenticated state, use Playwright fixtures

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

**Location**: `src/__tests__/hooks/useWebSearch.test.ts`, `src/__tests__/services/webSearchService.test.ts`, `e2e/websearch.spec.ts`

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

**Location**: `src/__tests__/services/authService.test.ts`, `e2e/auth.spec.ts`

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

**Location**: `src/__tests__/hooks/useConversationHistory.test.ts`, `src/__tests__/services/conversationService.test.ts`

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

**Location**: `src/__tests__/services/adminService.test.ts`, `e2e/admin.spec.ts`

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

- Use `data-testid` attributes for stable selectors
- Wait for network idle after navigation
- Keep tests independent
- Use test fixtures for authenticated state
- Test critical user flows, not everything

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
