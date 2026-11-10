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

test('unique coverage uses the complete rerun, not the empty original', async () => {
  const cells = await loadUniqueSavedCells()
  expect(cells).toHaveLength(498)
  expect(cells.filter(cell => cell.emptyVisible || cell.error)).toEqual([])
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
