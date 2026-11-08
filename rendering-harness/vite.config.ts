import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../frontend/src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    // Writing screenshots/HTML into runs/ must not restart Vite (that dropped
    // the connection after the first screenshot: ERR_CONNECTION_REFUSED).
    watch: {
      ignored: ['**/runs/**', '**/test-results/**', '**/*.png', '**/*.log'],
    },
  },
});
