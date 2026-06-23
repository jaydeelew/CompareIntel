import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runExtensionBuild } from './ensureDistManifestPlugin.mjs'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(extensionRoot, 'dist', 'manifest.json')

function isValidManifest(filePath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return manifest.manifest_version === 3 && manifest.name && manifest.version
  } catch {
    return false
  }
}

if (!isValidManifest(manifestPath)) {
  runExtensionBuild(extensionRoot, 'predev check')
}
