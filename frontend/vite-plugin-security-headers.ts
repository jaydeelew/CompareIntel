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
        res.setHeader(
          'Permissions-Policy',
          'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()'
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
