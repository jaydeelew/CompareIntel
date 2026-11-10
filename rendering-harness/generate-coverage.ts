#!/usr/bin/env node
/**
 * Write rendering-harness/coverage.json from the registry and saved replies.
 * `--check` exits 1 when the checked-in manifest differs. No network calls.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildCoverage, stableManifest } from './coverage-lib.js'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const coveragePath = path.join(harnessRoot, 'coverage.json')
const check = process.argv.includes('--check')
const built = buildCoverage(harnessRoot)
const text = stableManifest(built)

if (check) {
  const current = fs.existsSync(coveragePath) ? fs.readFileSync(coveragePath, 'utf8') : ''
  if (current !== text) {
    console.error('coverage.json is stale. From rendering-harness run: npm run generate-coverage')
    process.exit(1)
  }
  console.log(
    `coverage.json matches (${built.totals.textModels} text models, ` +
      `${built.totals.pass} pass, ${built.totals.notCovered} not-covered, ` +
      `${built.totals.fail} fail, ${built.totals.incomplete} incomplete)`
  )
  process.exit(0)
}

fs.writeFileSync(coveragePath, text)
console.log(
  `Wrote ${path.relative(harnessRoot, coveragePath)}: ` +
    `${built.totals.textModels} text models, ${built.totals.imageModels} image-only excluded, ` +
    `${built.totals.pass} pass, ${built.totals.notCovered} not-covered, ` +
    `${built.totals.fail} fail, ${built.totals.incomplete} incomplete, ` +
    `${built.totals.allowlisted} allowlisted`
)
