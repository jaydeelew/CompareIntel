# E2E Test Selector Guide

> **📚 For complete selector documentation, see: [Frontend Testing Guide - E2E Test Selectors](../../docs/testing/FRONTEND_TESTING.md#e2e-test-selectors)**

This guide provides a quick reference for adding `data-testid` attributes and using selectors in tests. For comprehensive documentation with detailed examples, best practices, and troubleshooting, see the main [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md).

---

This guide walks you through adding `data-testid` attributes to your UI components and updating the E2E tests to use them.

## Why Use data-testid?

`data-testid` attributes provide:

- **Stable selectors** that don't break when CSS classes change
- **Clear intent** - explicitly marked for testing
- **Better maintainability** - easier to find and update test selectors

## Step-by-Step Process

### Step 1: Add data-testid Attributes to Components

Add `data-testid` attributes to key UI elements. Here are the most important ones:

#### 1.1 Navigation Buttons (Sign In / Sign Up)

**File:** `frontend/src/components/layout/Navigation.tsx`

```tsx
// Before:
<button
  className="nav-button-text"
  onClick={onSignInClick}
>
  Sign In
</button>
<button
  className="nav-button-primary"
  onClick={onSignUpClick}
>
  Sign Up
</button>

// After:
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

#### 1.2 Auth Modal

**File:** `frontend/src/components/auth/AuthModal.tsx`

```tsx
// Before:
<div className="auth-modal-overlay">
  <div className="auth-modal">
    <button className="auth-modal-close" onClick={handleClose} aria-label="Close">
      ×
    </button>

// After:
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
```

#### 1.3 Login Form

**File:** `frontend/src/components/auth/LoginForm.tsx`

```tsx
// Before:
<input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="your@email.com"
  required
  autoComplete="email"
  disabled={isLoading}
/>

// After:
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

// Also add to password input:
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

// And submit button:
<button
  type="submit"
  className="auth-submit-button"
  disabled={isLoading}
  data-testid="login-submit-button"
>
  {isLoading ? 'Signing in...' : 'Sign In'}
</button>
```

#### 1.4 Register Form

**File:** `frontend/src/components/auth/RegisterForm.tsx`

```tsx
// Add data-testid to all form inputs:
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

#### 1.5 Comparison Form

**File:** `frontend/src/components/comparison/ComparisonForm.tsx`

```tsx
// Textarea:
<textarea
  ref={textareaRef}
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isFollowUpMode) {
        onContinueConversation();
      } else {
        onSubmitClick();
      }
    }
  }}
  placeholder={isFollowUpMode
    ? "Enter your follow-up here"
    : "Enter your input here..."
  }
  className="hero-input-textarea"
  rows={1}
  data-testid="comparison-input-textarea"
/>

// Submit button:
<button
  onClick={isFollowUpMode ? onContinueConversation : onSubmitClick}
  disabled={/* ... */}
  className={`textarea-icon-button submit-button ${/* ... */}`}
  title={/* ... */}
  data-testid="comparison-submit-button"
>
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</button>
```

#### 1.6 Model Selection

**File:** `frontend/src/App.tsx` (around line 3411)

```tsx
// Model checkboxes:
<input
  type="checkbox"
  checked={isSelected}
  disabled={isDisabled}
  onChange={() => !isDisabled && handleModelToggle(model.id)}
  className={`model-checkbox ${/* ... */}`}
  data-testid={`model-checkbox-${model.id}`}
/>

// Provider dropdown buttons:
<button
  className="provider-header"
  onClick={() => toggleDropdown(provider)}
  data-testid={`provider-dropdown-${provider}`}
>
  {/* ... */}
</button>
```

#### 1.7 Results Display

**File:** `frontend/src/App.tsx` (where results are rendered)

```tsx
// Result cards:
<div
  className={`model-card ${/* ... */}`}
  data-testid={`result-card-${modelId}`}
>
  {/* ... */}
</div>

// Or if using a different structure:
<div
  className="model-response"
  data-testid={`model-response-${modelId}`}
>
  {/* ... */}
</div>
```

#### 1.8 User Menu

**File:** `frontend/src/components/layout/UserMenu.tsx` (if it exists)

```tsx
<button
  className="user-menu-button"
  onClick={handleMenuToggle}
  data-testid="user-menu-button"
>
  {/* ... */}
</button>

// Logout button:
<button
  onClick={handleLogout}
  data-testid="logout-button"
>
  Logout
</button>
```

### Step 2: Update Test Selectors

Now update the E2E tests to use these `data-testid` attributes:

#### 2.1 Update auth.spec.ts

**File:** `frontend/e2e/auth.spec.ts`

```typescript
// Before:
const signUpButton = page.getByRole('button', { name: /sign up|register|create account/i })
await signUpButton.click()

// After:
const signUpButton = page.getByTestId('nav-sign-up-button')
await signUpButton.click()

// Before:
await page.fill('input[type="email"]', testEmail)
await page.fill('input[type="password"]', testPassword)

// After:
await page.getByTestId('register-email-input').fill(testEmail)
await page.getByTestId('register-password-input').fill(testPassword)
await page.getByTestId('register-confirm-password-input').fill(testPassword)

// Before:
const submitButton = page.getByRole('button', { name: /register|sign up|create account/i })
await submitButton.click()

// After:
await page.getByTestId('register-submit-button').click()
```

#### 2.2 Update comparison.spec.ts

**File:** `frontend/e2e/comparison.spec.ts`

```typescript
// Before:
const inputField = page.locator('textarea, input[type="text"]').first()
await inputField.fill(testInput)

// After:
await page.getByTestId('comparison-input-textarea').fill(testInput)

// Before:
const modelCheckboxes = page.locator('input[type="checkbox"]')
await modelCheckboxes.first().check()

// After:
// Option 1: Select by specific model ID (if you know it)
await page.getByTestId('model-checkbox-openai/gpt-4').check()

// Option 2: Select first available model checkbox
const firstCheckbox = page.locator('[data-testid^="model-checkbox-"]').first()
await firstCheckbox.check()

// Before:
const compareButton = page.getByRole('button', { name: /compare|submit|run/i })
await compareButton.click()

// After:
await page.getByTestId('comparison-submit-button').click()

// Before:
const results = page.locator('[data-testid="result"], .result-card, .model-response').first()
await expect(results).toBeVisible({ timeout: 30000 })

// After:
// Option 1: Wait for any result card
await expect(page.locator('[data-testid^="result-card-"]').first()).toBeVisible({ timeout: 30000 })

// Option 2: Wait for specific model result
await expect(page.getByTestId('result-card-openai/gpt-4')).toBeVisible({ timeout: 30000 })
```

#### 2.3 Update conversation.spec.ts

**File:** `frontend/e2e/conversation.spec.ts`

```typescript
// Add data-testid to conversation history elements first, then:

// Before:
const conversationHistory = page.locator(
  '[data-testid="conversation-history"], .conversation-history'
)
await expect(conversationHistory).toBeVisible({ timeout: 5000 })

// After:
await expect(page.getByTestId('conversation-history')).toBeVisible({ timeout: 5000 })

// Before:
const conversationItems = page.locator('[data-testid="conversation-item"], .conversation-item')
await conversationItems.first().click()

// After:
await page.getByTestId('conversation-item-0').click() // or use first()
```

### Step 3: Adjust Test Data and Credentials

#### 3.1 Environment Variables

Create a `.env.test` file or use environment variables:

```bash
# .env.test
ADMIN_EMAIL=jaydeelew@gmail.com
ADMIN_PASSWORD=sf*88323?ddpdRRl

# Tier-based user credentials (preferred)
TEST_FREE_EMAIL=free@test.com
TEST_FREE_PASSWORD=Test12345678/
TEST_STARTER_EMAIL=starter@test.com
TEST_STARTER_PASSWORD=Test12345678/
TEST_STARTER_PLUS_EMAIL=starter_plus@test.com
TEST_STARTER_PLUS_PASSWORD=Test12345678/
TEST_PRO_EMAIL=pro@test.com
TEST_PRO_PASSWORD=Test12345678/
TEST_PRO_PLUS_EMAIL=pro_plus@test.com
TEST_PRO_PLUS_PASSWORD=Test12345678/

# Legacy variables (for backward compatibility, prefer tier-specific above)
TEST_USER_EMAIL=free@test.com  # Falls back to TEST_FREE_EMAIL if not set
TEST_USER_PASSWORD=Test12345678/  # Falls back to TEST_FREE_PASSWORD if not set
TEST_STARTER_EMAIL=starter@test.com
TEST_STARTER_PASSWORD=Test12345678/
TEST_STARTER_PLUS_EMAIL=starter_plus@test.com
TEST_STARTER_PLUS_PASSWORD=Test12345678/
TEST_PRO_EMAIL=pro@test.com
TEST_PRO_PASSWORD=Test12345678/
TEST_PRO_PLUS_EMAIL=pro_plus@test.com
TEST_PRO_PLUS_PASSWORD=Test12345678/
```

#### 3.2 Update Test Files to Use Environment Variables

**File:** `frontend/e2e/auth.spec.ts`

```typescript
// Before:
const testEmail = `test-${timestamp}@example.com`
const testPassword = 'TestPassword123!'

// After:
const testEmail = process.env.TEST_USER_EMAIL || `test-${timestamp}@example.com`
const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!'
```

**File:** `frontend/e2e/admin.spec.ts`

```typescript
// Before:
const adminEmail = process.env.ADMIN_EMAIL || 'jaydeelew@gmail.com'
const adminPassword = process.env.ADMIN_PASSWORD || 'sf*88323?ddpdRRl'

// After (already correct, but ensure .env.test is loaded):
// Make sure playwright.config.ts loads .env.test
```

#### 3.3 Update playwright.config.ts to Load Test Environment

**File:** `frontend/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  // ... rest of config
})
```

### Step 4: Create a Test Fixtures File (Optional but Recommended)

**File:** `frontend/e2e/fixtures.ts`

```typescript
import { test as base } from '@playwright/test'

type TestFixtures = {
  authenticatedPage: any
  adminPage: any
}

export const test = base.extend<TestFixtures>({
  // Authenticated user fixture
  authenticatedPage: async ({ page }, use) => {
    // Login logic here
    await page.goto('/')
    await page.getByTestId('nav-sign-in-button').click()
    await page.getByTestId('login-email-input').fill(process.env.TEST_USER_EMAIL || 'free@test.com')
    await page
      .getByTestId('login-password-input')
      .fill(process.env.TEST_USER_PASSWORD || 'Test12345678/')
    await page.getByTestId('login-submit-button').click()
    await page.waitForLoadState('networkidle')

    await use(page)
  },

  // Admin user fixture
  adminPage: async ({ page }, use) => {
    // Admin login logic here
    await page.goto('/')
    await page.getByTestId('nav-sign-in-button').click()
    await page
      .getByTestId('login-email-input')
      .fill(process.env.ADMIN_EMAIL || 'jaydeelew@gmail.com')
    await page
      .getByTestId('login-password-input')
      .fill(process.env.ADMIN_PASSWORD || 'sf*88323?ddpdRRl')
    await page.getByTestId('login-submit-button').click()
    await page.waitForLoadState('networkidle')

    await use(page)
  },
})

export { expect } from '@playwright/test'
```

Then use it in tests:

```typescript
// Before:
test('User can perform comparison', async ({ page }) => {
  // Login logic here...
})

// After:
import { test, expect } from './fixtures'

test('User can perform comparison', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in!
  await authenticatedPage.getByTestId('comparison-input-textarea').fill('Test input')
})
```

## Quick Reference: Common Selectors

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

## Testing Your Changes

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

## Best Practices

1. **Use descriptive names**: `comparison-input-textarea` is better than `input-1`
2. **Include context**: `login-email-input` is better than `email-input`
3. **Be consistent**: Use kebab-case for all `data-testid` values
4. **Don't overuse**: Only add `data-testid` to elements that tests actually need to interact with
5. **Document**: Keep this guide updated as you add new test IDs

## Next Steps

### Immediate Action Items

Based on what's already been implemented, here are the specific next steps:

#### Step 1: Add Remaining `data-testid` Attributes

**1. RegisterForm** (`frontend/src/components/auth/RegisterForm.tsx`)

- Add `data-testid="register-email-input"` to email input
- Add `data-testid="register-password-input"` to password input
- Add `data-testid="register-confirm-password-input"` to confirm password input
- Add `data-testid="register-submit-button"` to submit button

**2. AuthModal** (`frontend/src/components/auth/AuthModal.tsx`)

- Add `data-testid="auth-modal-overlay"` to overlay div
- Add `data-testid="auth-modal"` to modal div
- Add `data-testid="auth-modal-close"` to close button

**3. Model Checkboxes** (`frontend/src/App.tsx` around line 3411)

- Add `data-testid={`model-checkbox-${model.id}`}` to each checkbox input

**4. Result Cards** (where results are rendered in `App.tsx`)

- Add `data-testid={`result-card-${modelId}`}` to each result card/container

**5. User Menu** (`frontend/src/components/layout/UserMenu.tsx` or similar)

- Add `data-testid="user-menu-button"` to user menu button
- Add `data-testid="logout-button"` to logout button

#### Step 2: Update Remaining Tests

After adding the attributes above, update:

- `auth.spec.ts` - Use `register-*` test IDs
- `comparison.spec.ts` - Use `model-checkbox-*` and `result-card-*` test IDs
- `conversation.spec.ts` - Add conversation history test IDs
- `admin.spec.ts` - Add admin panel test IDs

#### Step 3: Test Your Changes

```bash
cd frontend
npm run test:e2e
```

Fix any failing tests by:

- Verifying `data-testid` attributes are correctly added
- Checking element visibility timing
- Adding appropriate waits (`await page.waitForLoadState('networkidle')`)

#### Step 4: General Best Practices

1. Start with the most critical user flows (auth, comparison) ✅ **Done**
2. Add `data-testid` attributes incrementally ⏳ **In Progress**
3. Update tests as you go ⏳ **In Progress**
4. Run tests frequently to catch issues early ✅ **Ready**
