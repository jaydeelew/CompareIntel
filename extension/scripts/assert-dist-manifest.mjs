import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(extensionRoot, 'dist', 'manifest.json')

function fail(message) {
  console.error(`[compareintel] ${message}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
} catch {
  fail(`production build finished without a readable ${path.relative(extensionRoot, manifestPath)}`)
}

if (manifest.manifest_version !== 3 || !manifest.name || !manifest.version) {
  fail('dist/manifest.json is not a valid MV3 manifest')
}

const serialized = JSON.stringify(manifest)
if (serialized.includes('localhost') || serialized.includes('127.0.0.1')) {
  fail('production manifest must not include localhost host permissions or matches')
}

const sidePanelExposed = (manifest.web_accessible_resources ?? []).some((entry) =>
  (entry.resources ?? []).some((resource) => String(resource).includes('sidepanel')),
)
if (sidePanelExposed) {
  fail('production manifest must not expose the side panel via web_accessible_resources')
}

console.log(
  `[compareintel] production manifest ok (version ${manifest.version}, no localhost, side panel not web-accessible)`,
)
