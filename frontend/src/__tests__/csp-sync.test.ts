import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(repoRoot, 'scripts/check-csp-sync.js')
const require = createRequire(import.meta.url)
const { checkCspSync, SENTRY_CONNECT_SRC } = require(scriptPath) as {
  checkCspSync: (input?: { nginxContent?: string; htmlContent?: string }) => {
    comparable: string
  }
  SENTRY_CONNECT_SRC: string
}

const POLICY_WITHOUT_SENTRY =
  "default-src 'self'; connect-src 'self' https://www.google.com; frame-src https://www.google.com; base-uri 'self'; form-action 'self';"

describe('CSP sync', () => {
  it('keeps nginx.ssl.conf and index.html policies aligned and allows Sentry ingest', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(output).toContain(SENTRY_CONNECT_SRC)
  })

  it('ignores nginx-only frame-ancestors when comparing', () => {
    const html =
      '  <meta http-equiv="Content-Security-Policy"\n    content="default-src \'self\'; connect-src \'self\' https://*.ingest.us.sentry.io; base-uri \'self\';" />'
    const nginx =
      'add_header Content-Security-Policy "default-src \'self\'; connect-src \'self\' https://*.ingest.us.sentry.io; frame-ancestors \'none\'; base-uri \'self\';" always;'
    expect(checkCspSync({ nginxContent: nginx, htmlContent: html }).comparable).toContain(
      SENTRY_CONNECT_SRC
    )
  })

  it('fails when connect-src omits Sentry ingest', () => {
    const html = `  <meta http-equiv="Content-Security-Policy" content="${POLICY_WITHOUT_SENTRY}" />`
    const nginx = `add_header Content-Security-Policy "${POLICY_WITHOUT_SENTRY} frame-ancestors 'none';" always;`
    expect(() => checkCspSync({ nginxContent: nginx, htmlContent: html })).toThrow(
      /connect-src must allow/
    )
  })

  it('fails when the two policies drift', () => {
    const html =
      '  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' https://*.ingest.us.sentry.io;" />'
    const nginx =
      'add_header Content-Security-Policy "default-src \'self\'; connect-src \'self\' https://*.ingest.us.sentry.io https://example.com; frame-ancestors \'none\';" always;'
    expect(() => checkCspSync({ nginxContent: nginx, htmlContent: html })).toThrow(/CSP mismatch/)
  })
})
