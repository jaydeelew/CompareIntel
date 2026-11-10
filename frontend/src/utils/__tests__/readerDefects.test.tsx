/**
 * Group (b) from the 498-cell allowlist: defects a reader would notice.
 * A cell that was fixed must match the markdown-it + KaTeX reference.
 * A cell that is still allowlisted may differ only in the fields that
 * entry names.
 */
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

import {
  REPO_ROOT,
  compareSignatures,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
  type Diff,
} from './renderingAudit'
import { REFERENCE_ALLOWLIST } from './renderingAudit/referenceAllowlist'

const ALLOWED = new Map(
  REFERENCE_ALLOWLIST.map(entry => [
    `${entry.modelId}\u0000${entry.promptName}`,
    new Set(entry.fields),
  ])
)

const DEFECTS: Array<[string, string]> = [
  ['anthropic/claude-fable-5.1', '05-complex-scenarios'],
  ['google/gemini-4-argon', '05-complex-scenarios'],
  ['google/gemma-3-27b-it', '06-edge-cases-boundaries'],
  ['meta-llama/llama-4-maverick', '05-complex-scenarios'],
  ['meta-llama/llama-4-maverick', '06-edge-cases-boundaries'],
  ['meta-llama/llama-4-scout', '04-mixed-markdown-latex'],
  ['microsoft/phi-4', '05-complex-scenarios'],
  ['minimax/minimax-m3.1-flash', '05-complex-scenarios'],
  ['mistralai/codestral-2508', '06-edge-cases-boundaries'],
  ['mistralai/mistral-medium-3.1', '06-edge-cases-boundaries'],
  ['mistralai/mistral-small-3.2-24b-instruct', '05-complex-scenarios'],
  ['openai/gpt-5-nano', '01-math-basics'],
  ['openai/gpt-5-nano', '05-complex-scenarios'],
  ['openai/gpt-oss-120b', '05-complex-scenarios'],
  ['qwen/qwen3-30b-a3b-instruct-2507', '01-math-basics'],
  ['qwen/qwen3-next-80b-a3b-instruct', '06-edge-cases-boundaries'],
  ['stepfun/step-5-preview', '02-markdown-formatting'],
  ['xiaomi/mimo-v2.5', '04-mixed-markdown-latex'],
  ['z-ai/glm-5.3-flash', '06-edge-cases-boundaries'],
]

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

function loadReply(modelId: string, promptName: string): string {
  const rollup = path.join(
    REPO_ROOT,
    'rendering-harness/runs/2026-11-08-21-incomplete/unique-partial-82-models-rollup.json'
  )
  const data = JSON.parse(fs.readFileSync(rollup, 'utf8')) as { cells: SavedCell[] }
  const cell = data.cells.find(
    entry => entry.modelId === modelId && entry.promptName === promptName
  )
  if (!cell) throw new Error(`rollup has no ${modelId} ${promptName}`)
  const saved = JSON.parse(fs.readFileSync(replyPath(cell), 'utf8')) as { response?: string }
  if (!saved.response) throw new Error(`empty response for ${modelId} ${promptName}`)
  return saved.response
}

function firstDiff(diff: Diff): string {
  const expected = typeof diff.expected === 'string' ? diff.expected : JSON.stringify(diff.expected)
  const actual = typeof diff.actual === 'string' ? diff.actual : JSON.stringify(diff.actual)
  const n = Math.min(expected.length, actual.length)
  let index = 0
  while (index < n && expected[index] === actual[index]) index += 1
  return `${diff.field} @${index} ref ${expected.slice(Math.max(0, index - 40), index + 80)} | us ${actual.slice(Math.max(0, index - 40), index + 80)}`
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('reader-visible allowlist defects match the reference', () => {
  it.each(DEFECTS)(
    '%s %s',
    (modelId, promptName) => {
      const markdown = loadReply(modelId, promptName)
      const { container, unmount } = render(
        <LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>
      )
      try {
        const root = container.querySelector('.latex-content') as HTMLElement
        const diffs = compareSignatures(
          signatureFromHtml(renderReferenceHtml(markdown)),
          signatureFromElement(root)
        ).diffs
        const allowed = ALLOWED.get(`${modelId}\u0000${promptName}`) ?? new Set<string>()
        const unexpected = diffs.filter(diff => !allowed.has(diff.field))
        const summary = unexpected.map(firstDiff).join('\n')
        expect(
          unexpected.map(diff => diff.field).sort(),
          `${modelId} ${promptName}\n${summary}`
        ).toEqual([])
      } finally {
        unmount()
        cleanup()
      }
    },
    20_000
  )
})
