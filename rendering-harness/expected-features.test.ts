import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  droppedNameExpectations,
  getExpectedFeatures,
  inferAskedFeatures,
} from './expected-features.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function savedPromptText(promptName: string): string {
  const results = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'runs/2026-11-04/results.json'), 'utf-8')
  ) as { results: Array<{ promptName: string; promptText: string }> }
  const row = results.results.find(r => r.promptName === promptName)
  if (!row) throw new Error(`No saved ${promptName}`)
  return row.promptText
}

function currentPromptFile(promptName: string): string {
  return fs.readFileSync(path.join(__dirname, 'prompts', `${promptName}.md`), 'utf-8')
}

test.describe('Prompt provenance vs current prompt names', () => {
  test('saved 01 prompt does not ask for links; current 01 file does', () => {
    const saved = savedPromptText('01-math-basics')
    const current = currentPromptFile('01-math-basics')

    expect(inferAskedFeatures(saved).links).toBeUndefined()
    expect(inferAskedFeatures(current).links).toBe(true)

    const fromSaved = getExpectedFeatures('01-math-basics', saved)
    expect(fromSaved.links).toBeUndefined()
    expect(fromSaved.displayMath).toBe(true)
    expect(fromSaved.inlineMath).toBe(true)
    expect(fromSaved.currency).toBe(true)
    expect(droppedNameExpectations('01-math-basics', saved)).toContain('links')

    const fromCurrent = getExpectedFeatures('01-math-basics', current)
    expect(fromCurrent.links).toBe(true)
  })

  test('saved 04 prompt has no fenced code, so codeBlocks is not required', () => {
    const saved = savedPromptText('04-mixed-markdown-latex')
    const expected = getExpectedFeatures('04-mixed-markdown-latex', saved)
    expect(expected.codeBlocks).toBeUndefined()
    expect(expected.displayMath).toBe(true)
    expect(expected.inlineMath).toBe(true)
    expect(droppedNameExpectations('04-mixed-markdown-latex', saved)).toContain('codeBlocks')
  })

  test('name-only fallback still expects current 01 links', () => {
    const expected = getExpectedFeatures('01-math-basics')
    expect(expected.links).toBe(true)
    expect(expected.noKatexErrors).toBe(true)
    expect(expected.safeLinksOnly).toBe(true)
  })
})
