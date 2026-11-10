import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const frontendSrc = process.env.HARNESS_FRONTEND_SRC
  ? path.resolve(process.env.HARNESS_FRONTEND_SRC)
  : path.resolve(__dirname, '../frontend/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': frontendSrc,
    },
  },
  server: {
    port: Number(process.env.HARNESS_PORT || 5174),
    host: '127.0.0.1',
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '..'), frontendSrc],
    },
    // Writing screenshots/HTML into runs/ must not restart Vite (that dropped
    // the connection after the first screenshot: ERR_CONNECTION_REFUSED).
    watch: {
      ignored: ['**/runs/**', '**/test-results/**', '**/layout-audit/**', '**/triage-out/**', '**/*.png', '**/*.log'],
    },
  },
});
