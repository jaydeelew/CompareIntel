import { test, expect } from '@playwright/test'
import { loadUniqueSavedCells } from './saved-cells.js'

const RERUN_CELLS = [
  'openai/gpt-5-nano:01-math-basics',
  'openai/gpt-5-nano:02-markdown-formatting',
  'openai/gpt-5-nano:03-code-blocks',
  'openai/gpt-5-nano:04-mixed-markdown-latex',
  'openai/gpt-5-nano:05-complex-scenarios',
  'openai/gpt-5-nano:06-edge-cases-boundaries',
  'deepseek/deepseek-v4-flash:01-math-basics',
  'z-ai/glm-5.3-flash:04-mixed-markdown-latex',
  'z-ai/glm-5.3-flash:05-complex-scenarios',
  'tencent/hy4-preview:01-math-basics',
  'z-ai/glm-5.2:01-math-basics',
  'z-ai/glm-5.3:04-mixed-markdown-latex',
]

const RETIRED_IDS = ['deepseek/deepseek-v4.1-flash', 'tencent/hy4-preview']
const RENAMED_IDS = ['deepseek/deepseek-v4.1-flash-1017', 'tencent/hy4']

test('unique coverage uses the complete rerun, not the empty original', async () => {
  const cells = await loadUniqueSavedCells()
  // 538 saved text-model cells for current registry models (including 24 for
  // models removed on 2026-11-16), plus 12 pre-rename replies that #231 left in place.
  // runs/2026-11-18-pr274 re-collected the five #259 models on all eight prompts.
  expect(cells).toHaveLength(550)
  // Two 2026-11-18 replies are reasoning-only (finish_reason=length, no visible text). A third
  // (hy4-flash 06) is empty too, but the complete 2026-11-17 reply for that cell stays in the unique set.
  expect(
    cells.filter(cell => cell.emptyVisible || cell.error).map(cell => `${cell.modelId}:${cell.promptName}`).sort()
  ).toEqual([
    'google/gemini-4-carbon:08-casual-prose',
    'tencent/hy4-flash:08-casual-prose',
  ])
  const retired = cells.filter(cell => RETIRED_IDS.includes(cell.modelId))
  expect(retired).toHaveLength(12)
  expect(retired.every(cell => cell.response.trim().length > 0)).toBe(true)
  for (const modelId of RENAMED_IDS) {
    const renamed = cells.filter(cell => cell.modelId === modelId)
    expect(renamed, modelId).toHaveLength(6)
    expect(renamed.every(cell => cell.response.trim().length > 0), modelId).toBe(true)
  }
  for (const spec of RERUN_CELLS) {
    const splitAt = spec.indexOf(':')
    const cell = cells.find(
      item => item.modelId === spec.slice(0, splitAt) && item.promptName === spec.slice(splitAt + 1)
    )
    expect(cell, spec).toBeTruthy()
    expect(cell?.filePath, spec).toContain('/reruns/')
    expect(cell?.response.trim().length, spec).toBeGreaterThan(0)
    expect(cell?.truncated, spec).toBe(false)
  }
})
