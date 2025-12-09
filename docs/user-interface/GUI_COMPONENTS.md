# GUI Components Reference

This document lists all GUI components for the CompareIntel website, divided into Main and Admin sections. Components are listed alphabetically within each section.

## Main Section

### AuthModal
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Displays login or register form in a modal. Handles switching between login, register, and forgot password modes.
- **Filename:** `frontend/src/components/auth/AuthModal.tsx`
- **Line Range:** 1-113

### Button
- **Parent Element:** Used throughout the application (shared component)
- **Description:** Reusable Button component with consistent styling. Supports variants (primary, secondary, danger, ghost), sizes, loading states, and icons.
- **Filename:** `frontend/src/components/shared/Button.tsx`
- **Line Range:** 1-93

### ComparisonForm
- **Parent Element:** `App.tsx` (Hero component)
- **Description:** Handles the main input area, history, and controls for model comparisons. Includes textarea, history dropdown, and submission controls.
- **Filename:** `frontend/src/components/comparison/ComparisonForm.tsx`
- **Line Range:** 1-888

### ConversationItem
- **Parent Element:** `ConversationList` component
- **Description:** Displays a single conversation in history. Shows truncated prompt, date, and number of models used.
- **Filename:** `frontend/src/components/conversation/ConversationItem.tsx`
- **Line Range:** 1-75

### ConversationList
- **Parent Element:** `ComparisonForm` component
- **Description:** Displays a list of conversations. Renders multiple ConversationItem components with scrolling support.
- **Filename:** `frontend/src/components/conversation/ConversationList.tsx`
- **Line Range:** 1-76

### CreditBalance
- **Parent Element:** `UserMenu` component
- **Description:** Displays credit balance with progress bar and reset date. Supports compact and full variants. Shows credits remaining, allocated, and used.
- **Filename:** `frontend/src/components/credits/CreditBalance.tsx`
- **Line Range:** 1-169

### DoneSelectingCard
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Floating card that appears when models need to be confirmed. Shows a checkmark button to confirm selection.
- **Filename:** `frontend/src/components/shared/DoneSelectingCard.tsx`
- **Line Range:** 1-27

### ErrorBoundary
- **Parent Element:** `App.tsx` (wraps ComparisonForm and ResultsDisplay)
- **Description:** Error Boundary component to catch React errors and display fallback UI. Provides error details in development mode.
- **Filename:** `frontend/src/components/shared/ErrorBoundary.tsx`
- **Line Range:** 1-108

### Footer
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Application footer with support contact information and copyright notice.
- **Filename:** `frontend/src/components/Footer.tsx`
- **Line Range:** 1-36

### ForgotPasswordForm
- **Parent Element:** `AuthModal` component
- **Description:** Allows users to request a password reset email. Shows success message after email is sent.
- **Filename:** `frontend/src/components/auth/ForgotPasswordForm.tsx`
- **Line Range:** 1-160

### FullPageLoadingSpinner
- **Parent Element:** Used throughout the application (shared component)
- **Description:** Full-page loading spinner component for page-level loading states.
- **Filename:** `frontend/src/components/shared/LoadingSpinner.tsx`
- **Line Range:** 65-73

### Hero
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Main hero section with title, capabilities, and comparison form. Displays capability tiles (Natural Language, Code Generation, Formatted Math) with tooltips.
- **Filename:** `frontend/src/components/layout/Hero.tsx`
- **Line Range:** 1-108

### Input
- **Parent Element:** Used throughout the application (shared component)
- **Description:** Reusable Input component with label, error, and helper text support. Includes icon support.
- **Filename:** `frontend/src/components/shared/Input.tsx`
- **Line Range:** 36-117

### LazyImage
- **Parent Element:** Used throughout the application (shared component)
- **Description:** LazyImage component with lazy loading, modern format support (WebP/AVIF), and progressive loading with blur placeholder.
- **Filename:** `frontend/src/components/shared/LazyImage.tsx`
- **Line Range:** 1-292

### LatexRenderer
- **Parent Element:** `MessageBubble` component, `ResultCard` component
- **Description:** Comprehensive LaTeX/Markdown renderer. Handles AI model responses with unified delimiter detection, KaTeX rendering, code block preservation, and markdown formatting.
- **Filename:** `frontend/src/components/LatexRenderer.tsx`
- **Line Range:** 1-2885

### LoadingSpinner
- **Parent Element:** Used throughout the application (shared component)
- **Description:** Reusable LoadingSpinner component. Supports different sizes (small, medium, large) and modern animation style.
- **Filename:** `frontend/src/components/shared/LoadingSpinner.tsx`
- **Line Range:** 25-60

### LoginForm
- **Parent Element:** `AuthModal` component
- **Description:** Login form component with email and password fields. Includes password visibility toggle and forgot password link.
- **Filename:** `frontend/src/components/auth/LoginForm.tsx`
- **Line Range:** 1-148

### MainLayout
- **Parent Element:** Not currently used directly
- **Description:** Main layout wrapper for the application content. Provides consistent main element structure.
- **Filename:** `frontend/src/components/layout/MainLayout.tsx`
- **Line Range:** 1-33

### MessageBubble
- **Parent Element:** `ResultCard` component
- **Description:** Displays individual conversation messages. Shows user or assistant messages with timestamps and supports formatted/raw rendering modes.
- **Filename:** `frontend/src/components/conversation/MessageBubble.tsx`
- **Line Range:** 1-119

### MockModeBanner
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Displays a banner when mock mode is active. Shows different messages for authenticated users vs anonymous users.
- **Filename:** `frontend/src/components/layout/MockModeBanner.tsx`
- **Line Range:** 1-23

### Navigation
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Main navigation bar with logo, brand, and auth actions. Includes Sign In/Sign Up buttons or UserMenu for authenticated users, and admin toggle for admins.
- **Filename:** `frontend/src/components/layout/Navigation.tsx`
- **Line Range:** 1-98

### ProtectedRoute
- **Parent Element:** Not currently used directly
- **Description:** Protected Route component that redirects to login if user is not authenticated. Shows loading state during auth check.
- **Filename:** `frontend/src/components/auth/ProtectedRoute.tsx`
- **Line Range:** 1-49

### RegisterForm
- **Parent Element:** `AuthModal` component
- **Description:** Registration form component with email, password, and confirm password fields. Includes password validation, reCAPTCHA support, and password visibility toggles.
- **Filename:** `frontend/src/components/auth/RegisterForm.tsx`
- **Line Range:** 1-413

### ResetPassword
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Reset Password page component that handles password reset from email link. Wraps ResetPasswordForm in a modal overlay.
- **Filename:** `frontend/src/components/auth/ResetPassword.tsx`
- **Line Range:** 1-105

### ResetPasswordForm
- **Parent Element:** `ResetPassword` component
- **Description:** Allows users to set a new password using a reset token. Includes password validation and confirmation.
- **Filename:** `frontend/src/components/auth/ResetPasswordForm.tsx`
- **Line Range:** 1-198

### ResultCard
- **Parent Element:** `ResultsDisplay` component
- **Description:** Displays model comparison results. Shows model name, conversation messages, formatted/raw tabs, screenshot/copy buttons, and close button.
- **Filename:** `frontend/src/components/comparison/ResultCard.tsx`
- **Line Range:** 1-190

### ResultsDisplay
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Displays comparison results grid. Shows metadata (models completed, failed, processing time) and renders multiple ResultCard components.
- **Filename:** `frontend/src/components/comparison/ResultsDisplay.tsx`
- **Line Range:** 1-144

### StreamingIndicator
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Shows loading state during model comparison. Displays number of models being processed and includes cancel button.
- **Filename:** `frontend/src/components/comparison/StreamingIndicator.tsx`
- **Line Range:** 1-66

### TermsOfService
- **Parent Element:** `App.tsx` (Route component)
- **Description:** Legal document that protects the operator of compareIntel.com from liability. Displays terms of service with sections covering use license, user accounts, disclaimers, etc.
- **Filename:** `frontend/src/components/TermsOfService.tsx`
- **Line Range:** 1-218

### Textarea
- **Parent Element:** Used throughout the application (shared component)
- **Description:** Reusable Textarea component with label, error, and helper text support.
- **Filename:** `frontend/src/components/shared/Input.tsx`
- **Line Range:** 147-212

### UserMenu
- **Parent Element:** `Navigation` component, `Header` component
- **Description:** Displays user info and dropdown menu when authenticated. Shows email, subscription tier, credit balance, usage stats, and menu items (Dashboard, Upgrade Plan, Settings, Contact Support, Sign Out).
- **Filename:** `frontend/src/components/auth/UserMenu.tsx`
- **Line Range:** 1-637

### VerificationBanner
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Displays banner prompting users to verify their email address. Includes resend verification email button with cooldown timer.
- **Filename:** `frontend/src/components/auth/VerificationBanner.tsx`
- **Line Range:** 1-197

### VerifyEmail
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Handles email verification from email link. Shows success or error banner based on verification result. Auto-hides after successful verification.
- **Filename:** `frontend/src/components/auth/VerifyEmail.tsx`
- **Line Range:** 1-327

## Admin Section

### AdminPanel
- **Parent Element:** `App.tsx` (AppContent component)
- **Description:** Main admin panel component with tabs for Users, Models, Logs, and Analytics. Provides user management, model configuration, action log viewing, and visitor analytics.
- **Filename:** `frontend/src/components/admin/AdminPanel.tsx`
- **Line Range:** 1-2671

