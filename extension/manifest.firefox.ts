/**
 * Firefox manifest overlay.
 * Firefox does not support chrome.sidePanel — use sidebar_action instead.
 * Apply at build time with FIREFOX_BUILD=1.
 */
import { defineManifest } from '@crxjs/vite-plugin'

import { createFirefoxManifest } from './src/shared/extensionManifest'

export default defineManifest((env) => createFirefoxManifest(env))
