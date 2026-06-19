#!/usr/bin/env node
/**
 * Package the built extension into compareintel-extension.zip for Chrome Web Store upload.
 */
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import archiver from 'archiver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const outZip = path.resolve(__dirname, '../compareintel-extension.zip')

const output = createWriteStream(outZip)
const archive = archiver('zip', { zlib: { level: 9 } })

archive.on('error', (err) => {
  throw err
})

output.on('close', () => {
  console.log(`Packaged extension: ${outZip} (${archive.pointer()} bytes)`)
})

archive.pipe(output)
archive.directory(distDir, false)
await archive.finalize()
