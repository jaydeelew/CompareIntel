#!/usr/bin/env node
/**
 * Fail if production nginx configs do not exact-match proxy
 * GET /internal/metrics/host to the backend (Pulse). Other /internal
 * paths must stay unproxied; auth remains backend METRICS_TOKEN only.
 *
 * Usage: node scripts/check-nginx-metrics-proxy.js
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const PROD_NGINX_CONFIGS = ['nginx/nginx.ssl.conf', 'nginx/nginx.prod.conf']
const METRICS_PATH = '/internal/metrics/host'
const LOCATION_DIRECTIVE = `location = ${METRICS_PATH}`

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
  throw new Error('Unbalanced braces while extracting nginx location block')
}

function findLocationBlocks(content) {
  const blocks = []
  const re = /location\s+([=^~*]{1,2}\s+)?([^\s{]+)\s*\{/g
  let match
  while ((match = re.exec(content)) !== null) {
    const modifier = (match[1] || '').trim()
    const uri = match[2]
    const openBraceIndex = match.index + match[0].lastIndexOf('{')
    blocks.push({
      modifier,
      uri,
      body: extractBracedBlock(content, openBraceIndex),
    })
  }
  return blocks
}

function requireDirective(body, pattern, message) {
  if (!pattern.test(body)) {
    throw new Error(message)
  }
}

function checkConfig(relativePath, { content } = {}) {
  const absPath = path.join(REPO_ROOT, relativePath)
  const raw = content ?? fs.readFileSync(absPath, 'utf8')
  const stripped = stripComments(raw)
  const blocks = findLocationBlocks(stripped)

  const metricsBlocks = blocks.filter(
    (block) => block.modifier === '=' && block.uri === METRICS_PATH
  )
  if (metricsBlocks.length !== 1) {
    throw new Error(
      `${relativePath} must contain exactly one '${LOCATION_DIRECTIVE}' block (found ${metricsBlocks.length})`
    )
  }

  const otherInternal = blocks.filter((block) => {
    const isMetricsExact = block.modifier === '=' && block.uri === METRICS_PATH
    if (isMetricsExact) return false
    const uri = block.uri
    return (
      uri === '/internal' ||
      uri.startsWith('/internal/') ||
      uri.includes('/internal')
    )
  })
  if (otherInternal.length > 0) {
    const listed = otherInternal
      .map((block) => `${block.modifier || 'prefix'} ${block.uri}`)
      .join(', ')
    throw new Error(
      `${relativePath} must not proxy other /internal paths (found: ${listed})`
    )
  }

  const body = metricsBlocks[0].body

  requireDirective(
    body,
    /proxy_pass\s+http:\/\/backend:8000\s*;/,
    `${relativePath} ${LOCATION_DIRECTIVE} must proxy_pass http://backend:8000 (no URI suffix)`
  )
  requireDirective(
    body,
    /proxy_set_header\s+Authorization\s+\$http_authorization\s*;/,
    `${relativePath} ${LOCATION_DIRECTIVE} must forward Authorization to the backend`
  )
  requireDirective(
    body,
    /proxy_cache\s+off\s*;/,
    `${relativePath} ${LOCATION_DIRECTIVE} must disable proxy caching`
  )
  requireDirective(
    body,
    /add_header\s+Cache-Control\s+"[^"]*no-store[^"]*"\s+always\s*;/,
    `${relativePath} ${LOCATION_DIRECTIVE} must add Cache-Control no-store`
  )

  const forbiddenAuth = [/auth_basic\b/, /\bsatisfy\b/, /auth_request\b/]
  for (const pattern of forbiddenAuth) {
    if (pattern.test(body)) {
      throw new Error(
        `${relativePath} ${LOCATION_DIRECTIVE} must not add nginx auth; backend METRICS_TOKEN is the only check`
      )
    }
  }

  return { relativePath, location: LOCATION_DIRECTIVE }
}

function checkNginxMetricsProxy(configs) {
  const targets = configs ?? PROD_NGINX_CONFIGS.map((relativePath) => ({ relativePath }))
  return targets.map((target) => checkConfig(target.relativePath, target))
}

if (require.main === module) {
  try {
    const results = checkNginxMetricsProxy()
    for (const result of results) {
      console.log(`${result.relativePath}: ${result.location} proxies to backend (no other /internal paths)`)
    }
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  PROD_NGINX_CONFIGS,
  METRICS_PATH,
  LOCATION_DIRECTIVE,
  checkConfig,
  checkNginxMetricsProxy,
}
