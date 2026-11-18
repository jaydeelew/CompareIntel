import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const configsPath = path.resolve(harnessRoot, '../frontend/src/config/model_renderer_configs.json')
const responsePath = path.join(harnessRoot, 'fixtures/undelimited-prose-latex-response.md')

export const SYNTHETIC_UNDELIMITED_PROMPT = '07-undelimited-prose-latex' as const

export interface SyntheticCell {
  modelId: string
  modelName: string
  promptName: string
  promptText: string
  response: string
  timestamp: string
  synthetic: true
}

let cachedResponse: string | null = null

export function syntheticProseLatexResponse(): string {
  if (cachedResponse === null) {
    cachedResponse = fs.readFileSync(responsePath, 'utf8')
  }
  return cachedResponse
}

export function listRendererConfigModelIds(): string[] {
  const raw = JSON.parse(fs.readFileSync(configsPath, 'utf8')) as Array<{ modelId: string }>
  return raw.map(row => row.modelId).sort()
}

export function buildSyntheticUndelimitedCells(): SyntheticCell[] {
  const response = syntheticProseLatexResponse()
  const ts = new Date().toISOString()
  return listRendererConfigModelIds().map(modelId => ({
    modelId,
    modelName: modelId,
    promptName: SYNTHETIC_UNDELIMITED_PROMPT,
    promptText: 'Synthetic undelimited LaTeX in prose with currency/code/path guards',
    response,
    timestamp: ts,
    synthetic: true,
  }))
}