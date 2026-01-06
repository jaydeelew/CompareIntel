# E2E Tests

This directory contains comprehensive end-to-end tests for CompareIntel using Playwright.

**📚 For complete E2E testing documentation, see: [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md#e2e-testing-with-playwright)**

## Quick Start

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests in UI mode (interactive)
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Run specific E2E test file
npx playwright test e2e/auth.spec.ts
npx playwright test e2e/websearch.spec.ts
```

## Test Files

- **`auth.spec.ts`**: User registration → verification → login flow
- **`comparison.spec.ts`**: Anonymous user flow and rate limit handling
- **`conversation.spec.ts`**: Conversation management (create, view, delete)
- **`admin.spec.ts`**: Admin user management functionality
- **`websearch.spec.ts`**: Web search feature testing (enable, search execution, results display)
- **`footer-navigation.spec.ts`**: Footer navigation and links

## E2E Test Coverage

Current E2E test coverage includes:

- ✅ User authentication flows
- ✅ Model comparison workflows
- ✅ Web search functionality
- ✅ Conversation history management
- ✅ Admin panel operations
- ✅ Navigation and routing

## Documentation

- **[Fixtures Guide](./FIXTURES.md)** - Complete guide to using test fixtures (authentication, navigation, test data, API helpers)
- **[Setup Guide](./SETUP.md)** - Test environment setup and configuration
- **[Selector Guide](./SELECTOR_GUIDE.md)** - Best practices for selecting elements in tests
- **[Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md)** - Complete E2E testing documentation

For detailed information on writing E2E tests, Playwright configuration, and best practices, see the [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md).
