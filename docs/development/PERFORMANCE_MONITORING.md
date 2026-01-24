# Performance Monitoring Guide

This document describes the performance monitoring infrastructure implemented in CompareIntel, including Web Vitals tracking, performance markers, and performance budgets.

## Overview

CompareIntel includes comprehensive performance monitoring to track:
- **Core Web Vitals** (LCP, CLS, FCP, TTFB, INP)
- **Custom performance markers** for API requests and key operations
- **Performance budgets** to prevent bundle size regressions

**Note**: FID (First Input Delay) is not tracked as it has been deprecated and replaced by INP (Interaction to Next Paint).

## Web Vitals Tracking

Web Vitals are automatically tracked on application startup. Metrics are logged in development and can be sent to an analytics endpoint in production.

### Core Web Vitals

The following metrics are tracked:

- **LCP (Largest Contentful Paint)**: Measures loading performance
  - Good: < 2.5s
  - Needs Improvement: 2.5s - 3.75s
  - Poor: > 3.75s

- **CLS (Cumulative Layout Shift)**: Measures visual stability
  - Good: < 0.1
  - Needs Improvement: 0.1 - 0.25
  - Poor: > 0.25

- **FCP (First Contentful Paint)**: Measures initial render
  - Good: < 1.8s
  - Needs Improvement: 1.8s - 3s
  - Poor: > 3s

- **TTFB (Time to First Byte)**: Measures server response time
  - Good: < 800ms
  - Needs Improvement: 800ms - 1.8s
  - Poor: > 1.8s

- **INP (Interaction to Next Paint)**: Measures interactivity (replaces FID)
  - Good: < 200ms
  - Needs Improvement: 200ms - 500ms
  - Poor: > 500ms

### Configuration

Web Vitals tracking is initialized in `src/main.tsx`. To send metrics to an analytics endpoint in production, set the `VITE_PERFORMANCE_ENDPOINT` environment variable:

```bash
VITE_PERFORMANCE_ENDPOINT=https://your-analytics-endpoint.com/api/performance
```

## Performance Markers

Performance markers allow you to measure custom operations in your code.

### Basic Usage

```typescript
import { PerformanceMarker } from '@/utils/performance';

// Start a measurement
PerformanceMarker.start('my-operation');

// ... do work ...

// End the measurement
const duration = PerformanceMarker.end('my-operation');
```

### Measuring Async Operations

```typescript
import { PerformanceMarker } from '@/utils/performance';

const result = await PerformanceMarker.measure('api-call', async () => {
  return await fetch('/api/data');
});
```

### Measuring API Requests

API requests are automatically tracked by the API client. Each request is measured with a marker like `api:GET:models` or `api:POST:compare`.

### Measuring Component Renders

```typescript
import { useRenderPerformance } from '@/hooks/usePerformance';

function MyComponent() {
  const { measureRender } = useRenderPerformance('MyComponent');
  
  useEffect(() => {
    measureRender(() => {
      // Component render logic
    });
  }, []);
}
```

## Performance Budgets

Performance budgets are defined in `src/utils/performance.ts` and enforced at multiple levels:

### Bundle Size Budgets

- **Largest Entry Chunk**: < 200KB (gzipped) - The largest JavaScript chunk that loads initially
- **Initial Bundle Total**: < 500KB (gzipped) - Sum of all initial chunks (excluding lazy-loaded chunks)
- **Individual Chunk**: < 100KB (gzipped) - Individual chunks must be under this limit (vendor chunks can be up to 200KB)

**Note**: Lazy-loaded chunks (e.g., PDF viewer, admin panel, tutorial components) are excluded from initial bundle calculations as they load on-demand.

### Runtime Budgets

- **LCP**: < 2.5s
- **CLS**: < 0.1
- **FCP**: < 1.8s
- **TTFB**: < 800ms
- **INP**: < 200ms
- **Initial Load**: < 3s

### Checking Budgets

#### Build Time

Bundle size budgets are checked during build:

```bash
npm run build
npm run bundle:size
```

The `bundle:size` script will:
- Analyze all JavaScript bundles
- Check against defined limits
- Report violations with suggestions

#### Runtime

Check performance budgets at runtime:

```typescript
import { checkPerformanceBudgets } from '@/utils/performance';

const { passed, metrics } = checkPerformanceBudgets();

if (!passed) {
  console.warn('Performance budgets exceeded:', metrics);
}
```

## Performance Hooks

Performance hooks are available for component-level performance tracking. **Note**: Web Vitals are already automatically tracked globally via `initWebVitals()` in `main.tsx`, so these hooks are optional and primarily useful for component-specific measurements.

### useWebVitals

Track Web Vitals metrics in a component (optional - already tracked globally):

```typescript
import { useWebVitals } from '@/hooks/usePerformance';

function MyComponent() {
  useWebVitals((metric) => {
    console.log(`${metric.name}: ${metric.value}ms (${metric.rating})`);
  });
}
```

### usePerformanceTracking

Enable performance tracking in a component (optional - already enabled globally):

```typescript
import { usePerformanceTracking } from '@/hooks/usePerformance';

function MyComponent() {
  usePerformanceTracking(true); // Enable tracking
}
```

### useRenderPerformance

Measure component render performance:

```typescript
import { useRenderPerformance } from '@/hooks/usePerformance';

function MyComponent() {
  const { measureRender } = useRenderPerformance('MyComponent');
  
  useEffect(() => {
    measureRender(() => {
      // Component render logic
    });
  }, []);
}
```

### useAsyncPerformance

Measure async operations:

```typescript
import { useAsyncPerformance } from '@/hooks/usePerformance';

function MyComponent() {
  const { measure } = useAsyncPerformance('data-fetch');
  
  const fetchData = async () => {
    return await measure(async () => {
      return await api.get('/data');
    });
  };
}
```

## Performance Summary

Get a summary of all performance metrics:

```typescript
import { getPerformanceSummary } from '@/utils/performance';

const summary = getPerformanceSummary();
console.log('Navigation timing:', summary.navigation);
console.log('Paint timing:', summary.paint);
console.log('Resource timing:', summary.resource);
```

## Development vs Production

### Development

In development mode:
- All metrics are logged to the console
- Performance markers are logged with emoji indicators (✅ ⚠️ ❌)
- Detailed timing information is available

### Production

In production mode:
- Metrics are sent to analytics endpoint (if configured)
- Minimal console logging
- Metrics are collected silently without impacting UX

## Best Practices

1. **Measure Critical Paths**: Focus on measuring operations that impact user experience
2. **Avoid Overhead**: Don't measure every operation - focus on key user flows
3. **Monitor Trends**: Track metrics over time to identify regressions
4. **Set Alerts**: Configure alerts for performance budget violations
5. **Optimize Incrementally**: Use metrics to guide optimization efforts

## Troubleshooting

### Metrics Not Appearing

- Ensure `initWebVitals()` is called in `main.tsx`
- Check browser console for errors
- Verify Web Vitals API is supported (modern browsers)

### Performance Markers Not Working

- Ensure `PerformanceMarker.start()` is called before `PerformanceMarker.end()`
- Check that marker names match exactly
- Verify markers aren't cleared prematurely

### Bundle Size Violations

- Run `npm run build:analyze` to visualize bundle contents
- Check for large dependencies
- Consider code splitting for large features
- Remove unused dependencies

## Related Documentation

- [Implementation Plan](../getting-started/IMPLEMENTATION_PLAN_2025.md) - Phase 5, Task 3
- [Bundle Size Guide](./BUNDLE_SIZE.md) - Detailed bundle optimization guide
- [API Client Documentation](./API_CLIENT.md) - API client performance features

