import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(repoRoot, 'scripts/check-nginx-ssl-spa.js')
const require = createRequire(import.meta.url)
const { checkNginxSslSpa, SSL_CONF } = require(scriptPath) as {
  checkNginxSslSpa: (input?: { content?: string }) => { relativePath: string }
  SSL_CONF: string
}

const VALID = `
        location ~ ^/c/[A-Za-z0-9]+$ {
            proxy_pass http://backend:8000;
        }
        location / {
            try_files $uri $uri/index.html @spa_or_404;
            location ~* \\.(js|css)$ { expires 1y; }
        }
        location @spa_or_404 {
            if ($uri = /models) { rewrite ^ /index.html break; }
            try_files /404.html =404;
        }
        location = /internal/metrics/host {
            proxy_pass http://backend:8000;
        }
`

describe('nginx SSL SPA /models 404 routing', () => {
  it('keeps production SSL nginx returning 404 for unknown /models/<slug>', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(output).toContain(SSL_CONF)
    expect(output).toContain('@spa_or_404')
  })

  it('accepts try_files into @spa_or_404 with exact /models', () => {
    expect(checkNginxSslSpa({ content: VALID }).relativePath).toBe(SSL_CONF)
  })

  it('rejects the old SPA catch-all that would 200 unknown model slugs', () => {
    expect(() =>
      checkNginxSslSpa({
        content: VALID.replace(
          'try_files $uri $uri/index.html @spa_or_404;',
          'try_files $uri $uri/ /index.html;'
        ),
      })
    ).toThrow(/try_files \$uri \$uri\/index\.html @spa_or_404|SPA-fallback/)
  })

  it('rejects a missing @spa_or_404 named location', () => {
    expect(() =>
      checkNginxSslSpa({
        content: VALID.replace('location @spa_or_404', 'location @missing'),
      })
    ).toThrow(/@spa_or_404/)
  })
})
