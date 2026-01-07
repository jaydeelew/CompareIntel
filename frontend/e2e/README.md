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
npx playwright test e2e/01-anonymous-user-journey.spec.ts
npx playwright test e2e/03-authenticated-comparison.spec.ts

# Run tests by pattern
npx playwright test e2e/ --grep "registration"
npx playwright test e2e/ --grep "admin"
```

## Test Files

Tests are organized by user journey and functionality:

- **`01-anonymous-user-journey.spec.ts`**: First-time visitor experience, anonymous comparisons, rate limits
- **`02-registration-onboarding.spec.ts`**: User registration, login, logout flows
- **`03-authenticated-comparison.spec.ts`**: Core comparison functionality for authenticated users
- **`04-conversation-management.spec.ts`**: Conversation history, loading, deletion, follow-ups
- **`05-advanced-features.spec.ts`**: Web search, file uploads, saved model selections
- **`06-navigation-content.spec.ts`**: Navigation, SEO pages, scroll behavior
- **`07-admin-functionality.spec.ts`**: Admin panel, user management, system statistics

## E2E Test Coverage

Comprehensive E2E test coverage includes:

- ✅ **Anonymous User Journey**: First-time visitor experience, exploration, rate limits
- ✅ **Registration & Onboarding**: Account creation, email verification, first comparison
- ✅ **Authenticated Comparison**: Model selection, streaming results, follow-up conversations
- ✅ **Conversation Management**: Saving, viewing, loading, deleting conversations
- ✅ **Advanced Features**: Web search, file uploads, model selection management
- ✅ **Navigation & Content**: Footer navigation, SEO pages, scroll behavior
- ✅ **Admin Functionality**: User management, filtering, statistics, user creation/updates

All tests are written from a user experience perspective, focusing on real user workflows and interactions.

## Documentation

- **[Fixtures Guide](./FIXTURES.md)** - Complete guide to using test fixtures (authentication, navigation, test data, API helpers)
- **[Setup Guide](./SETUP.md)** - Test environment setup and configuration
- **[Selector Guide](./SELECTOR_GUIDE.md)** - Best practices for selecting elements in tests
- **[Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md)** - Complete E2E testing documentation

For detailed information on writing E2E tests, Playwright configuration, and best practices, see the [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md).
