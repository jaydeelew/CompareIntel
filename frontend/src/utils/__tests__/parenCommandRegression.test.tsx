/**
 * PR 216 left `\(...\)` bodies that contain a TeX command as literal text
 * (`[^\\]*?` never matched `\frac` / `\det` / `\begin`, then leftover
 * unescaping removed the delimiters). These 18 saved cells are the full
 * replies that regressed against 07b866b. Each assertion covers the whole
 * reply, not a one-line snippet.
 */
import fs from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

import {
  REPO_ROOT,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
} from './renderingAudit'

const RAW_MARKERS = ['\\(', '\\[', '\\begin{', '\\frac']

const REGRESSED_CELLS: Array<{
  modelId: string
  promptName: string
  /** Mid-paragraph fence must come back as pre/code. */
  fencedSnippet?: string
}> = [
  { modelId: 'deepseek/deepseek-v4-flash', promptName: '04-mixed-markdown-latex' },
  {
    modelId: 'meta-llama/llama-3.3-70b-instruct',
    promptName: '06-edge-cases-boundaries',
    fencedSnippet: 'price = $50',
  },
  { modelId: 'openai/gpt-6.1-terra', promptName: '04-mixed-markdown-latex' },
  { modelId: 'x-ai/grok-4.7', promptName: '04-mixed-markdown-latex' },
  { modelId: 'deepseek/deepseek-v3.2', promptName: '06-edge-cases-boundaries' },
  { modelId: 'openai/gpt-5.3-codex', promptName: '01-math-basics' },
  { modelId: 'openai/gpt-5.3-codex', promptName: '05-complex-scenarios' },
  { modelId: 'openai/gpt-5.5', promptName: '05-complex-scenarios' },
  { modelId: 'openai/gpt-5.6-luna', promptName: '01-math-basics' },
  { modelId: 'openai/gpt-5.6-luna', promptName: '05-complex-scenarios' },
  { modelId: 'openai/gpt-5.6-sol', promptName: '01-math-basics' },
  { modelId: 'openai/gpt-5.6-sol', promptName: '05-complex-scenarios' },
  { modelId: 'openai/gpt-6-luna', promptName: '01-math-basics' },
  { modelId: 'openai/gpt-6-luna', promptName: '05-complex-scenarios' },
  { modelId: 'openai/gpt-6.1-terra', promptName: '01-math-basics' },
  { modelId: 'x-ai/grok-4.3', promptName: '01-math-basics' },
  { modelId: 'x-ai/grok-4.3', promptName: '06-edge-cases-boundaries' },
  { modelId: 'x-ai/grok-4.7', promptName: '01-math-basics' },
]

interface RollupCell {
  batch?: string
  modelId: string
  promptName: string
  sourceFile?: string | null
  attempt?: string
}

function loadRollupCells(): RollupCell[] {
  const rollup = path.join(
    REPO_ROOT,
    'rendering-harness/runs/2026-11-08-21-incomplete/unique-partial-82-models-rollup.json'
  )
  const data = JSON.parse(fs.readFileSync(rollup, 'utf8')) as { cells: RollupCell[] }
  return data.cells
}

function replyPath(cell: RollupCell): string {
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
  const cell = loadRollupCells().find(c => c.modelId === modelId && c.promptName === promptName)
  if (!cell) throw new Error(`rollup has no ${modelId} ${promptName}`)
  const data = JSON.parse(fs.readFileSync(replyPath(cell), 'utf8')) as { response?: string }
  if (!data.response) throw new Error(`empty response for ${modelId} ${promptName}`)
  return data.response
}

function counts(values: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1)
  return map
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('PR 216 paren-command regressions (full saved reply)', () => {
  it.each(REGRESSED_CELLS.map(cell => [cell.modelId, cell.promptName, cell] as const))(
    '%s %s',
    (_modelId, _promptName, cell) => {
      const markdown = loadReply(cell.modelId, cell.promptName)
      const { container } = render(<LatexRenderer modelId={cell.modelId}>{markdown}</LatexRenderer>)
      const el = container.querySelector('.latex-content') as HTMLElement
      expect(el, 'latex root').toBeTruthy()

      const ref = signatureFromHtml(renderReferenceHtml(markdown))
      const actual = signatureFromElement(el)
      const refTex = counts(ref.texSources)
      const actualTex = counts(actual.texSources)
      const missing: string[] = []
      for (const [tex, count] of refTex) {
        if ((actualTex.get(tex) ?? 0) < count) missing.push(tex)
      }
      expect(missing, `reference TeX missing from DOM:\n${missing.slice(0, 6).join('\n')}`).toEqual(
        []
      )

      const raw = actual.leftoverDelimiters.filter(marker => RAW_MARKERS.includes(marker))
      expect(raw, 'literal TeX left in visible prose').toEqual([])

      if (cell.fencedSnippet) {
        const fences = Array.from(el.querySelectorAll('pre code')).map(
          node => node.textContent || ''
        )
        expect(fences.some(text => text.includes(cell.fencedSnippet!))).toBe(true)
      }
    }
  )
})
