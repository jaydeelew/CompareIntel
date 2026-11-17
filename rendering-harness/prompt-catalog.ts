/**
 * Current prompt file bodies and SHA-256 hashes. Saved replies keep their
 * original promptText/promptHash; a mismatch means the cell is not collected
 * for the current prompt version (coverage status `not-covered`, not fail).
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PROMPTS, type PromptName } from './prompts-constants.js'

export interface PromptSpec {
  text: string
  hash: string
}

export function hashPromptText(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

export function loadPromptCatalog(harnessRoot: string): Map<PromptName, PromptSpec> {
  const dir = path.join(harnessRoot, 'prompts')
  const catalog = new Map<PromptName, PromptSpec>()
  for (const name of PROMPTS) {
    const text = fs.readFileSync(path.join(dir, `${name}.md`), 'utf8')
    catalog.set(name, { text, hash: hashPromptText(text) })
  }
  return catalog
}

export function promptHashesRecord(
  catalog: Map<PromptName, PromptSpec>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of PROMPTS) {
    out[name] = catalog.get(name)!.hash
  }
  return out
}

export function savedPromptHash(data: Record<string, unknown>): string | null {
  if (typeof data.promptHash === 'string' && data.promptHash.trim()) {
    return data.promptHash.trim()
  }
  if (typeof data.promptText === 'string' && data.promptText.length > 0) {
    return hashPromptText(data.promptText)
  }
  return null
}

export function replyMatchesCurrentPrompt(
  promptName: PromptName,
  data: Record<string, unknown>,
  catalog: Map<PromptName, PromptSpec>
): boolean {
  const current = catalog.get(promptName)
  if (!current) return false
  const saved = savedPromptHash(data)
  return saved === current.hash
}