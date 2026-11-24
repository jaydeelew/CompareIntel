#!/usr/bin/env node
/**
 * Fail if production nginx does not return a real HTTP 404 for unknown
 * URLs, or if /privacy is not a 301 to /privacy-policy.
 *
 * try_files /404.html =404 is rejected: when 404.html exists, nginx serves
 * that file with HTTP 200. The status has to come from error_page.
 *
 * Usage: node scripts/check-nginx-ssl-spa.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const SSL_CONF = 'nginx/nginx.ssl.conf'
const PROD_CONF = 'nginx/nginx.prod.conf'
const CONFIGS = [SSL_CONF, PROD_CONF]
const SPA_DOCUMENTS = ['admin', 'reset-password', 'terms']

function stripComments(content) {
  return content.replace(/#.*$/gm, '')
}

function checkNginxSpaRouting(relativePath, raw) {
  const stripped = stripComments(raw)

  if (!/error_page\s+404\s+\/404\.html\s*;/.test(stripped)) {
    throw new Error(`${relativePath} must use error_page 404 /404.html so the status stays 404`)
  }

  if (!/location\s+=\s+\/404\.html\s*\{[^}]*\binternal\s*;[^}]*\}/s.test(stripped)) {
    throw new Error(`${relativePath} must serve /404.html from an internal location`)
  }

  if (/try_files\s+\/404\.html\s+=404\s*;/.test(stripped)) {
    throw new Error(
      `${relativePath} must not try_files /404.html =404 (that returns HTTP 200 when the file exists)`
    )
  }

  if (/try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/.test(stripped)) {
    throw new Error(
      `${relativePath} must not SPA-fallback unknown routes with try_files ... /index.html`
    )
  }

  if (!/try_files\s+\$uri\s+\$uri\/index\.html\s+=404\s*;/.test(stripped)) {
    throw new Error(`${relativePath} location / must use try_files $uri $uri/index.html =404`)
  }

  if (
    !/location\s+=\s+\/privacy\s*\{[^}]*return\s+301\s+\/privacy-policy\$is_args\$args\s*;/s.test(
      stripped
    )
  ) {
    throw new Error(`${relativePath} must 301 /privacy to /privacy-policy`)
  }

  for (const route of SPA_DOCUMENTS) {
    const pattern = new RegExp(
      `location\\s+=\\s+\\/${route}\\s*\\{[^}]*try_files\\s+\\/${route}/index\\.html\\s+/index\\.html\\s+=404\\s*;`,
      's'
    )
    if (!pattern.test(stripped)) {
      throw new Error(
        `${relativePath} must serve /${route} from its shell or /index.html with status 200`
      )
    }
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

function checkNginxSslSpa({ content, relativePath } = {}) {
  if (content != null) {
    return checkNginxSpaRouting(relativePath || SSL_CONF, content)
  }
  return CONFIGS.map(file =>
    checkNginxSpaRouting(file, fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
  )
}

if (require.main === module) {
  try {
    const results = checkNginxSslSpa()
    for (const result of results) {
      console.log(
        `${result.relativePath}: unknown URLs return 404; /privacy 301s to /privacy-policy`
      )
    }
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

module.exports = { SSL_CONF, PROD_CONF, CONFIGS, checkNginxSslSpa, checkNginxSpaRouting }
