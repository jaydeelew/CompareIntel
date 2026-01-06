# E2E Test Setup Guide

This document explains how the E2E tests are configured and what's required for them to run successfully.

## Test Configuration

### Playwright Configuration (`playwright.config.ts`)

The Playwright configuration automatically:

1. **Starts the frontend dev server** on `http://localhost:5173`
2. **Starts the backend server** on `http://localhost:8000`
3. **Runs global setup** to create test users if needed
4. **Configures test environment** with proper timeouts and retries

### Global Setup (`global-setup.ts`)

Runs once before all tests to:

- Wait for backend to be ready
- Create test users (admin and regular user) if they don't exist
- Set up any required test data

### Test Fixtures (`fixtures.ts`)

Provides reusable fixtures:

- `authenticatedPage` - Page already logged in as a regular user
- `adminPage` - Page already logged in as an admin user

## Requirements

### 1. Python 3.11+ Installed

The backend server requires Python. Verify installation:

```bash
python3 --version  # Should be 3.11 or higher
```

### 2. Backend Dependencies

Backend dependencies should be installed:

```bash
cd backend
pip install -r requirements.txt
```

### 3. Environment Variables (Optional)

You can override default test credentials via environment variables:

```bash
# Test User Credentials (tier-based users)
# Note: TEST_USER_EMAIL/TEST_USER_PASSWORD are legacy variables for backward compatibility
# Prefer using tier-specific variables (TEST_FREE_EMAIL, etc.)
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
export ADMIN_EMAIL="jaydeelew@gmail.com"
export ADMIN_PASSWORD="sf*88323?ddpdRRl"

# Other Configuration
export SECRET_KEY="your-secret-key-32-chars-minimum"
export OPENROUTER_API_KEY="your-api-key"
export DATABASE_URL="sqlite:///./test-e2e.db"
```

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
read_file

## How Tests Work

1. **Playwright starts both servers** (frontend and backend) automatically
2. **Global setup runs** to ensure test users exist
3. **Tests execute** using fixtures or manual login
4. **Servers shut down** automatically after tests complete

## Common Issues

### Backend Not Starting

**Symptom**: Comparison/websearch tests fail with timeout errors

**Solution**:

- Ensure Python 3.11+ is installed and in PATH
- Ensure backend dependencies are installed
- Check that port 8000 is not already in use

### Test Users Don't Exist

**Symptom**: Authentication tests fail

**Solution**:

- Global setup should create users automatically
- If it fails, users can be created manually via registration in tests
- Admin role must be set manually in backend (users created via registration are regular users)

### Port Conflicts

**Symptom**: Tests fail to start servers

**Solution**:

- Stop any existing servers on ports 5173 (frontend) or 8000 (backend)
- Or set `reuseExistingServer: true` in config (already set for local development)

## Manual Setup (If Needed)

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

## Using Fixtures in Tests

Instead of manual login in each test, use fixtures:

```typescript
// Before (manual login):
test('User can do something', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-sign-in-button').click()
  // ... login logic ...
})

// After (using fixture):
import { test, expect } from './fixtures'

test('User can do something', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in!
  await authenticatedPage.getByTestId('comparison-input-textarea').fill('Test')
})
```

## Test Data

- **Admin User**: `jaydeelew@gmail.com` / `sf*88323?ddpdRRl`
- **Free Tier User**: `free@test.com` / `Test12345678/`
- **Starter Tier User**: `starter@test.com` / `Test12345678/`
- **Starter+ Tier User**: `starter_plus@test.com` / `Test12345678/`
- **Pro Tier User**: `pro@test.com` / `Test12345678/`
- **Pro+ Tier User**: `pro_plus@test.com` / `Test12345678/`

These can be overridden via environment variables (see above).
