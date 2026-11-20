import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect, test } from '@playwright/test'
import { buildCoverageFrom, evaluateCoverage, type Registry } from './coverage-lib.js'
import { hashPromptText } from './prompt-catalog.js'

test('stale prompt hash and missing optional prompts stay not-covered without failing the gate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-fresh-'))
  const promptsDir = path.join(root, 'prompts')
  fs.mkdirSync(promptsDir, { recursive: true })

  const names = [
    '01-math-basics',
    '02-markdown-formatting',
    '03-code-blocks',
    '04-mixed-markdown-latex',
    '05-complex-scenarios',
    '06-edge-cases-boundaries',
    '07-rare-formats',
    '08-casual-prose',
  ] as const

  const current02 = '# Test Prompt: Markdown Formatting\n\nnew body\n'
  const stale02 = '# Test Prompt: Markdown Formatting\n\nold body\n'

  for (const name of names) {
    const body = name === '02-markdown-formatting' ? current02 : `# ${name}\n`
    fs.writeFileSync(path.join(promptsDir, `${name}.md`), body)
  }

  const runsDir = path.join(root, 'runs', 'fixture')
  fs.mkdirSync(runsDir, { recursive: true })

  function writeReply(promptName: string, promptText: string) {
    const fileName = `test_model_${promptName}.json`
    fs.writeFileSync(
      path.join(runsDir, fileName),
      JSON.stringify({
        modelId: 'test/model',
        promptName,
        promptText,
        promptHash: hashPromptText(promptText),
        response: `reply for ${promptName}`,
        finishReason: 'stop',
        truncated: false,
      })
    )
  }

  for (const name of names) {
    if (name === '07-rare-formats' || name === '08-casual-prose') continue
    const text =
      name === '02-markdown-formatting' ? stale02 : fs.readFileSync(path.join(promptsDir, `${name}.md`), 'utf8')
    writeReply(name, text)
  }

  fs.writeFileSync(path.join(root, 'coverage-allowlist.json'), JSON.stringify({ entries: [] }))

  const registry: Registry = {
    models_by_provider: {
      Test: [{ id: 'test/model', category: 'Language' }],
    },
  }

  const manifest = buildCoverageFrom(root, registry)
  const row = manifest.models['test/model']
  expect(row['02-markdown-formatting'].status).toBe('not-covered')
  expect(row['02-markdown-formatting'].replyPath).toBeTruthy()
  expect(row['07-rare-formats'].status).toBe('not-covered')
  expect(row['08-casual-prose'].status).toBe('not-covered')
  expect(row['01-math-basics'].status).toBe('incomplete')

  const gate = evaluateCoverage({ registry, manifest, harnessRoot: root })
  expect(gate.ok).toBe(false)
  expect(gate.missingModels).toEqual([])
  expect(gate.badCells.some(cell => cell.promptName === '02-markdown-formatting')).toBe(false)
})