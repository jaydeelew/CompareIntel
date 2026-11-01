#!/usr/bin/env node
/**
 * Fail if production SSL nginx does not 301 www.compareintel.com
 * (HTTP and HTTPS) to https://compareintel.com$request_uri, or if the
 * Let's Encrypt setup drops the www SAN required for the HTTPS hop.
 *
 * Usage: node scripts/check-nginx-www-redirect.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const SSL_CONF = 'nginx/nginx.ssl.conf'
const CERTBOT_SETUP = 'setup-compareintel-ssl.sh'
const WWW_HOST = 'www.compareintel.com'
const APEX_HOST = 'compareintel.com'
const APEX_REDIRECT = 'return 301 https://compareintel.com$request_uri;'
const CERT_PATH = '/etc/letsencrypt/live/compareintel.com/fullchain.pem'
const CERT_KEY_PATH = '/etc/letsencrypt/live/compareintel.com/privkey.pem'

const CANONICAL_FILES = [
  'frontend/src/utils/pageMeta.ts',
  'frontend/scripts/generate-sitemap.js',
  'frontend/public/sitemap.xml',
  'frontend/public/robots.txt',
  'frontend/index.html',
]

function stripComments(content) {
  return content.replace(/#.*$/gm, '')
}

function extractBracedBlock(content, openBraceIndex) {
  if (content[openBraceIndex] !== '{') {
    throw new Error(`Expected '{' at index ${openBraceIndex}`)
  }
  let depth = 0
  for (let i = openBraceIndex; i < content.length; i++) {
    const ch = content[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i)
      }
    }
  }
  throw new Error('Unbalanced braces while extracting nginx server block')
}

function findServerBlocks(content) {
  const blocks = []
  const re = /server\s*\{/g
  let match
  while ((match = re.exec(content)) !== null) {
    const openBraceIndex = match.index + match[0].lastIndexOf('{')
    const body = extractBracedBlock(content, openBraceIndex)
    const nameMatch = body.match(/server_name\s+([^;]+);/)
    const names = nameMatch ? nameMatch[1].trim().split(/\s+/).filter(Boolean) : []
    const listens = [...body.matchAll(/listen\s+([^;]+);/g)].map((item) => {
      const tokens = item[1].trim().split(/\s+/)
      return { raw: item[1].trim(), port: tokens[0] }
    })
    blocks.push({ names, listens, body })
  }
  return blocks
}

function hasListen(block, port) {
  return block.listens.some((listen) => listen.port === String(port))
}

function hasApexRedirect(body) {
  return /return\s+301\s+https:\/\/compareintel\.com\$request_uri\s*;/.test(body)
}

function checkCertbotKeepsWww(setupContent) {
  if (!/WWW_DOMAIN="www\.compareintel\.com"/.test(setupContent)) {
    throw new Error(`${CERTBOT_SETUP} must keep WWW_DOMAIN="www.compareintel.com"`)
  }
  if (!/-d\s+"\$WWW_DOMAIN"/.test(setupContent) && !/-d\s+"\$DOMAIN"\s+-d\s+"\$WWW_DOMAIN"/.test(setupContent)) {
    throw new Error(`${CERTBOT_SETUP} must pass -d "$WWW_DOMAIN" so the cert covers www`)
  }
}

function checkCanonicalUsesApex(readFile) {
  for (const relativePath of CANONICAL_FILES) {
    const text = readFile(relativePath)
    if (/https:\/\/www\.compareintel\.com/.test(text)) {
      throw new Error(`${relativePath} must not publish https://www.compareintel.com canonical URLs`)
    }
  }

  const sitemap = readFile('frontend/public/sitemap.xml')
  if (!/<loc>https:\/\/compareintel\.com\//.test(sitemap)) {
    throw new Error('frontend/public/sitemap.xml must list apex https://compareintel.com/ URLs')
  }

  const pageMeta = readFile('frontend/src/utils/pageMeta.ts')
  if (!/const BASE_URL = 'https:\/\/compareintel\.com'/.test(pageMeta)) {
    throw new Error('frontend/src/utils/pageMeta.ts canonical BASE_URL must be https://compareintel.com')
  }

  const robots = readFile('frontend/public/robots.txt')
  if (!/Sitemap:\s+https:\/\/compareintel\.com\/sitemap\.xml/.test(robots)) {
    throw new Error('frontend/public/robots.txt must point at the apex sitemap')
  }
}

function checkNginxWwwRedirect({
  content,
  setupContent,
  readFile,
} = {}) {
  const relativePath = SSL_CONF
  const raw = content ?? fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
  const setup =
    setupContent ?? fs.readFileSync(path.join(REPO_ROOT, CERTBOT_SETUP), 'utf8')
  const fileReader =
    readFile ??
    ((relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'))

  const stripped = stripComments(raw)
  const blocks = findServerBlocks(stripped)
  if (blocks.length === 0) {
    throw new Error(`${relativePath} must contain server blocks`)
  }

  const httpWww = blocks.filter(
    (block) => hasListen(block, 80) && block.names.includes(WWW_HOST)
  )
  if (httpWww.length === 0) {
    throw new Error(
      `${relativePath} must listen on port 80 for ${WWW_HOST} (ACME + HTTP www redirect)`
    )
  }
  if (!httpWww.some((block) => hasApexRedirect(block.body))) {
    throw new Error(
      `${relativePath} HTTP ${WWW_HOST} must ${APEX_REDIRECT} (preserve path and query)`
    )
  }
  if (!httpWww.some((block) => /location\s+\/\.well-known\/acme-challenge\//.test(block.body))) {
    throw new Error(
      `${relativePath} HTTP ${WWW_HOST} must still serve /.well-known/acme-challenge/ for cert renewal`
    )
  }

  const httpsWww = blocks.filter(
    (block) => hasListen(block, 443) && block.names.includes(WWW_HOST)
  )
  if (httpsWww.length !== 1) {
    throw new Error(
      `${relativePath} must contain exactly one HTTPS server_name ${WWW_HOST} block (found ${httpsWww.length})`
    )
  }
  const wwwHttps = httpsWww[0]
  if (wwwHttps.names.length !== 1 || wwwHttps.names[0] !== WWW_HOST) {
    throw new Error(
      `${relativePath} HTTPS ${WWW_HOST} must be its own server block (do not serve the site on www)`
    )
  }
  if (!hasApexRedirect(wwwHttps.body)) {
    throw new Error(
      `${relativePath} HTTPS ${WWW_HOST} must ${APEX_REDIRECT} (preserve path and query)`
    )
  }
  if (!wwwHttps.body.includes(CERT_PATH) || !wwwHttps.body.includes(CERT_KEY_PATH)) {
    throw new Error(
      `${relativePath} HTTPS ${WWW_HOST} must use the existing Let's Encrypt cert at ${CERT_PATH}`
    )
  }
  if (/try_files\b/.test(wwwHttps.body) || /proxy_pass\b/.test(wwwHttps.body)) {
    throw new Error(
      `${relativePath} HTTPS ${WWW_HOST} must only redirect; do not serve the site or proxy on www`
    )
  }

  const httpsApex = blocks.filter(
    (block) => hasListen(block, 443) && block.names.includes(APEX_HOST)
  )
  if (httpsApex.length !== 1) {
    throw new Error(
      `${relativePath} must contain exactly one HTTPS server_name ${APEX_HOST} block (found ${httpsApex.length})`
    )
  }
  const apex = httpsApex[0]
  if (apex.names.includes(WWW_HOST)) {
    throw new Error(
      `${relativePath} HTTPS apex server_name must be ${APEX_HOST} only (www would 200 the full site)`
    )
  }
  if (apex.names.length !== 1 || apex.names[0] !== APEX_HOST) {
    throw new Error(`${relativePath} HTTPS apex server_name must be exactly ${APEX_HOST}`)
  }

  checkCertbotKeepsWww(setup)
  checkCanonicalUsesApex(fileReader)

  return { relativePath, redirect: APEX_REDIRECT, wwwHost: WWW_HOST, apexHost: APEX_HOST }
}

if (require.main === module) {
  try {
    const result = checkNginxWwwRedirect()
    console.log(
      `${result.relativePath}: ${result.wwwHost} 301s to https://${result.apexHost}$request_uri (HTTP + HTTPS)`
    )
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  SSL_CONF,
  CERTBOT_SETUP,
  WWW_HOST,
  APEX_HOST,
  APEX_REDIRECT,
  checkNginxWwwRedirect,
}
