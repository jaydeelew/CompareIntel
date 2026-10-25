import express from 'express'
import compression from 'compression'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4173
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000'

// Match nginx prod config: 11 min for extended AI comparisons (SSE streaming)
const PROXY_TIMEOUT_MS = 11 * 60 * 1000

// Proxy /api requests to backend (matches Vite dev server behavior)
// pathFilter ensures full path /api/* is forwarded (app.use('/api', ...) would strip)
app.use(
  createProxyMiddleware({
    pathFilter: '/api',
    target: BACKEND_URL,
    changeOrigin: true,
    proxyTimeout: PROXY_TIMEOUT_MS,
    cookieDomainRewrite: { '*': '' },
    onProxyRes: (proxyRes) => {
      const cookies = proxyRes.headers['set-cookie']
      if (cookies) {
        proxyRes.headers['set-cookie'] = cookies.map((c) =>
          c.replace(/;\s*Secure/gi, '')
        )
      }
    },
    on: {
      error: (err, req, res) => {
        console.error('[Proxy] Backend unreachable:', err.message)
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              detail: 'Backend unavailable. Ensure the backend is running (python3 -m uvicorn app.main:app --port 8000)',
            })
          )
        }
      },
    },
  })
)

// Enable compression for all responses
app.use(compression({
  filter: (req, res) => {
    // Compress all text-based responses
    if (req.headers['x-no-compression']) {
      return false
    }
    return compression.filter(req, res)
  },
  level: 6, // Compression level (0-9, 6 is a good balance)
  threshold: 1024, // Only compress responses larger than 1KB
}))

// Serve static files from dist directory
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// Known public routes that should serve their prerendered HTML
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/features',
  '/how-it-works',
  '/faq',
  '/image-generation',
  '/help-me-choose-methodology',
  '/privacy-policy',
  '/terms-of-service',
]

// SPA fallback with 404 handling
app.get('*', (req, res) => {
  try {
    const path = req.path
    
    // Check if this is a known public route or /admin
    const isKnownRoute = PUBLIC_ROUTES.includes(path) || path.startsWith('/admin')
    
    if (isKnownRoute) {
      // Serve the appropriate prerendered HTML or index.html
      let htmlPath
      if (path === '/') {
        htmlPath = join(distPath, 'index.html')
      } else if (path.startsWith('/admin')) {
        // Admin routes use the main SPA
        htmlPath = join(distPath, 'index.html')
      } else {
        // Try to serve prerendered HTML
        const pagePath = join(distPath, path.slice(1), 'index.html')
        htmlPath = existsSync(pagePath) ? pagePath : join(distPath, 'index.html')
      }
      
      const indexHtml = readFileSync(htmlPath, 'utf-8')
      res.setHeader('Content-Type', 'text/html')
      res.send(indexHtml)
    } else {
      // Unknown route - serve 404.html with 404 status
      const notFoundPath = join(distPath, '404.html')
      if (existsSync(notFoundPath)) {
        const notFoundHtml = readFileSync(notFoundPath, 'utf-8')
        res.status(404)
        res.setHeader('Content-Type', 'text/html')
        res.send(notFoundHtml)
      } else {
        // Fallback if 404.html doesn't exist
        res.status(404)
        res.setHeader('Content-Type', 'text/html')
        res.send('<h1>404 - Page Not Found</h1>')
      }
    }
  } catch (error) {
    console.error('Error serving page:', error)
    res.status(500).send('Internal Server Error')
  }
})

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`✨ Preview server running at http://localhost:${PORT}`)
  console.log(`   API proxy: ${BACKEND_URL}`)
  console.log(`${'='.repeat(60)}\n`)
  console.log('💡 Tip: Ensure the backend is running:')
  console.log('   python3 -m uvicorn app.main:app --port 8000\n')
})
