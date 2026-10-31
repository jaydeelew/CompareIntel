#!/usr/bin/env node
/**
 * Fail if production SSL nginx does not 404 unknown /models/<slug>
 * the same way nginx.prod.conf does (PR #112). Existing /c/, metrics,
 * and cache rules must stay in place.
 *
 * Usage: node scripts/check-nginx-ssl-spa.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const SSL_CONF = 'nginx/nginx.ssl.conf'

function stripComments(content) {
  return content.replace(/#.*$/gm, '')
}

function checkNginxSslSpa({ content } = {}) {
  const relativePath = SSL_CONF
  const raw = content ?? fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
  const stripped = stripComments(raw)

  if (!/location\s+@spa_or_404\s*\{/.test(stripped)) {
    throw new Error(`${relativePath} must define location @spa_or_404 for unknown routes`)
  }

  if (!/try_files\s+\$uri\s+\$uri\/index\.html\s+@spa_or_404\s*;/.test(stripped)) {
    throw new Error(
      `${relativePath} location / must use try_files $uri $uri/index.html @spa_or_404`
    )
  }

  if (/try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/.test(stripped)) {
    throw new Error(
      `${relativePath} must not SPA-fallback unknown routes with try_files ... /index.html`
    )
  }

  if (!/if\s*\(\s*\$uri\s*=\s*\/models\s*\)/.test(stripped)) {
    throw new Error(`${relativePath} must treat /models as an exact SPA route only`)
  }

  if (!/location\s+~\s+\^\/c\/\[A-Za-z0-9\]\+\$/.test(stripped)) {
    throw new Error(`${relativePath} must keep the /c/<slug> permalink proxy`)
  }

  if (!/location\s+=\s+\/internal\/metrics\/host/.test(stripped)) {
    throw new Error(`${relativePath} must keep the exact-match /internal/metrics/host proxy`)
  }

  if (!/location\s+~\*\s+\\\.\(js\|css\)\$/.test(stripped)) {
    throw new Error(`${relativePath} must keep long-lived JS/CSS cache rules`)
  }

  return { relativePath, ok: true }
}

if (require.main === module) {
  try {
    const result = checkNginxSslSpa()
    console.log(`${result.relativePath}: unknown /models/<slug> returns 404 via @spa_or_404`)
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

module.exports = { SSL_CONF, checkNginxSslSpa }
