import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { imagetools } from 'vite-imagetools'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // @ts-expect-error - Plugin types conflict between vite and vitest bundled vite
    react(),
    // Image optimization - automatically generates WebP/AVIF variants
    // @ts-expect-error - Plugin types conflict between vite and vitest bundled vite
    imagetools({
      defaultDirectives: (url) => {
        // Generate modern formats with quality optimization
        if (url.searchParams.has('url')) {
          return new URLSearchParams({
            format: 'webp;avif',
            quality: '80',
            as: 'picture',
          })
        }
        return new URLSearchParams()
      },
    }),
    // Bundle analyzer - generates stats.html in dist/ after build
    // @ts-expect-error - Plugin types conflict between vite and vitest bundled vite
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // treemap, sunburst, network
    }),
  ],
  cacheDir: '/tmp/vite-cache',
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    },
    // Exclude model_renderer_configs.json from HMR to prevent page reload
    // when backend modifies this file during model add/delete operations
    watch: {
      ignored: ['**/model_renderer_configs.json']
    }
  },
  build: {
    // Target modern browsers for smaller bundles
    target: 'esnext',
    // Minify with esbuild (faster than terser, produces smaller bundles)
    minify: 'esbuild',
    // Enable source maps for production debugging (optional, increases bundle size)
    sourcemap: false,
    // Enable CSS code splitting and minification
    cssCodeSplit: true,
    cssMinify: true,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Ensure JS files have content hashes for better caching
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        // Manual chunk splitting for better caching and parallel loading
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes('node_modules')) {
            // Vendor chunks - split large dependencies
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('katex')) {
              return 'vendor-katex';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Other vendor dependencies
            return 'vendor';
          }
          // Split large application files
          if (id.includes('/src/App.tsx')) {
            return 'app-main';
          }
          if (id.includes('/src/components/LatexRenderer.tsx')) {
            return 'latex-renderer';
          }
        },
      },
    },
    // Generate manifest for asset tracking (optional but useful for debugging)
    manifest: true,
    // Chunk size warning limit (500KB) - aligns with PERFORMANCE_BUDGETS
    // Performance budgets are enforced via:
    // 1. This warning limit (build-time)
    // 2. scripts/check-bundle-size.js (CI/CD)
    // 3. Runtime monitoring via utils/performance.ts
    chunkSizeWarningLimit: 500,
    // Report compressed size (gzip) for better visibility
    reportCompressedSize: true,
    // Reduce chunk size warnings threshold for better optimization awareness
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'e2e/**', // Exclude Playwright E2E tests from Vitest
      '**/*.e2e.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        'e2e/**', // Exclude E2E tests from coverage
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
    },
  },
})
