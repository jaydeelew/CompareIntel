import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(repoRoot, 'scripts/check-nginx-www-redirect.js')
const require = createRequire(import.meta.url)
const { checkNginxWwwRedirect, SSL_CONF, WWW_HOST, APEX_HOST, APEX_REDIRECT } = require(
  scriptPath
) as {
  checkNginxWwwRedirect: (input?: {
    content?: string
    setupContent?: string
    readFile?: (relativePath: string) => string
  }) => { relativePath: string; wwwHost: string }
  SSL_CONF: string
  WWW_HOST: string
  APEX_HOST: string
  APEX_REDIRECT: string
}

const VALID_SETUP = `
DOMAIN="compareintel.com"
WWW_DOMAIN="www.compareintel.com"
certbot certonly --standalone -d "$DOMAIN" -d "$WWW_DOMAIN"
`

const VALID_CANONICAL: Record<string, string> = {
  'frontend/src/utils/pageMeta.ts': "const BASE_URL = 'https://compareintel.com'\n",
  'frontend/scripts/generate-sitemap.js': "const baseUrl = 'https://compareintel.com'\n",
  'frontend/public/sitemap.xml': '<loc>https://compareintel.com/</loc>\n',
  'frontend/public/robots.txt': 'Sitemap: https://compareintel.com/sitemap.xml\n',
  'frontend/index.html': '<link rel="canonical" href="https://compareintel.com/" />\n',
}

const VALID_CONF = `
    server {
        listen 80;
        server_name compareintel.com www.compareintel.com;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { ${APEX_REDIRECT} }
    }
    server {
        listen 443 ssl;
        server_name www.compareintel.com;
        ssl_certificate /etc/letsencrypt/live/compareintel.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/compareintel.com/privkey.pem;
        ${APEX_REDIRECT}
    }
    server {
        listen 443 ssl;
        server_name compareintel.com;
        location / { try_files $uri $uri/index.html @spa_or_404; }
    }
`

function check(content: string, extras: { setupContent?: string } = {}) {
  return checkNginxWwwRedirect({
    content,
    setupContent: extras.setupContent ?? VALID_SETUP,
    readFile: relativePath => VALID_CANONICAL[relativePath] ?? '',
  })
}

describe('nginx www → apex redirect', () => {
  it('keeps production SSL nginx 301ing www to the apex on HTTP and HTTPS', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(output).toContain(SSL_CONF)
    expect(output).toContain(WWW_HOST)
    expect(output).toContain(APEX_HOST)
    expect(output).toContain('301')
  })

  it('accepts dedicated HTTPS www redirect plus HTTP ACME + apex 301', () => {
    expect(check(VALID_CONF).relativePath).toBe(SSL_CONF)
    expect(check(VALID_CONF).wwwHost).toBe(WWW_HOST)
  })

  it('rejects serving the full site on HTTPS www (duplicate content)', () => {
    expect(() =>
      check(`
        server {
            listen 80;
            server_name compareintel.com www.compareintel.com;
            location /.well-known/acme-challenge/ { root /var/www/certbot; }
            location / { ${APEX_REDIRECT} }
        }
        server {
            listen 443 ssl;
            server_name compareintel.com www.compareintel.com;
            ssl_certificate /etc/letsencrypt/live/compareintel.com/fullchain.pem;
            location / { try_files $uri $uri/index.html @spa_or_404; }
        }
      `)
    ).toThrow(/own server block|apex server_name/)
  })

  it('rejects HTTP www that still redirects to $server_name', () => {
    expect(() =>
      check(VALID_CONF.replace(APEX_REDIRECT, 'return 301 https://$server_name$request_uri;'))
    ).toThrow(/compareintel\.com\$request_uri/)
  })

  it('rejects dropping www from the Lets Encrypt cert domains', () => {
    expect(() =>
      check(VALID_CONF, {
        setupContent: 'DOMAIN="compareintel.com"\ncertbot certonly -d "$DOMAIN"\n',
      })
    ).toThrow(/WWW_DOMAIN/)
  })
})
