/**
 * Vite plugin: make Cloudflare Pages (and VITE_DEPLOY_ENV=preview) builds
 * preview-safe — noindex, mock API artifacts, no production secrets.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

import { applyPreviewDeployEnv, isPreviewDeployFromEnv } from './src/config/deployEnv'
import { applyPreviewNoIndex, PREVIEW_ROBOTS_CONTENT } from './src/preview/artifacts'

const __dirname = dirname(fileURLToPath(import.meta.url))

function cloudflareFile(name: '_headers' | '_redirects'): string {
  return readFileSync(join(__dirname, 'cloudflare', name), 'utf8')
}

function fixtureJson(name: string): string {
  return readFileSync(join(__dirname, 'src', 'preview', 'fixtures', name), 'utf8')
}

export function isPreviewViteBuild(): boolean {
  return isPreviewDeployFromEnv(process.env)
}

/**
 * Strip production secrets and force the mock API base before Vite inlines env.
 */
export function preparePreviewBuildEnv(): boolean {
  return applyPreviewDeployEnv(process.env)
}

export function previewDeployPlugin(): Plugin {
  const preview = isPreviewViteBuild()
  let outDir = 'dist'

  return {
    name: 'preview-deploy',
    configResolved(config) {
      outDir = config.build.outDir
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!preview) return html
        return applyPreviewNoIndex(html)
      },
    },
    closeBundle() {
      if (!preview) return
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, '_headers'), cloudflareFile('_headers'))
      writeFileSync(join(outDir, '_redirects'), cloudflareFile('_redirects'))
      writeFileSync(join(outDir, 'robots.txt'), PREVIEW_ROBOTS_CONTENT)

      const previewApiDir = join(outDir, 'preview-api')
      mkdirSync(previewApiDir, { recursive: true })
      writeFileSync(join(previewApiDir, 'models.json'), fixtureJson('models.json'))
      writeFileSync(
        join(previewApiDir, 'credits-balance.json'),
        fixtureJson('credits-balance.json')
      )
      writeFileSync(
        join(previewApiDir, 'rate-limit-status.json'),
        fixtureJson('rate-limit-status.json')
      )
    },
  }
}
