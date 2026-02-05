# Bundle Optimization Guide

This document describes the bundle optimization setup for the CompareIntel frontend.

## Overview

Bundle optimization has been implemented to ensure optimal performance and prevent bundle size regressions. The setup includes:

1. **Bundle Analysis**: Visual bundle analysis using `rollup-plugin-visualizer`
2. **Bundle Size Limits**: Automated checks with configurable limits
3. **CI/CD Integration**: Automated bundle size checks in GitHub Actions
4. **Optimized Build Configuration**: Improved chunking and tree-shaking

## Bundle Size Limits

The following limits are enforced (gzipped):

- **Initial Bundle**: 200KB
- **Total Bundle**: 500KB
- **Individual Chunk**: 100KB

These limits are defined in `scripts/check-bundle-size.js` and can be adjusted as needed.

## Usage

### Analyze Bundle

Generate a visual bundle analysis:

```bash
npm run build:analyze
```

This will:
1. Build the application
2. Generate `dist/stats.html` with an interactive treemap visualization
3. Open the analysis in your browser (if configured)

### Check Bundle Size

Check bundle sizes against limits:

```bash
npm run bundle:size
```

This script:
- Analyzes all JS files in `dist/`
- Calculates gzipped sizes
- Reports violations if limits are exceeded
- Provides optimization tips

### Build for Production

Standard production build:

```bash
npm run build
```

## Build Optimizations

### Chunk Splitting

The build configuration automatically splits vendor dependencies into separate chunks:

- `vendor-react`: React, React DOM, React Router
- `vendor-katex`: KaTeX library
- `vendor-icons`: Lucide React icons
- `vendor`: Other dependencies

This improves caching and reduces initial bundle size.

### Tree-Shaking

The following optimizations ensure effective tree-shaking:

1. **Named Imports**: Use named imports for better tree-shaking
   ```typescript
   // ✅ Good - tree-shakeable
   import { Eye, EyeClosed } from 'lucide-react';
   
   // ❌ Avoid - imports entire library
   import * as Icons from 'lucide-react';
   ```

2. **Dynamic Imports**: Heavy dependencies are loaded dynamically
   ```typescript
   // ✅ Good - code splitting
   const LatexRenderer = lazy(() => import('./components/LatexRenderer'));
   ```

3. **Barrel Exports**: Use direct imports when possible
   ```typescript
   // ✅ Good - direct import
   import { formatDate } from './utils/format';
   
   // ⚠️ Acceptable - barrel export (still tree-shakeable in Vite)
   import { formatDate } from './utils';
   ```

### Removed Dependencies

The following unused dependencies have been removed:

- `html2canvas`: Not used (using `html-to-image` instead)
- `prismjs`: Loaded via CDN in `index.html` (not needed as npm package)
- `@types/prismjs`: Not needed since Prism is declared as global

## CI/CD Integration

Bundle size checks run automatically as part of the **CI Workflow** (`.github/workflows/ci.yml`), specifically in the `frontend-build` job.

**When Bundle Size Checks Run:**

- Pull requests affecting `frontend/`
- Pushes to `master` branch (excluding markdown/docs changes)
- Manual workflow triggers

**The CI Workflow (`frontend-build` job):**

1. Builds the application for production
2. Runs bundle size checks (`npm run bundle:size`)
3. Uploads build artifacts (`frontend-dist`)
4. Uploads bundle analysis artifact (`bundle-analysis` - contains `stats.html`)
5. Comments on PRs with bundle size information

## Optimization Tips

If bundle size limits are exceeded:

1. **Use Dynamic Imports**: Lazy load heavy components
   ```typescript
   const HeavyComponent = lazy(() => import('./HeavyComponent'));
   ```

2. **Remove Unused Dependencies**: Regularly audit dependencies
   ```bash
   npm run build:analyze  # Check what's included
   ```

3. **Optimize Imports**: Use named imports and avoid barrel exports for large modules

4. **Code Splitting**: Split large features into separate routes/chunks

5. **Review Dependencies**: Consider lighter alternatives for heavy dependencies

## Monitoring

### Bundle Analysis Report

After running `npm run build:analyze`, open `dist/stats.html` to:

- Visualize bundle composition
- Identify large dependencies
- Find optimization opportunities
- Compare gzipped vs. brotli sizes

### CI/CD Reports

Check GitHub Actions workflow runs for:

- Bundle size trends over time
- Violations and warnings
- Optimization recommendations

## Configuration Files

- `vite.config.ts`: Build configuration and chunk splitting
- `scripts/check-bundle-size.js`: Bundle size limits and checks
- `.github/workflows/ci.yml`: CI/CD integration (bundle size check is part of `frontend-build` job)

## Future Improvements

Potential future optimizations:

1. **Route-based Code Splitting**: Split by routes for better caching
2. **Asset Optimization**: Optimize images and fonts
3. **Service Worker**: Implement caching strategies
4. **Bundle Compression**: Consider brotli compression
5. **Dependency Analysis**: Regular dependency audits

---

**Last Updated**: January 2025  
**Maintained By**: CompareIntel Team

