# E2E Tests

This directory contains comprehensive end-to-end tests for CompareIntel using Playwright.

**📚 For complete E2E testing documentation, see: [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md#e2e-testing-with-playwright)**

> **Note:** The E2E-specific guides (`FIXTURES.md`, `SETUP.md`, `SELECTOR_GUIDE.md`) are quick references. For comprehensive documentation, see the main [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md).

## Quick Start

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

# Run tests by pattern
npx playwright test e2e/ --grep "registration"
npx playwright test e2e/ --grep "admin"
```

## Test Files

Tests are organized by user journey and functionality:

- **`01-unregistered-user-journey.spec.ts`**: First-time visitor experience, unregistered comparisons, rate limits
- **`02-registration-onboarding.spec.ts`**: User registration, login, logout flows
- **`03-authenticated-comparison.spec.ts`**: Core comparison functionality for authenticated users
- **`04-conversation-management.spec.ts`**: Conversation history, loading, deletion, follow-ups
- **`05-advanced-features.spec.ts`**: Web search, file uploads, saved model selections
- **`06-navigation-content.spec.ts`**: Navigation, SEO pages, scroll behavior
- **`07-admin-functionality.spec.ts`**: Admin panel, user management, system statistics
- **`08-mobile-platforms.spec.ts`**: Mobile breakpoints, touch gestures, responsive UI
- **`09-results-display-regression.spec.ts`**: Results grids, tabs, follow-up mode, breakout
- **`10-accessibility.spec.ts`**: WCAG-oriented checks on core flows and landmarks
- **`11-pwa-features.spec.ts`**: Install prompt / PWA-oriented behavior

CI runs a **focused Chromium subset** (`ci.yml`) matching these journeys (see `--grep=` in **E2E Tests — Critical User Flows**); full **`npm run test:e2e`** still exercises every spec locally and in cross-browser jobs.

## E2E Test Coverage

Comprehensive E2E test coverage includes:

- ✅ **Unregistered User Journey**: First-time visitor experience, exploration, rate limits
- ✅ **Registration & Onboarding**: Account creation, email verification, first comparison
- ✅ **Authenticated Comparison**: Model selection, streaming results, follow-up conversations
- ✅ **Conversation Management**: Saving, viewing, loading, deleting conversations
- ✅ **Advanced Features**: Web search, file uploads, model selection management
- ✅ **Navigation & Content**: Footer navigation, SEO pages, scroll behavior
- ✅ **Mobile platforms**: Narrow viewports and mobile-specific UX
- ✅ **Results display regressions**: Multi-model grids, tabs, breakout, follow-ups
- ✅ **Accessibility (WCAG-focused)**: Landmarks and keyboard-critical paths (`10-accessibility.spec.ts`)
- ✅ **PWA-oriented flows**: Progressive web app prompts and related UI (`11-pwa-features.spec.ts`)
- ✅ **Admin Functionality**: User management, filtering, statistics, user creation/updates

All tests are written from a user experience perspective, focusing on real user workflows and interactions.

## Documentation

- **[Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md)** - **Complete E2E testing documentation** (recommended)
  - [E2E Test Setup](../../docs/testing/FRONTEND_TESTING.md#e2e-test-setup) - Setup and configuration
  - [E2E Test Fixtures](../../docs/testing/FRONTEND_TESTING.md#e2e-test-fixtures) - Comprehensive fixture guide
  - [E2E Test Selectors](../../docs/testing/FRONTEND_TESTING.md#e2e-test-selectors) - Selector best practices
  - [E2E Best Practices](../../docs/testing/FRONTEND_TESTING.md#e2e-best-practices) - Testing guidelines

**Quick Reference Guides** (see main doc for comprehensive info):

- **[Fixtures Guide](./FIXTURES.md)** - Quick reference for test fixtures
- **[Setup Guide](./SETUP.md)** - Quick reference for test setup
- **[Selector Guide](./SELECTOR_GUIDE.md)** - Quick reference for selectors

For detailed information on writing E2E tests, Playwright configuration, and best practices, see the [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md).
