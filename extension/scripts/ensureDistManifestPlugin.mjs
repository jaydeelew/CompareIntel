import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
  console.warn(`[compareintel] dist/manifest.json missing or invalid (${reason}) — running extension build...`)
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: extensionRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error('Failed to restore dist/manifest.json')
  }
}

export function ensureDistManifestPlugin(extensionRoot) {
  const manifestPath = path.join(extensionRoot, 'dist', 'manifest.json')
  let restoring = false
  let devMode = false

  function restoreManifest(reason) {
    if (restoring || isValidManifest(manifestPath)) return
    // Production build wipes dist (emptyOutDir) and races with CRXJS during dev/HMR.
    if (devMode) return
    restoring = true
    try {
      runExtensionBuild(extensionRoot, reason)
    } finally {
      restoring = false
    }
  }

  return {
    name: 'ensure-dist-manifest',
    configureServer(server) {
      devMode = true
      server.httpServer?.once('listening', () => {
        void (async () => {
          const ready = await waitForValidManifest(manifestPath)
          if (ready) {
            console.log('[compareintel] Extension manifest ready — load extension/dist in Chrome')
          } else {
            console.error(
              '[compareintel] dist/manifest.json is still missing.\n' +
                'Stop the dev server and run: npm run build -w @compareintel/extension'
            )
          }
        })()
      })
    },
    closeBundle() {
      // Dev HMR also triggers closeBundle; only validate full build output.
      if (!process.argv.includes('build')) return
      restoreManifest('build finished without manifest')
    },
  }
}
