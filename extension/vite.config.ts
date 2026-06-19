import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import manifest from './manifest.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@compareintel/core': path.resolve(__dirname, '../packages/compare-core/src'),
      '@frontend': path.resolve(__dirname, '../frontend/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    strictPort: true,
  },
})
