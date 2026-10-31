import { defineManifest } from '@crxjs/vite-plugin'

import { createChromeManifest } from './src/shared/extensionManifest'

export default defineManifest((env) => createChromeManifest(env))
