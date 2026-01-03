# Frontend Tests

This directory contains comprehensive unit and integration tests for the CompareIntel frontend.

**📚 For complete testing documentation, see: [Frontend Testing Guide](../../../docs/testing/FRONTEND_TESTING.md)**

## Quick Start

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run specific test file
npm run test ComparisonForm
npm run test websearch
```

## Test Structure

- **Component Tests** (`components/`): Test React components
  - Comparison (`comparison/ComparisonForm.test.tsx`)
  - Conversation (`conversation/`)
  - Shared components (`shared/`)

- **Hook Tests** (`hooks/`): Test custom React hooks
  - Model comparison (`useModelComparison.test.ts`, `useModelComparison.edge-cases.test.ts`)
  - Model selection (`useModelSelection.test.ts`)
  - Rate limiting (`useRateLimitStatus.test.ts`)
  - Conversation history (`useConversationHistory.test.ts`)
  - Browser fingerprint (`useBrowserFingerprint.test.ts`)
  - Debounce (`useDebounce.test.ts`)

- **Service Tests** (`services/`): Test service layer
  - Comparison service (`compareService.test.ts`, `compareService.edge-cases.test.ts`)
  - Comparison service web search (`compareService.websearch.test.ts`)
  - Auth service (`authService.test.ts`)
  - Admin service (`adminService.test.ts`)
  - Config service (`configService.test.ts`)
  - Conversation service (`conversationService.test.ts`)
  - Models service (`modelsService.test.ts`)

- **Utility Tests** (`utils/`): Test utility functions
  - Code block preservation, validation, formatting, etc.

- **Config Tests** (`config/`): Test configuration
  - Renderer configs (`rendererConfigs.test.ts`)

## Test Coverage

Current test coverage includes:

- ✅ Component rendering and interactions
- ✅ Model comparison functionality
- ✅ Web search integration
- ✅ Authentication flows
- ✅ Conversation history management
- ✅ Rate limiting and credit display
- ✅ File upload handling
- ✅ Admin functionality
- ✅ Edge cases and error handling

For detailed information on running tests, writing new tests, test utilities, E2E testing, and best practices, see the [Frontend Testing Guide](../../../docs/testing/FRONTEND_TESTING.md).
