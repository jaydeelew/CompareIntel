#!/usr/bin/env node
/**
 * Count saved cells whose rendered HTML still has undelimited LaTeX outside code.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadUniqueSavedCells } from '../saved-cells.js'

const harnessRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(harnessRoot, '..')

const SOURCE_RE =
  /(?<!\$)(?<![A-Za-z])\\(?:sqrt|frac|dfrac|tfrac|cdot|times|pi|theta|alpha|beta|gamma|le|ge|leq|geq|approx)\b/

async function main() {
  const cells = await loadUniqueSavedCells()
  const flagged: string[] = []
  for (const cell of cells) {
    if (cell.emptyVisible || cell.truncated || cell.error) continue
  const text = cell.response
  if (SOURCE_RE.test(text)) {
      const outsideCode = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
      if (SOURCE_RE.test(outsideCode)) {
        flagged.push(`${cell.modelId}:${cell.promptName} (${path.relative(harnessRoot, cell.filePath)})`)
      }
    }
  }
  const out = { total: cells.length, sourceFlagged: flagged.length, flagged }
  console.log(JSON.stringify(out, null, 2))
  fs.writeFileSync(path.join(harnessRoot, 'raw-latex-source-audit.json'), JSON.stringify(out, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})