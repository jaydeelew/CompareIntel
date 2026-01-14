# E2E Test Performance Optimizations

## Overview

The E2E tests have been optimized for faster execution, especially during local development.

## Key Optimizations Applied

### 1. Disabled Video Recording (Default)

- **Before**: Videos were recorded for all tests (`retain-on-failure`)
- **After**: Videos are disabled by default (`off`)
- **Impact**: Significant speedup - video encoding is CPU-intensive
- **Enable when needed**: Set `PLAYWRIGHT_VIDEO=retain-on-failure` environment variable

### 2. Disabled Screenshots (Default)

- **Before**: Screenshots taken on failure (`only-on-failure`)
- **After**: Screenshots disabled by default (`off`)
- **Impact**: Moderate speedup - reduces I/O operations
- **Enable when needed**: Set `PLAYWRIGHT_SCREENSHOT=only-on-failure` environment variable

### 3. Disabled Trace Collection (Default)

- **Before**: Traces collected on first retry (`on-first-retry`)
- **After**: Traces disabled by default (`off`)
- **Impact**: Moderate speedup - reduces overhead
- **Enable when needed**: Set `PLAYWRIGHT_TRACE=on-first-retry` environment variable

### 4. Parallel Workers (Local Development)

- **Before**: Single worker (`workers=1`)
- **After**: Uses CPU count by default locally (parallel execution)
- **Impact**: Significant speedup - tests run in parallel
- **Control**: Set `PLAYWRIGHT_WORKERS=N` to specify worker count

## Performance Comparison

### Before Optimizations

- Full test suite: ~30+ minutes (13 browsers × 7 tests × sequential)
- Video recording overhead: ~20-30% additional time
- Screenshot overhead: ~5-10% additional time

### After Optimizations

- Full test suite: ~10-15 minutes (with parallel workers)
- Chromium-only: ~2-3 minutes
- Desktop browsers only: ~5-7 minutes

## Usage Examples

### Fast Local Development (Chromium Only)

```bash
cd frontend
npx playwright test --project=chromium
```

### Desktop Browsers Only (Faster than full suite)

```bash
cd frontend
npx playwright test --project=chromium --project=firefox --project=webkit
```

### Full Suite with Debugging Enabled

```bash
cd frontend
PLAYWRIGHT_VIDEO=retain-on-failure \
PLAYWRIGHT_SCREENSHOT=only-on-failure \
PLAYWRIGHT_TRACE=on-first-retry \
npx playwright test
```

### Custom Worker Count

```bash
cd frontend
PLAYWRIGHT_WORKERS=4 npx playwright test --project=chromium
```

### CI/CD (Full Suite with All Features)

```bash
# In CI, these are automatically enabled:
# - Single worker (workers=1)
# - Videos on failure
# - Screenshots on failure
# - Traces on retry
cd frontend
npx playwright test
```

## Environment Variables

| Variable                | Default                 | Options                                            | Description                |
| ----------------------- | ----------------------- | -------------------------------------------------- | -------------------------- |
| `PLAYWRIGHT_VIDEO`      | `off`                   | `off`, `on`, `retain-on-failure`, `on-first-retry` | Video recording mode       |
| `PLAYWRIGHT_SCREENSHOT` | `off`                   | `off`, `on`, `only-on-failure`                     | Screenshot capture mode    |
| `PLAYWRIGHT_TRACE`      | `off`                   | `off`, `on`, `on-first-retry`                      | Trace collection mode      |
| `PLAYWRIGHT_WORKERS`    | `undefined` (CPU count) | Number                                             | Number of parallel workers |
| `PLAYWRIGHT_BASE_URL`   | `http://localhost:5173` | URL                                                | Base URL for tests         |

## Recommendations

1. **Local Development**: Use `--project=chromium` for fastest feedback
2. **Pre-commit**: Run desktop browsers only (`chromium`, `firefox`, `webkit`)
3. **CI/CD**: Run full suite with all debugging features enabled
4. **Debugging Failures**: Enable videos/screenshots/traces only when investigating failures

## Additional Speed Tips

1. **Run specific tests**: `npx playwright test --grep="test name"`
2. **Run specific file**: `npx playwright test e2e/01-unregistered-user-journey.spec.ts`
3. **Use headed mode sparingly**: `--headed` is slower than headless
4. **Reuse existing server**: Already configured with `reuseExistingServer: !process.env.CI`

## Notes

- Video recording is the biggest performance bottleneck - disable unless debugging
- Parallel workers provide the biggest speedup - use multiple workers locally
- Mobile device tests are slower - skip them during rapid development cycles
- CI automatically uses single worker and enables debugging features for better failure analysis
