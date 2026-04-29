import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin } from 'vite'
import { imagetools } from 'vite-imagetools'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

import { securityHeadersPlugin } from './vite-plugin-security-headers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin to auto-version social sharing images (cache busting)
// Replaces __SOCIAL_IMAGE_VERSION__ with build timestamp in index.html
function socialImageVersionPlugin(): Plugin {
  return {
    name: 'social-image-version',
    transformIndexHtml(html) {
      const version = Date.now().toString(36) // Compact timestamp: e.g., "m5x2k8f"
      return html.replace(/__SOCIAL_IMAGE_VERSION__/g, version)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'warn',
  // Pin cache inside this app so dev never mixes prebundles with other projects or old /tmp caches.
  cacheDir: path.resolve(__dirname, 'node_modules/.vite'),
  resolve: {
    // Force single copies (fixes invalid hook call when lazy chunks resolve a different optimized graph)
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      // Subpaths must match the same install; otherwise prebundles can load a second React (null dispatcher).
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client.js'),
      // Do not alias `react-router` — react-router-dom imports `react-router/dom` (package subpath).
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  plugins: [
    {
      name: 'concise-startup',
      configureServer(server) {
        const printUrl = () => {
          const addr = server.httpServer?.address()
          if (addr && typeof addr === 'object') {
            const port = addr.port
            const host =
              addr.address === '::' || addr.address === '127.0.0.1'
                ? 'localhost'
                : addr.address
            process.stdout.write(`Frontend: http://${host}:${port}\n`)
          } else {
            const port = server.config.server?.port ?? 5173
            process.stdout.write(`Frontend: http://localhost:${port}\n`)
          }
        }
        server.httpServer?.once('listening', printUrl)
      },
    },
    // Add security headers to dev server responses (for ZAP compliance)
    securityHeadersPlugin(),
    // Auto-version social sharing images on every build (cache busting for OG/Twitter images)
    socialImageVersionPlugin(),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Plugin types may conflict between vite and vitest bundled vite
    react(),
    // Image optimization - automatically generates WebP/AVIF variants
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Plugin types may conflict between vite and vitest bundled vite
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Plugin types may conflict between vite and vitest bundled vite
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // treemap, sunburst, network
    }),
    // PWA - Progressive Web App support
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Plugin types may conflict between vite and vitest bundled vite
    VitePWA({
      registerType: 'autoUpdate',
      // Defer service worker registration until after page load to prevent render-blocking
      injectRegister: null,
      includeAssets: [
        'favicon.ico', // Root copy for crawlers (mirrors brand/favicon.ico)
        'brand/favicon.ico',
        'brand/tab.svg',
        'brand/logo.svg',
        'brand/icon-16.png',
        'brand/icon-32.png',
        'brand/apple-touch-icon-180.png',
        'brand/pwa-any-192.png',
        'brand/pwa-any-512.png',
        'brand/pwa-any-1024.png',
        'brand/serp-circle-192.png',
        'brand/serp-circle-512.png',
        'brand/pwa-maskable-48.png',
        'brand/pwa-maskable-72.png',
        'brand/pwa-maskable-96.png',
        'brand/pwa-maskable-128.png',
        'brand/pwa-maskable-192.png',
        'brand/pwa-maskable-384.png',
        'brand/pwa-maskable-512.png',
        'brand/screenshot-desktop.png',
        'brand/screenshot-mobile.png',
        'brand/CI_favicon_tab_blue.svg',
        'brand/CI_favicon_tab_white.svg',
      ],
      manifest: {
        id: '/',
        name: 'CompareIntel',
        short_name: 'CompareIntel',
        description:
          'Compare Top AI models side-by-side including GPT, Claude, Gemini, Grok, Llama, Deepseek and more. Test prompts simultaneously with LaTeX/Markdown rendering.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        categories: ['productivity', 'utilities', 'developer tools'],
        lang: 'en',
        dir: 'ltr',
        prefer_related_applications: false,
        shortcuts: [
          {
            name: 'New Comparison',
            short_name: 'New',
            description: 'Start a new AI model comparison',
            url: '/?action=new',
            icons: [
              {
                src: 'brand/pwa-any-1024.png',
                sizes: '1024x1024',
                type: 'image/png',
              },
            ],
          },
        ],
        icons: [
          // Standard icons (full-size mark for install / taskbar / shortcuts)
          {
            src: 'brand/pwa-any-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'brand/pwa-any-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'brand/pwa-any-1024.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any',
          },
          // Maskable icons for Android adaptive icons
          {
            src: 'brand/pwa-maskable-48.png',
            sizes: '48x48',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'brand/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Use /brand/... so screenshot URLs are not resolved to /screenshot-*.png (SPA fallback serves HTML).
        screenshots: [
          {
            src: '/brand/screenshot-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'CompareIntel - Compare AI models side-by-side on desktop',
          },
          {
            src: '/brand/screenshot-mobile.png',
            sizes: '601x1334',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'CompareIntel - Compare AI models on mobile',
          },
        ],
      },
      workbox: {
        // Precache all static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Don't precache source maps or large screenshots
        globIgnores: ['**/node_modules/**', '**/*.map', '**/screenshot-*.png'],
        // Runtime caching strategies
        // Note: API routes (/api/*) are NOT cached - they need real-time data
        // (rate-limit-status, credits/balance). Caching caused Workbox "no-response"
        // errors when the network failed and no cached response existed.
        runtimeCaching: [
          {
            // Cache images with cache-first strategy
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache fonts
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        // SPA navigation fallback - serve index.html for all routes
        // This allows React Router to handle client-side routing
        // The offline.html page is precached and will be shown when truly offline
        // (handled by the app's network detection logic)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/admin/,
          /^\/verify-email/,
          /^\/reset-password/,
          /^\/sitemap\.xml$/,
          /^\/robots\.txt$/,
          // Exclude static files that should be served directly
          /\.(xml|txt|json|ico|webmanifest)$/i,
        ],
      },
      devOptions: {
        enabled: true, // Enable PWA plugin in dev mode to generate manifest file
        // Service worker registration is disabled via injectRegister: null above
        type: 'module',
      },
    }),
  ],
  optimizeDeps: {
    // Prebundle React + router together so dev does not load split copies (null hook dispatcher).
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router',
      'react-router-dom',
    ],
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Photon (Komoot) does not always respond with CORS headers when the browser blocks
      // or fails the cross-origin request (e.g. extensions). Same-origin proxy avoids that.
      '/geo/photon': {
        target: 'https://photon.komoot.io',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/geo\/photon/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Ensure cookies are properly handled through the proxy
        cookieDomainRewrite: {
          '*': ''  // Remove domain from cookies so they work with localhost
        },
        // Ensure cookies are forwarded
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Ensure Set-Cookie headers are properly forwarded
            const cookies = proxyRes.headers['set-cookie'];
            if (cookies) {
              proxyRes.headers['set-cookie'] = cookies.map((cookie: string) => {
                // Remove Secure flag in development since we're using HTTP
                return cookie.replace(/;\s*Secure/gi, '');
              });
            }
          });
        }
      }
    },
    // Add security and cache headers for dev server responses
    // This helps with security scanning tools like ZAP
    middlewareMode: false,
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
    // Disable source maps in production to avoid exposing source code
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
            // Split heavy file processing libraries into separate chunk
            if (id.includes('pdfjs-dist') || id.includes('mammoth')) {
              return 'vendor-files';
            }
            // Split PDF export libraries (already lazy-loaded, but keep separate)
            if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('html-to-image')) {
              return 'vendor-export';
            }
            // Split other potentially large dependencies into separate chunks
            // This prevents one massive vendor chunk
            if (id.includes('web-vitals')) {
              return 'vendor-vitals';
            }
            // Try to identify and split other large packages
            // If vendor chunk gets too large, Vite will warn us
            return 'vendor';
          }
          // Split large application files
          if (id.includes('/src/App.tsx')) {
            return 'app-main';
          }
          // LatexRenderer: do NOT put in manualChunks - it's lazy-loaded and must share
          // the same React instance as the main app to avoid "Invalid hook call" errors.
          // Split page components into separate chunk
          if (id.includes('/src/components/pages/')) {
            return 'pages';
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
