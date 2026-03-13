import express from 'express'
import compression from 'compression'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

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

// SPA fallback - serve index.html for all routes
app.get('*', (req, res) => {
  try {
    const indexPath = join(distPath, 'index.html')
    const indexHtml = readFileSync(indexPath, 'utf-8')
    res.setHeader('Content-Type', 'text/html')
    res.send(indexHtml)
  } catch (error) {
    res.status(500).send('Error serving index.html')
  }
})

app.listen(PORT, () => {
  console.log(`Preview server with compression running at http://localhost:${PORT}`)
  console.log(`API requests (/api/*) are proxied to ${BACKEND_URL}`)
  console.log(`Ensure the backend is running (e.g. python3 -m uvicorn app.main:app --port 8000)`)
})
