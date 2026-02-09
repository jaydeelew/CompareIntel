/**
 * Vite plugin to add security headers to dev server responses
 * This helps fix ZAP security scan warnings for the dev server
 */
import type { Plugin } from 'vite'

export function securityHeadersPlugin(): Plugin {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Add security headers to all responses
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
        // Permissions-Policy: Removed deprecated features to avoid browser console warnings
        // Removed: ambient-light-sensor, battery, document-domain, execution-while-not-rendered,
        // execution-while-out-of-viewport, navigation-override
        res.setHeader(
          'Permissions-Policy',
          'accelerometer=(), autoplay=(), camera=(), cross-origin-isolated=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(self), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()'
        )

        // Add cache-control headers based on file type
        const url = req.url || ''

        // API endpoints should not be cached
        if (url.startsWith('/api')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        }
        // Static assets can be cached
        else if (url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        // HTML files should not be cached in dev
        else if (url.match(/\.html$/) || url === '/' || !url.includes('.')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
        }
        // Default: short cache for other files
        else {
          res.setHeader('Cache-Control', 'public, max-age=3600')
        }

        next()
      })
    },
  }
}
