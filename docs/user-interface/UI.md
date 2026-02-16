# UI Components Reference

All GUI components for CompareIntel, organized by Main and Admin sections.

## Main Section

### AuthModal
- **Parent:** `App.tsx` (AppContent)
- **Description:** Login or register form in a modal. Handles login, register, and forgot password modes.
- **File:** `frontend/src/components/auth/AuthModal.tsx`

### Button
- **Parent:** Used throughout (shared)
- **Description:** Reusable Button with variants (primary, secondary, danger, ghost), sizes, loading states, icons.
- **File:** `frontend/src/components/shared/Button.tsx`

### ComparisonForm
- **Parent:** `App.tsx` (Hero)
- **Description:** Main input area, history, and controls for model comparisons.
- **File:** `frontend/src/components/comparison/ComparisonForm.tsx`

### ConversationItem
- **Parent:** `ConversationList`
- **Description:** Single conversation in history. Truncated prompt, date, model count.
- **File:** `frontend/src/components/conversation/ConversationItem.tsx`

### ConversationList
- **Parent:** `ComparisonForm`
- **Description:** List of conversations with scrolling. Renders `ConversationItem` components.
- **File:** `frontend/src/components/conversation/ConversationList.tsx`

### CreditBalance
- **Parent:** `UserMenu`
- **Description:** Credit balance, progress bar, reset date. Compact and full variants.
- **File:** `frontend/src/components/credits/CreditBalance.tsx`

### DoneSelectingCard
- **Parent:** `App.tsx` (AppContent)
- **Description:** Floating card for model selection confirmation.
- **File:** `frontend/src/components/shared/DoneSelectingCard.tsx`

### ErrorBoundary
- **Parent:** `App.tsx` (wraps ComparisonForm and ResultsDisplay)
- **Description:** Catches React errors and displays fallback UI.
- **File:** `frontend/src/components/shared/ErrorBoundary.tsx`

### Footer
- **Parent:** `App.tsx` (AppContent)
- **Description:** Footer with support contact and copyright.
- **File:** `frontend/src/components/Footer.tsx`

### Hero
- **Parent:** `App.tsx` (AppContent)
- **Description:** Hero section with title, capabilities, comparison form.
- **File:** `frontend/src/components/layout/Hero.tsx`

### LatexRenderer
- **Parent:** `MessageBubble`, `ResultCard`
- **Description:** LaTeX/Markdown renderer for AI responses. KaTeX, code blocks, markdown.
- **File:** `frontend/src/components/LatexRenderer.tsx`

### MessageBubble
- **Parent:** `ResultCard`
- **Description:** User or assistant messages with timestamps, formatted/raw modes.
- **File:** `frontend/src/components/conversation/MessageBubble.tsx`

### Navigation
- **Parent:** `App.tsx` (AppContent)
- **Description:** Nav bar with logo, Sign In/Up or UserMenu, admin toggle.
- **File:** `frontend/src/components/layout/Navigation.tsx`

### ResultCard
- **Parent:** `ResultsDisplay`
- **Description:** Model comparison result. Messages, formatted/raw tabs, screenshot/copy.
- **File:** `frontend/src/components/comparison/ResultCard.tsx`

### ResultsDisplay
- **Parent:** `App.tsx` (AppContent)
- **Description:** Results grid. Metadata (models, processing time), multiple ResultCards.
- **File:** `frontend/src/components/comparison/ResultsDisplay.tsx`

### UserMenu
- **Parent:** `Navigation`, `Header`
- **Description:** User info dropdown: email, tier, credits, Dashboard, Settings, Sign Out.
- **File:** `frontend/src/components/auth/UserMenu.tsx`

Additional components: ForgotPasswordForm, Input, LazyImage, LoadingSpinner, LoginForm, RegisterForm, ResetPassword, ResetPasswordForm, StreamingIndicator, Textarea, VerificationBanner, VerifyEmail, MockModeBanner.

## Admin Section

### AdminPanel
- **Parent:** `App.tsx` (AppContent)
- **Description:** Admin panel with tabs: Users, Models, Logs, Analytics, Search Providers, Performance.
- **File:** `frontend/src/components/admin/AdminPanel.tsx`
