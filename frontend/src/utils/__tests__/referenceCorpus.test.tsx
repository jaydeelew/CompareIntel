/**
 * Every saved harness reply against the independent markdown-it + KaTeX
 * reference: visible text, lists, tables, code, blockquotes, emphasis, and
 * TeX. A difference is allowed only when that cell is on the checked-in
 * allowlist, and only for the fields that entry names.
 *
 * The Rendering Harness Tests job runs this file in four shards.
 */
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

import {
  REPO_ROOT,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
  compareSignatures,
  type Diff,
} from './renderingAudit'
import { REFERENCE_ALLOWLIST, allowlistKey } from './renderingAudit/referenceAllowlist'

const SHARDS = 4
const PROMPTS = [
  '01-math-basics',
  '02-markdown-formatting',
  '03-code-blocks',
  '04-mixed-markdown-latex',
  '05-complex-scenarios',
  '06-edge-cases-boundaries',
] as const

interface SavedCell {
  modelId: string
  promptName: string
  batch?: string
  sourceFile?: string | null
  attempt?: string
}

function replyPath(cell: SavedCell): string {
  const fileName = cell.sourceFile || `${cell.modelId.replace(/\//g, '_')}_${cell.promptName}.json`
  const batchDir = path.join(REPO_ROOT, 'rendering-harness/runs', cell.batch || '')
  const attempt = cell.attempt || 'original'
  if (attempt.startsWith('rerun')) {
    const overlay = path.join(batchDir, 'reruns', fileName)
    if (fs.existsSync(overlay)) return overlay
  }
  const direct = path.join(batchDir, fileName)
  if (fs.existsSync(direct)) return direct
  throw new Error(`missing saved reply ${fileName} (${attempt})`)
}

function loadCorpus(): Array<SavedCell & { markdown: string }> {
  const rollup = path.join(
    REPO_ROOT,
    'rendering-harness/runs/2026-11-08-21-incomplete/unique-partial-82-models-rollup.json'
  )
  const data = JSON.parse(fs.readFileSync(rollup, 'utf8')) as { cells: SavedCell[] }
  const cells = [...data.cells]
  for (const promptName of PROMPTS) {
    cells.push({
      modelId: 'openai/gpt-5.4-pro',
      promptName,
      batch: '2026-11-08-20c',
      sourceFile: `openai_gpt-5.4-pro_${promptName}.json`,
      attempt: 'original',
    })
  }
  return cells.map(cell => {
    const saved = JSON.parse(fs.readFileSync(replyPath(cell), 'utf8')) as { response?: string }
    if (!saved.response) {
      throw new Error(`empty response for ${cell.modelId} ${cell.promptName}`)
    }
    return { ...cell, markdown: saved.response }
  })
}

const CORPUS = loadCorpus()

const ALLOWED = new Map(
  REFERENCE_ALLOWLIST.map(entry => [allowlistKey(entry.modelId, entry.promptName), entry])
)

function clip(value: string, max = 180): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** First source line that contains the visible-text snippet around a mismatch. */
function sourceLineAt(source: string, needle: string): { line: number; text: string } {
  const lines = source.split('\n')
  const probe = needle.replace(/\s+/g, ' ').trim().slice(0, 48)
  if (probe.length >= 8) {
    const idx = lines.findIndex(
      line => line.includes(probe) || (line.trim().length >= 8 && probe.includes(line.trim()))
    )
    if (idx >= 0) return { line: idx + 1, text: lines[idx] }
  }
  return { line: 1, text: lines[0] ?? '' }
}

function describeDiff(source: string, diff: Diff): string {
  const expected =
    typeof diff.expected === 'string' ? diff.expected : JSON.stringify(diff.expected, null, 2)
  const actual =
    typeof diff.actual === 'string' ? diff.actual : JSON.stringify(diff.actual, null, 2)
  if (!expected.includes('\n') && !actual.includes('\n')) {
    const n = Math.min(expected.length, actual.length)
    let index = 0
    while (index < n && expected[index] === actual[index]) index += 1
    const around = expected.slice(Math.max(0, index - 24), index + 24)
    const loc = sourceLineAt(source, around)
    return [
      `field: ${diff.field}`,
      `first differing line ${loc.line}: ${loc.text}`,
      `reference: ${clip(expected.slice(Math.max(0, index - 40)))}`,
      `rendered: ${clip(actual.slice(Math.max(0, index - 40)))}`,
    ].join('\n')
  }
  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')
  const count = Math.max(expectedLines.length, actualLines.length)
  for (let i = 0; i < count; i += 1) {
    if ((expectedLines[i] ?? '') !== (actualLines[i] ?? '')) {
      return [
        `field: ${diff.field}`,
        `first differing line ${i + 1}:`,
        `reference: ${clip(expectedLines[i] ?? '')}`,
        `rendered: ${clip(actualLines[i] ?? '')}`,
      ].join('\n')
    }
  }
  return `field: ${diff.field}`
}

function failureMessage(
  modelId: string,
  promptName: string,
  diffs: Diff[],
  source: string
): string {
  const primary = diffs.find(diff => diff.field === 'visibleText') ?? diffs[0]
  const rest = diffs.filter(diff => diff !== primary).map(diff => diff.field)
  return [
    `${modelId} · ${promptName}`,
    describeDiff(source, primary),
    rest.length ? `also differs: ${rest.join(', ')}` : '',
    'raw source section:',
    source,
  ]
    .filter(Boolean)
    .join('\n')
}

function assertAllowlistShape(): void {
  const corpusKeys = new Set(CORPUS.map(cell => allowlistKey(cell.modelId, cell.promptName)))
  expect(corpusKeys.size, 'saved cells are unique').toBe(CORPUS.length)
  const seen = new Set<string>()
  for (const entry of REFERENCE_ALLOWLIST) {
    const key = allowlistKey(entry.modelId, entry.promptName)
    expect(seen.has(key), `duplicate allowlist entry ${entry.modelId} ${entry.promptName}`).toBe(
      false
    )
    seen.add(key)
    expect(
      entry.reason.trim().length,
      `${entry.modelId} ${entry.promptName} reason`
    ).toBeGreaterThan(0)
    expect(entry.fields.length, `${entry.modelId} ${entry.promptName} fields`).toBeGreaterThan(0)
    const sorted = [...entry.fields].sort()
    expect(entry.fields, `${entry.modelId} ${entry.promptName} fields must be sorted`).toEqual(
      sorted
    )
    expect(new Set(entry.fields).size, `${entry.modelId} ${entry.promptName} duplicate field`).toBe(
      entry.fields.length
    )
    expect(
      corpusKeys.has(key),
      `allowlist cell is not in the 498: ${entry.modelId} ${entry.promptName}`
    ).toBe(true)
  }
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('saved replies match the markdown-it + KaTeX reference', () => {
  it.each([0, 1, 2, 3])(
    'shard %s',
    shard => {
      if (shard === 0) assertAllowlistShape()
      const cells = CORPUS.filter((_, index) => index % SHARDS === shard)
      const failures: string[] = []
      let matched = 0
      let allowlisted = 0
      const started = Date.now()

      for (const cell of cells) {
        const { container, unmount } = render(
          <LatexRenderer modelId={cell.modelId}>{cell.markdown}</LatexRenderer>
        )
        try {
          const root = container.querySelector('.latex-content') as HTMLElement | null
          if (!root) {
            failures.push(
              `${cell.modelId} · ${cell.promptName}\nno .latex-content root\nraw source section:\n${cell.markdown}`
            )
            continue
          }
          const diffs = compareSignatures(
            signatureFromHtml(renderReferenceHtml(cell.markdown)),
            signatureFromElement(root)
          ).diffs
          const fields = diffs.map(diff => diff.field).sort()
          const entry = ALLOWED.get(allowlistKey(cell.modelId, cell.promptName))
          if (fields.length === 0) {
            if (entry) {
              failures.push(
                `${cell.modelId} · ${cell.promptName}\nstale allowlist entry: this cell matches the reference (${entry.reason})\nraw source section:\n${cell.markdown}`
              )
            } else {
              matched += 1
            }
            continue
          }
          if (!entry) {
            failures.push(failureMessage(cell.modelId, cell.promptName, diffs, cell.markdown))
            continue
          }
          if (entry.fields.join('\0') !== fields.join('\0')) {
            failures.push(
              [
                `${cell.modelId} · ${cell.promptName}`,
                `allowlist permits [${entry.fields.join(', ')}] but the cell differs in [${fields.join(', ')}]`,
                `reason on the entry: ${entry.reason}`,
                describeDiff(
                  cell.markdown,
                  diffs.find(diff => diff.field === 'visibleText') ?? diffs[0]
                ),
                'raw source section:',
                cell.markdown,
              ].join('\n')
            )
            continue
          }
          allowlisted += 1
        } finally {
          unmount()
          cleanup()
        }
      }

      const elapsed = Date.now() - started
      console.log(
        `reference corpus shard ${shard}: ${cells.length} cells in ${elapsed}ms, ${matched} match, ${allowlisted} allowlisted`
      )
      expect(failures, failures.join('\n\n---\n\n')).toEqual([])
    },
    180_000
  )
})
