import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const NESTED_BUILD_ENV = 'COMPAREINTEL_EXTENSION_BUILDING'

function isValidManifest(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    return manifest.manifest_version === 3 && manifest.name && manifest.version
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForValidManifest(manifestPath, { timeoutMs = 30000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (isValidManifest(manifestPath)) return true
    await sleep(intervalMs)
  }
  return isValidManifest(manifestPath)
}

export function runExtensionBuild(extensionRoot, reason) {
  if (process.env[NESTED_BUILD_ENV] === '1') {
    throw new Error(`Refusing nested extension build (${reason})`)
  }
  console.warn(`[compareintel] dist/manifest.json missing or invalid (${reason}) — running extension build...`)
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: extensionRoot,
    stdio: 'inherit',
    env: { ...process.env, [NESTED_BUILD_ENV]: '1' },
  })
  if (result.status !== 0) {
    throw new Error('Failed to restore dist/manifest.json')
  }
}

export function ensureDistManifestPlugin(extensionRoot) {
  const manifestPath = path.join(extensionRoot, 'dist', 'manifest.json')

  return {
    name: 'ensure-dist-manifest',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        void (async () => {
          const ready = await waitForValidManifest(manifestPath)
          if (ready) {
            console.log('[compareintel] Extension manifest ready — load extension/dist in Chrome')
          } else {
            console.error(
              '[compareintel] dist/manifest.json is still missing.\n' +
                'Stop the dev server and run: npm run build -w @compareintel/extension',
            )
          }
        })()
      })
    },
    // CRXJS fires closeBundle on intermediate Rollup jobs before it writes
    // dist/manifest.json. Respawning `vite build` from that hook emptied dist
    // and looped until timeout. Production validation lives in
    // scripts/assert-dist-manifest.mjs instead.
  }
}
