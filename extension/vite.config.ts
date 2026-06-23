import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import manifest from './manifest.config'
import { ensureDistManifestPlugin } from './scripts/ensureDistManifestPlugin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Watch/incremental builds can fail mid-run; don't wipe dist or Chrome loses manifest.json.
const isCleanProductionBuild =
  process.argv.includes('build') && !process.argv.includes('--watch')

export default defineConfig({
  plugins: [react(), crx({ manifest }), ensureDistManifestPlugin(__dirname)],
  resolve: {
    alias: {
      '@compareintel/core': path.resolve(__dirname, '../packages/compare-core/src'),
      '@frontend': path.resolve(__dirname, '../frontend/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: isCleanProductionBuild,
  },
  server: {
    port: 5175,
    strictPort: true,
    hmr: {
      port: 5175,
    },
  },
})
