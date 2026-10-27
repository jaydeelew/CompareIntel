#!/usr/bin/env node
/**
 * Fail if nginx/nginx.ssl.conf and frontend/index.html Content-Security-Policy
 * definitions drift. nginx may include frame-ancestors (invalid in meta CSP).
 *
 * Usage: node scripts/check-csp-sync.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const NGINX_PATH = path.join(REPO_ROOT, 'nginx/nginx.ssl.conf')
const HTML_PATH = path.join(REPO_ROOT, 'frontend/index.html')
const SENTRY_CONNECT_SRC = 'https://*.ingest.us.sentry.io'

function extractNginxCsp(content) {
  const match = content.match(/add_header\s+Content-Security-Policy\s+"([^"]+)"/)
  if (!match) {
    throw new Error(`No add_header Content-Security-Policy found in ${NGINX_PATH}`)
  }
  return match[1]
}

function extractMetaCsp(content) {
  const match = content.match(
    /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/
  )
  if (!match) {
    throw new Error(`No meta Content-Security-Policy found in ${HTML_PATH}`)
  }
  return match[1]
}

function directives(policy) {
  return policy
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
}

function withoutFrameAncestors(policy) {
  return directives(policy)
    .filter(directive => !directive.toLowerCase().startsWith('frame-ancestors'))
    .join('; ')
}

function connectSrc(policy) {
  const directive = directives(policy).find(part =>
    part.toLowerCase().startsWith('connect-src')
  )
  if (!directive) {
    throw new Error('CSP is missing connect-src')
  }
  return directive
}

function checkCspSync({ nginxContent, htmlContent } = {}) {
  const nginxCsp = extractNginxCsp(nginxContent ?? fs.readFileSync(NGINX_PATH, 'utf8'))
  const htmlCsp = extractMetaCsp(htmlContent ?? fs.readFileSync(HTML_PATH, 'utf8'))

  const nginxComparable = withoutFrameAncestors(nginxCsp)
  const htmlComparable = withoutFrameAncestors(htmlCsp)

  if (nginxComparable !== htmlComparable) {
    throw new Error(
      [
        'CSP mismatch between nginx/nginx.ssl.conf and frontend/index.html',
        '(ignoring frame-ancestors, which meta CSP cannot set).',
        `nginx: ${nginxComparable}`,
        `html:  ${htmlComparable}`,
      ].join('\n')
    )
  }

  const connect = connectSrc(nginxCsp)
  if (!connect.split(/\s+/).includes(SENTRY_CONNECT_SRC)) {
    throw new Error(
      `connect-src must allow ${SENTRY_CONNECT_SRC} so Sentry envelopes are not blocked.\n` +
        `connect-src: ${connect}`
    )
  }

  return { nginxCsp, htmlCsp, comparable: nginxComparable }
}

if (require.main === module) {
  try {
    checkCspSync()
    console.log(
      `CSP in sync (nginx ↔ index.html) and connect-src includes ${SENTRY_CONNECT_SRC}`
    )
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  SENTRY_CONNECT_SRC,
  extractNginxCsp,
  extractMetaCsp,
  withoutFrameAncestors,
  checkCspSync,
}
