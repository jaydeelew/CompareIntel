import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(repoRoot, 'scripts/check-nginx-ssl-spa.js')
const require = createRequire(import.meta.url)
const { checkNginxSslSpa, SSL_CONF, PROD_CONF } = require(scriptPath) as {
  checkNginxSslSpa: (input?: { content?: string }) => { relativePath: string }
  SSL_CONF: string
  PROD_CONF: string
}

const VALID = `
        location ~ ^/c/[A-Za-z0-9]+$ {
            proxy_pass http://backend:8000;
        }
        location = /privacy {
            return 301 /privacy-policy$is_args$args;
        }
        location = /admin {
            try_files /admin/index.html /index.html =404;
        }
        location = /reset-password {
            try_files /reset-password/index.html /index.html =404;
        }
        location = /terms {
            try_files /terms/index.html /index.html =404;
        }
        error_page 404 /404.html;
        location = /404.html {
            internal;
        }
        location / {
            try_files $uri $uri/index.html =404;
            location ~* \\.(js|css)$ { expires 1y; }
        }
        location = /internal/metrics/host {
            proxy_pass http://backend:8000;
        }
`

describe('nginx SPA 404 routing', () => {
  it('keeps production nginx returning 404 for unknown URLs and redirecting /privacy', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(output).toContain(SSL_CONF)
    expect(output).toContain(PROD_CONF)
    expect(output).toContain('unknown URLs return 404')
    expect(output).toContain('/privacy 301s to /privacy-policy')
  })

  it('accepts error_page 404 plus exact app documents', () => {
    expect(checkNginxSslSpa({ content: VALID }).relativePath).toBe(SSL_CONF)
  })

  it('rejects the old SPA catch-all that would 200 unknown model slugs', () => {
    expect(() =>
      checkNginxSslSpa({
        content: VALID.replace(
          'try_files $uri $uri/index.html =404;',
          'try_files $uri $uri/ /index.html;'
        ),
      })
    ).toThrow(/try_files \$uri \$uri\/index\.html =404|SPA-fallback/)
  })

  it('rejects try_files /404.html =404 because that response is HTTP 200', () => {
    expect(() =>
      checkNginxSslSpa({
        content: VALID.replace(
          'try_files $uri $uri/index.html =404;',
          'try_files $uri $uri/index.html @spa_or_404;'
        ).concat('\nlocation @spa_or_404 { try_files /404.html =404; }\n'),
      })
    ).toThrow(/try_files \/404\.html =404|HTTP 200/)
  })

  it('rejects a missing internal 404 document', () => {
    expect(() =>
      checkNginxSslSpa({
        content: VALID.replace('location = /404.html', 'location = /missing.html'),
      })
    ).toThrow(/internal/)
  })
})
