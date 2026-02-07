import express from 'express'
import compression from 'compression'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4173

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
})
