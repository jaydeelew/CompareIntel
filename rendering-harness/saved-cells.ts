/**
 * Unique saved harness replies. One cell per model and prompt. A complete
 * later attempt, including a file under runs/<batch>/reruns/, replaces a
 * truncated or empty original. That is the same rule as uniqueCoverageRecords
 * and the batch rollups. The current registry is 83 text models x 6 prompts
 * = 498. Pre-rename replies for tencent/hy4-preview and
 * deepseek/deepseek-v4.1-flash stay beside the renamed copies, so the unique
 * saved set is 510.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { isEmptyVisibleReply, isTruncatedReply, uniqueCoverageRecords } from './overall-status.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SKIP_JSON = new Set([
  'summary.json',
  'manifest.json',
  'catalog.json',
  'prompts.json',
  'coverage.json',
  'unique-coverage.json',
  'next-batch-preflight.json',
  'summary-partial.json',
  'results.json',
])

export interface SavedCell {
  modelId: string
  modelName: string
  promptName: string
  promptText: string
  response: string
  timestamp: string
  filePath: string
  truncated: boolean
  emptyVisible: boolean
  finishReason: string | null
  nativeFinishReason: string | null
  error?: string
}

export function cellKey(modelId: string, promptName: string): string {
  return `${modelId}:${promptName}`
}

function replyFile(name: string): boolean {
  return name.endsWith('.json') && !name.startsWith('unique-') && !SKIP_JSON.has(name)
}

async function readCell(filePath: string): Promise<SavedCell | null> {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof data.modelId !== 'string' || typeof data.promptName !== 'string') return null
  if (typeof data.response !== 'string') return null
  const error =
    data.error == null ? undefined : typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
  return {
    modelId: data.modelId,
    modelName: typeof data.modelName === 'string' ? data.modelName : data.modelId,
    promptName: data.promptName,
    promptText: typeof data.promptText === 'string' ? data.promptText : '',
    response: data.response,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : '',
    filePath,
    truncated: isTruncatedReply({
      truncated: data.truncated === true,
      finishReason: typeof data.finishReason === 'string' ? data.finishReason : null,
      nativeFinishReason: typeof data.nativeFinishReason === 'string' ? data.nativeFinishReason : null,
    }),
    emptyVisible: isEmptyVisibleReply(data.response),
    finishReason: typeof data.finishReason === 'string' ? data.finishReason : null,
    nativeFinishReason: typeof data.nativeFinishReason === 'string' ? data.nativeFinishReason : null,
    error,
  }
}

export async function loadUniqueSavedCells(runsDir = path.join(__dirname, 'runs')): Promise<SavedCell[]> {
  const entries = await fs.readdir(runsDir, { withFileTypes: true })
  const found: SavedCell[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(runsDir, entry.name)
    const names = await fs.readdir(dir)
    const files = names.filter(replyFile).map(name => path.join(dir, name))
    const rerunsDir = path.join(dir, 'reruns')
    try {
      const reruns = await fs.readdir(rerunsDir)
      for (const name of reruns) {
        if (replyFile(name)) files.push(path.join(rerunsDir, name))
      }
    } catch {
      // This batch has no reruns directory.
    }
    for (const filePath of files) {
      const cell = await readCell(filePath)
      if (cell) found.push(cell)
    }
  }
  return uniqueCoverageRecords(found)
}

export async function findSavedCell(spec: string, runsDir?: string): Promise<SavedCell> {
  const splitAt = spec.indexOf(':')
  if (splitAt <= 0) throw new Error(`Expected --cell=<model>:<prompt>, got ${spec}`)
  const modelId = spec.slice(0, splitAt)
  const promptName = spec.slice(splitAt + 1)
  const cells = await loadUniqueSavedCells(runsDir)
  const cell = cells.find(item => item.modelId === modelId && item.promptName === promptName)
  if (!cell) throw new Error(`No saved cell for ${modelId}:${promptName} among ${cells.length} unique cells`)
  return cell
}
