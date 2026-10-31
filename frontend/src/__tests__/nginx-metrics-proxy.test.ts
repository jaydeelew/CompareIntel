import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(repoRoot, 'scripts/check-nginx-metrics-proxy.js')
const require = createRequire(import.meta.url)
const { checkConfig, LOCATION_DIRECTIVE, METRICS_PATH } = require(scriptPath) as {
  checkConfig: (relativePath: string, input?: { content?: string }) => { location: string }
  LOCATION_DIRECTIVE: string
  METRICS_PATH: string
}

const VALID_BLOCK = `
        location = ${METRICS_PATH} {
            proxy_pass http://backend:8000;
            proxy_set_header Authorization $http_authorization;
            proxy_cache off;
            add_header Cache-Control "no-store" always;
        }
        location ~ ^/api(/v1)?/ {
            proxy_pass http://backend:8000;
        }
`

describe('nginx metrics proxy', () => {
  it('keeps production nginx configs exact-match proxying /internal/metrics/host', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(output).toContain(LOCATION_DIRECTIVE)
    expect(output).toContain('nginx/nginx.ssl.conf')
    expect(output).toContain('nginx/nginx.prod.conf')
    expect(output).toContain('no other /internal paths')
  })

  it('accepts an exact-match proxy that forwards Authorization and disables cache', () => {
    expect(checkConfig('nginx/nginx.ssl.conf', { content: VALID_BLOCK }).location).toBe(
      LOCATION_DIRECTIVE
    )
  })

  it('rejects a missing exact-match location (SPA fallthrough)', () => {
    expect(() =>
      checkConfig('nginx/nginx.ssl.conf', {
        content: 'location / { try_files $uri /index.html; }',
      })
    ).toThrow(/exactly one/)
  })

  it('rejects proxying other /internal paths', () => {
    expect(() =>
      checkConfig('nginx/nginx.ssl.conf', {
        content: `
          ${VALID_BLOCK}
          location /internal/ {
            proxy_pass http://backend:8000;
          }
        `,
      })
    ).toThrow(/must not proxy other \/internal paths/)
  })

  it('rejects nginx-level auth on the metrics location', () => {
    expect(() =>
      checkConfig('nginx/nginx.ssl.conf', {
        content: `
          location = ${METRICS_PATH} {
              auth_basic "metrics";
              proxy_pass http://backend:8000;
              proxy_set_header Authorization $http_authorization;
              proxy_cache off;
              add_header Cache-Control "no-store" always;
          }
        `,
      })
    ).toThrow(/must not add nginx auth/)
  })

  it('rejects proxy_pass with a URI suffix that would rewrite the path', () => {
    expect(() =>
      checkConfig('nginx/nginx.ssl.conf', {
        content: `
          location = ${METRICS_PATH} {
              proxy_pass http://backend:8000/;
              proxy_set_header Authorization $http_authorization;
              proxy_cache off;
              add_header Cache-Control "no-store" always;
          }
        `,
      })
    ).toThrow(/no URI suffix/)
  })
})
