#!/usr/bin/env node
/**
 * Count saved cells whose rendered HTML still has undelimited LaTeX outside code.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadUniqueSavedCells } from '../saved-cells.js'
import { findUndelimitedMatches, stripDelimitedMathAndCode } from './strip-prose-for-audit.js'

const harnessRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function naiveCellScan(response: string): string[] {
  const re =
    /(?<![A-Za-z$])\\(?:sqrt|frac|dfrac|tfrac|cdot|times|pi|theta|alpha|beta|gamma|le|ge|leq|geq|approx)\b/g
  return [...new Set([...response.matchAll(re)].map(m => m[0]))]
}

async function main() {
  const cells = await loadUniqueSavedCells()
  let naiveFlagged = 0
  const flagged: Array<{ key: string; matches: string[]; excerpt: string; path: string }> = []
  for (const cell of cells) {
    if (cell.emptyVisible || cell.truncated || cell.error) continue
    if (naiveCellScan(cell.response).length > 0) naiveFlagged++
    const matches = findUndelimitedMatches(cell.response)
    if (matches.length === 0) continue
    const stripped = stripDelimitedMathAndCode(cell.response)
    const line =
      stripped
        .split('\n')
        .find(l => /\\(?:sqrt|frac|pi|theta)\b/.test(l))
        ?.trim()
        .slice(0, 140) ?? stripped.slice(0, 140)
    flagged.push({
      key: `${cell.modelId}:${cell.promptName}`,
      matches: [...new Set(matches)],
      excerpt: line,
      path: path.relative(harnessRoot, cell.filePath),
    })
  }
  const out = {
    total: cells.length,
    naiveUndelimitedCmdScanNoStripping: naiveFlagged,
    undelimitedInProseAfterStripping: flagged.length,
    examples: flagged.slice(0, 10),
    flagged,
  }
  console.log(JSON.stringify({ ...out, flagged: undefined, examples: out.examples }, null, 2))
  fs.writeFileSync(path.join(harnessRoot, 'raw-latex-source-audit.json'), JSON.stringify(out, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})