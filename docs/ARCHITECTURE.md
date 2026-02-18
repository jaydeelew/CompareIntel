# CompareIntel Architecture

**Last Updated:** January 21, 2026

This document provides a comprehensive overview of the CompareIntel codebase architecture, designed to help developers quickly understand how the application is organized and how different parts interact.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Directory Structure](#2-directory-structure)
3. [Component Architecture](#3-component-architecture)
4. [Custom Hooks](#4-custom-hooks)
5. [Data Flow](#5-data-flow)
6. [State Management Patterns](#6-state-management-patterns)
7. [API Integration](#7-api-integration)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Project Overview

CompareIntel is a full-stack web application that enables users to compare responses from 50+ AI language models simultaneously. The application is built with:

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** FastAPI + SQLAlchemy + Pydantic
- **Database:** PostgreSQL (production) / SQLite (development)
- **External API:** OpenRouter for AI model access

### Key Features

| Feature | Description |
|---------|-------------|
| Real-time Streaming | SSE-based streaming for simultaneous model responses |
| Conversation History | Per-model context for follow-up questions |
| Credit System | Tiered subscriptions with daily/monthly credit limits |
| Authentication | JWT-based auth with HTTP-only cookie storage |
| Export | PDF, Markdown, JSON, and HTML export options |
| Web Search | Optional web search integration for supported models |

---

## 2. Directory Structure

```
CompareIntel/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── config/             # Settings, constants, tier limits
│   │   ├── middleware/         # Profiling, custom middleware
│   │   ├── routers/            # API route handlers
│   │   │   ├── api.py          # Core comparison endpoints
│   │   │   ├── auth.py         # Authentication endpoints
│   │   │   ├── admin.py        # Admin panel endpoints
│   │   │   └── dev.py          # Development-only endpoints
│   │   ├── search/             # Web search integration
│   │   ├── services/           # Business logic services
│   │   ├── utils/              # Helper functions
│   │   ├── auth.py             # JWT and password utilities
│   │   ├── credit_manager.py   # Credit allocation and tracking
│   │   ├── database.py         # SQLAlchemy engine and session
│   │   ├── models.py           # SQLAlchemy ORM models
│   │   ├── model_runner.py     # OpenRouter API integration
│   │   ├── rate_limiting.py    # Usage limits and tracking
│   │   └── schemas.py          # Pydantic request/response schemas
│   ├── tests/                  # Backend test suite
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/         # React components (see §3)
│   │   ├── contexts/           # React Context providers
│   │   ├── hooks/              # Custom React hooks (see §4)
│   │   ├── pages/              # Page-level components
│   │   │   └── MainPage.tsx    # Main comparison page (contains comparison flow)
│   │   ├── services/           # API client and services
│   │   ├── styles/             # CSS modules and global styles
│   │   ├── types/              # TypeScript type definitions
│   │   ├── utils/              # Utility functions
│   │   ├── config/             # Frontend configuration
│   │   ├── App.tsx             # Application shell (routing setup)
│   │   └── main.tsx            # Application entry point
│   ├── e2e/                    # Playwright E2E tests
│   └── package.json
│
├── nginx/                      # Nginx configurations
├── docs/                       # Documentation
│   └── development/            # Development-related docs
├── docker-compose.yml          # Development setup
└── docker-compose.prod.yml     # Production setup
```

---

## 3. Component Architecture

### 3.1 Component Hierarchy

```
App.tsx (Application shell - routing only)
├── ErrorBoundary
│   └── AuthProvider (Context)
│       └── Routes
│           └── Layout (shared layout wrapper)
│               ├── Outlet (renders route content)
│               │   ├── MainPage (comparison flow - contains all state/hooks)
│               │   │   ├── Navigation
│               │   │   ├── Hero
│               │   │   ├── ComparisonForm (prompt input)
│               │   │   ├── ModelsSection (model selection)
│               │   │   │   ├── ModelsSectionHeader
│               │   │   │   └── Provider dropdowns with model checkboxes
│               │   │   ├── LoadingSection (during streaming)
│               │   │   └── ResultsDisplay (comparison results)
│               │   │       ├── ResultsSectionHeader
│               │   │       └── ResultCard[] (one per model)
│               │   ├── About, Features, FAQ, etc. (static pages)
│               │   └── AdminPanel (admin-only)
│               └── Footer
```

### 3.2 Component Categories

#### Page Components (`pages/`)

| Component | Purpose |
|-----------|---------|
| `MainPage` | Main comparison page containing all comparison flow logic, state, and hooks |

#### Layout Components (`components/layout/`)

| Component | Purpose |
|-----------|---------|
| `Layout` | Shared layout wrapper with Footer and scroll-to-top behavior |
| `Navigation` | Top navigation bar with auth controls |
| `Hero` | Landing page hero section with value proposition |
| `MockModeBanner` | Development banner showing mock mode status |
| `InstallPrompt` | PWA installation prompt |

#### Comparison Flow Components (`components/comparison/`)

| Component | Purpose |
|-----------|---------|
| `ComparisonForm` | Prompt textarea with file attachment, speech input |
| `ComparisonView` | Wrapper for conversation history display |
| `ModelsSection` | Model selection grid with provider grouping |
| `ModelsSectionHeader` | Header with "Select All" and tier badges |
| `LoadingSection` | Animated loading state during API calls |
| `ResultsDisplay` | Container for all model response cards |
| `ResultsSectionHeader` | Header with export, copy, scroll-lock controls |
| `ResultCard` | Individual model response with markdown rendering |
| `StreamingIndicator` | Visual indicator for active streaming |

#### Auth Components (`components/auth/`)

| Component | Purpose |
|-----------|---------|
| `AuthModal` | Login/Register modal dialog |
| `VerifyEmail` | Email verification page |
| `VerificationBanner` | Prompt to verify email |
| `ResetPassword` | Password reset flow |

#### Tutorial System (`components/tutorial/`)

| Component | Purpose |
|-----------|---------|
| `TutorialManager` | Orchestrates tutorial flow for new users |
| `TutorialOverlay` | Highlight overlays for tutorial steps |
| `TutorialTooltip` | Instructional tooltips |

#### Shared Components (`components/shared/`)

| Component | Purpose |
|-----------|---------|
| `ErrorBoundary` | React error boundary for graceful error handling |
| `LoadingSpinner` | Reusable loading indicator |
| `CreditWarningBanner` | Warning when credits are low/exhausted |
| `DoneSelectingCard` | Prompt to start comparison after model selection |

---

## 4. Custom Hooks

### 4.1 Hook Categories

The hooks are organized into three categories based on their responsibility:

#### Data Fetching Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Access authentication context (user, login, logout) |
| `useRateLimitStatus` | Fetch and cache rate limit/credit status |
| `useConversationHistory` | Load and manage conversation history |
| `useBrowserFingerprint` | Generate/persist browser fingerprint for anonymous users |

#### UI Behavior Hooks

| Hook | Purpose |
|------|---------|
| `useScrollManagement` | Auto-scroll during streaming, scroll-lock synchronization |
| `useDoneSelectingCard` | Visibility logic for "Start Comparison" card |
| `useResponsive` | Responsive breakpoint detection |
| `useBreakpoint` | Named breakpoint hooks (isMobile, isTablet, etc.) |
| `useTouchDevice` | Detect touch-capable devices |
| `useTutorial` | Tutorial state and step management |

#### Feature Hooks

| Hook | Purpose |
|------|---------|
| `useComparisonStreaming` | Core streaming logic (SSE connection, state updates, timeouts) |
| `useModelManagement` | Model selection with tier restrictions |
| `useModelSelection` | Low-level model selection state |
| `useModelComparison` | Comparison request orchestration |
| `useExport` | PDF/Markdown/JSON/HTML export functionality |
| `useScreenshotCopy` | Screenshot capture and clipboard copy |
| `useCreditsRemaining` | Credit calculation for different user types |
| `useFileHandling` | File upload parsing (PDF, Word, text) |
| `useSpeechRecognition` | Voice input via Web Speech API |
| `useConversationManager` | Conversation CRUD operations |
| `useSavedModelSelections` | Persist model selection presets |
| `useSavedSelectionManager` | Load/save selection preset management |
| `useCreditWarningManager` | Low credit warning state |
| `useTabCoordination` | Cross-tab state synchronization |

### 4.2 Key Hook Details

#### `useComparisonStreaming`

The most complex hook, handling the entire comparison flow:

```
User submits prompt
    │
    ▼
Input Validation
├── Token limit check
├── Credit availability check
└── Email verification check (authenticated users)
    │
    ▼
SSE Connection Setup
├── Create AbortController for cancellation
├── Open streaming connection to /api/compare-stream
└── Initialize per-model state
    │
    ▼
Stream Processing Loop
├── Parse SSE events (start, chunk, done, complete, error)
├── Update conversation state per chunk
├── Handle keepalive events (reset timeout)
└── Manage timeout for unresponsive models
    │
    ▼
Completion
├── Update credit balance
├── Save to history (localStorage or API)
└── Cleanup resources
```

#### `useScrollManagement`

Manages scroll behavior for multiple result cards during streaming:

- **Auto-scroll:** Keeps latest content visible during streaming
- **Scroll Lock:** Synchronizes scroll position across all cards
- **User Override:** Pauses auto-scroll when user manually scrolls
- **Page Scroll Detection:** Prevents interference between card and page scrolling

#### `useModelManagement`

Handles model selection with business rules:

- **Tier Restrictions:** Limits model access based on subscription tier
- **Max Selection Limit:** Enforces per-tier model count limits
- **Follow-up Mode:** Restricts changes to originally selected models
- **Provider Grouping:** Toggle all models for a provider

---

## 5. Data Flow

### 5.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Authentication                        │
└─────────────────────────────────────────────────────────────────┘

1. Initial Load
   App.tsx mounts → AuthContext.useEffect
       │
       ▼
   Fetch /api/auth/me (with credentials)
       │
       ├── 200 OK → Set user state, authenticated
       │
       └── 401 Unauthorized → Try /api/auth/refresh
                                  │
                                  ├── Success → Retry /api/auth/me → Set user
                                  │
                                  └── Failure → User remains anonymous

2. Login/Register
   User submits credentials → POST /api/auth/login or /api/auth/register
       │
       ▼
   Backend sets HTTP-only cookies (access_token, refresh_token)
       │
       ▼
   Fetch /api/auth/me → Set user state

3. Token Refresh (every 14 minutes)
   AuthContext.useEffect interval → POST /api/auth/refresh
       │
       ▼
   Backend rotates tokens in cookies
```

### 5.2 Comparison/Streaming Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Comparison Flow                              │
└─────────────────────────────────────────────────────────────────┘

1. User Input
   ComparisonForm (prompt) + ModelsSection (model selection)
       │
       ▼
2. Validation (useComparisonStreaming)
   - Check input token count against limits
   - Check credit availability
   - Check email verification (if authenticated)
       │
       ▼
3. SSE Connection
   POST /api/compare-stream with:
   - input_data (prompt)
   - models[] (selected model IDs)
   - conversation_history[] (for follow-ups)
   - browser_fingerprint (for anonymous rate limiting)
       │
       ▼
4. Backend Processing (model_runner.py)
   For each model in parallel:
   - Call OpenRouter API with streaming
   - Yield SSE events: start → chunk* → done
   - After all models: complete event with metadata
       │
       ▼
5. Frontend Processing
   Parse SSE events → Update ModelConversation[] state
   - START: Create placeholder message
   - CHUNK: Append content to message
   - DONE: Mark model as complete
   - COMPLETE: Update credits, save history
       │
       ▼
6. Display
   ResultsDisplay renders ResultCard for each ModelConversation
   - Real-time content updates during streaming
   - Markdown/LaTeX/code rendering
```

### 5.3 Credit System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       Credit System                               │
└─────────────────────────────────────────────────────────────────┘

Credit Calculation:
  effective_tokens = input_tokens + (output_tokens × 2.5)
  credits_used = effective_tokens / 1000

User Types:
  ┌─────────────────┬───────────────┬─────────────────────────┐
  │ User Type       │ Credit Pool   │ Reset Schedule          │
  ├─────────────────┼───────────────┼─────────────────────────┤
  │ Anonymous       │ 50/day        │ Daily (midnight local)  │
  │ Free            │ 100/day       │ Daily (midnight local)  │
  │ Starter         │ 1,200/month   │ Monthly (billing date)  │
  │ Starter+        │ 2,500/month   │ Monthly (billing date)  │
  │ Pro             │ 5,000/month   │ Monthly (billing date)  │
  │ Pro+            │ 10,000/month  │ Monthly (billing date)  │
  └─────────────────┴───────────────┴─────────────────────────┘

Credit Check Flow:
  1. Frontend: useCreditsRemaining calculates remaining credits
  2. Submit: useComparisonStreaming validates credit availability
  3. Backend: /api/compare-stream checks and deducts credits
  4. Response: COMPLETE event includes updated credit balance
  5. Update: Frontend refreshes credit state from response
```

### 5.4 Conversation Persistence

```
┌─────────────────────────────────────────────────────────────────┐
│                   Conversation Persistence                        │
└─────────────────────────────────────────────────────────────────┘

Anonymous Users:
  - Stored in localStorage
  - Key: 'compareintel_conversations'
  - Limited history (2 conversations)
  - Cleared on browser data clear

Authenticated Users:
  - Stored in PostgreSQL via API
  - Unlimited history based on tier
  - Synced across devices
  - API endpoints:
    - GET /api/conversations (list)
    - GET /api/conversations/{id} (detail)
    - DELETE /api/conversations/{id} (delete)
    - POST /api/conversations/breakout (create breakout)

Follow-up Mode:
  - User clicks "Follow Up" on a conversation
  - Original models are locked for consistency
  - conversation_history sent with new prompt
  - Per-model filtering ensures context continuity
```

---

## 6. State Management Patterns

### 6.1 State Architecture

CompareIntel uses **local state + custom hooks** rather than global state management (Redux/Zustand). This decision was made because:

1. Most state is UI-specific and doesn't need global access
2. The comparison flow is largely linear with clear data ownership
3. Custom hooks provide good encapsulation and reusability
4. Simpler mental model for contributors

### 6.2 State Categories

| Category | Storage | Example |
|----------|---------|---------|
| **Auth State** | React Context | User, isAuthenticated |
| **UI State** | Local useState | isModalOpen, selectedModels |
| **Form State** | Local useState | input, attachedFiles |
| **Server State** | Hooks + API | conversations, creditBalance |
| **Persistent State** | localStorage | savedSelections, anonymousHistory |

### 6.3 State Flow in MainPage.tsx

The comparison flow state and logic has been moved from `App.tsx` to `MainPage.tsx` for better separation of concerns. `App.tsx` now only handles routing setup.

```typescript
// In MainPage.tsx

// Auth state from context
const { isAuthenticated, user } = useAuth()

// Core comparison state (local)
const [conversations, setConversations] = useState<ModelConversation[]>([])
const [isStreaming, setIsStreaming] = useState(false)
const [error, setError] = useState<string | null>(null)

// Model selection state (hook)
const { selectedModels, setSelectedModels } = useModelSelection()

// Credit state (hook)
const { creditBalance, refreshCredits } = useRateLimitStatus(fingerprint)

// Streaming orchestration (hook)
const { submitComparison, cancelComparison } = useComparisonStreaming({
  // Injects all required state and callbacks
})
```

### 6.4 Cross-Component Communication

Components communicate through:

1. **Props** — Direct parent-to-child data passing
2. **Callbacks** — Child-to-parent event notification
3. **Context** — Shared state (auth only)
4. **Refs** — Imperative handles for scroll position, timers

---

## 7. API Integration

### 7.1 API Client Architecture

```
frontend/src/services/
├── api/
│   ├── client.ts          # ApiClient class with fetch wrapper
│   ├── errors.ts          # Custom error classes (ApiError, PaymentRequiredError)
│   └── interceptors.ts    # Request/response interceptors
├── compareService.ts      # Comparison-related endpoints
├── authService.ts         # Authentication endpoints
├── creditService.ts       # Credit balance endpoints
├── conversationService.ts # Conversation history endpoints
├── modelsService.ts       # Model list endpoint
└── index.ts               # Re-exports all services
```

### 7.2 API Client Features

The `ApiClient` class provides:

| Feature | Description |
|---------|-------------|
| **Automatic credentials** | `credentials: 'include'` for cookie-based auth |
| **Response caching** | Configurable TTL for GET requests |
| **Error transformation** | Converts HTTP errors to typed ApiError classes |
| **Streaming support** | `stream()` method for SSE endpoints |
| **Request deduplication** | Prevents duplicate in-flight requests |

### 7.3 Key API Endpoints

#### Comparison

```
POST /api/compare-stream
  Request: { input_data, models[], conversation_history[], browser_fingerprint }
  Response: SSE stream of events

POST /api/estimate-tokens
  Request: { input_data, model_id?, conversation_history[] }
  Response: { input_tokens, total_input_tokens }
```

#### Authentication

```
POST /api/auth/login      → Sets HTTP-only cookies
POST /api/auth/register   → Creates user, sets cookies
POST /api/auth/logout     → Clears cookies
POST /api/auth/refresh    → Rotates tokens
GET  /api/auth/me         → Returns current user
```

#### Credits

```
GET /api/rate-limit-status?fingerprint=...&timezone=...
  Response: { remaining_usage, daily_limit, subscription_tier, ... }

GET /api/credit-balance
  Response: { current_balance, credits_used, billing_period_start, ... }
```

---

## 8. Testing Strategy

### 8.1 Test Pyramid

```
           ┌─────────┐
           │  E2E    │  Playwright (user journeys)
          ┌┴─────────┴┐
          │Integration│  API + Component integration
         ┌┴───────────┴┐
         │    Unit     │  Vitest (hooks, utils, services)
        ┌┴─────────────┴┐
        │     Types     │  TypeScript (compile-time checks)
        └───────────────┘
```

### 8.2 E2E Tests (Playwright)

Located in `frontend/e2e/`:

| Test File | Coverage |
|-----------|----------|
| `01-unregistered-user-journey.spec.ts` | Anonymous user flow |
| `03-authenticated-comparison.spec.ts` | Logged-in user comparisons |
| `04-conversation-management.spec.ts` | History, follow-ups, breakouts |
| `05-advanced-features.spec.ts` | Export, scroll-lock, etc. |
| `09-results-display-regression.spec.ts` | ResultsDisplay edge cases |

### 8.3 Unit Tests (Vitest)

Located alongside source files:

```
frontend/src/hooks/
├── useCreditsRemaining.ts
├── useCreditsRemaining.test.ts  # Hook unit tests
└── ...

frontend/src/components/comparison/__tests__/
├── ResultsDisplay.test.tsx      # Component tests
└── ...
```

### 8.4 Running Tests

```bash
# Frontend unit tests
cd frontend && npm run test

# Frontend E2E tests
cd frontend && npm run test:e2e

# Backend tests
cd backend && pytest

# Type checking
cd frontend && npm run type-check

# Linting
cd frontend && npm run lint
```

---

## Design Decisions

### Why No Global State Management?

We chose local state + hooks over Redux/Zustand because:

1. **Simpler onboarding:** New developers don't need to learn additional libraries
2. **Colocation:** State lives near the components that use it
3. **Type safety:** TypeScript provides excellent inference with hooks
4. **Performance:** No global re-renders; state updates are scoped

### Why HTTP-only Cookies for Auth?

Using HTTP-only cookies instead of localStorage:

1. **XSS protection:** Tokens aren't accessible to JavaScript
2. **Automatic inclusion:** Browser handles cookie attachment
3. **CSRF mitigation:** Combined with SameSite=Strict
4. **Simplified code:** No manual token management in API calls

### Why SSE Over WebSockets?

Server-Sent Events (SSE) for streaming because:

1. **Simpler protocol:** One-way communication is sufficient
2. **HTTP/2 multiplexing:** Multiple streams over one connection
3. **Automatic reconnection:** Built into EventSource API
4. **Proxy-friendly:** Works with standard HTTP infrastructure

---

## Quick Reference

### Adding a New Feature

1. **Define types** in `frontend/src/types/`
2. **Add API service** in `frontend/src/services/`
3. **Create hook** in `frontend/src/hooks/` (if stateful)
4. **Build component** in `frontend/src/components/`
5. **Write tests** alongside the code
6. **Update this doc** if architecture changes

### Key Files to Understand

| File | Purpose |
|------|---------|
| `App.tsx` | Application shell - routing setup and provider composition |
| `MainPage.tsx` | Main comparison page - contains all comparison flow state and logic |
| `Layout.tsx` | Shared layout wrapper with Footer and scroll-to-top behavior |
| `AuthContext.tsx` | Authentication state and methods |
| `useComparisonStreaming.ts` | Core streaming logic |
| `compareService.ts` | API client for comparisons |
| `backend/app/model_runner.py` | OpenRouter integration |
| `backend/app/routers/api.py` | Core API endpoints |

---

*This document is maintained as part of the Phase 2 Developer Experience initiative.*
