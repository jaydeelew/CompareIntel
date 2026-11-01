import fs from 'node:fs'
import path from 'node:path'

/**
 * CRXJS ships content scripts as ESM loaders + web-accessible modules.
 * Those modules can run against the page's `chrome` object (no `runtime`),
 * which throws: Cannot read properties of undefined (reading 'sendMessage').
 *
 * Rebuild them as classic IIFEs so Chrome injects them in the isolated world
 * with the real extension APIs, then point the dist manifest at those files.
 */
export function classicContentScriptsPlugin(extensionRoot) {
  return {
    name: 'classic-content-scripts',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const dist = path.join(extensionRoot, 'dist')
        const manifestPath = path.join(dist, 'manifest.json')
        if (!fs.existsSync(manifestPath)) return

        const esbuild = await import('esbuild')
        const contentDir = path.join(dist, 'content')
        fs.mkdirSync(contentDir, { recursive: true })

        const coreExtensionBridge = path.resolve(
          extensionRoot,
          '../packages/compare-core/src/extensionBridge/index.ts'
        )

        await esbuild.build({
          absWorkingDir: extensionRoot,
          entryPoints: [path.join(extensionRoot, 'src/content/webAppBridge.ts')],
          bundle: true,
          format: 'iife',
          outfile: path.join(contentDir, 'webAppBridge.js'),
          platform: 'browser',
          target: 'chrome109',
          legalComments: 'none',
          alias: {
            '@compareintel/core': coreExtensionBridge,
          },
        })

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const scripts = manifest.content_scripts
        for (const script of scripts ?? []) {
          script.js = (script.js ?? []).map((file) =>
            String(file).includes('webAppBridge') ? 'content/webAppBridge.js' : file,
          )
        }

        if (Array.isArray(manifest.web_accessible_resources)) {
          manifest.web_accessible_resources = manifest.web_accessible_resources
            .map((entry) => ({
              ...entry,
              resources: entry.resources.filter(
                (resource) =>
                  !resource.includes('selection.ts') && !resource.includes('webAppBridge.ts')
              ),
            }))
            .filter((entry) => entry.resources.length > 0)
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

        const assetsDir = path.join(dist, 'assets')
        if (fs.existsSync(assetsDir)) {
          for (const name of fs.readdirSync(assetsDir)) {
            if (name.startsWith('selection.ts') || name.startsWith('webAppBridge.ts')) {
              fs.unlinkSync(path.join(assetsDir, name))
            }
          }
        }
      },
    },
  }
}
