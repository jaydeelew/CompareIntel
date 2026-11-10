import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { expect, test } from '@playwright/test'
import {
  buildCoverage,
  collectCommand,
  evaluateCoverage,
  formatGateFailure,
  stableManifest,
  type CoverageManifest,
  type Registry,
} from './coverage-lib.js'
import { contentExpectsKatex } from './render-ready.js'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))

function writeReply(dir: string, modelId: string, promptName: string): string {
  const fileName = `${modelId.replace(/\//g, '_')}_${promptName}.json`
  const replyPath = path.posix.join('runs', 'fixture', fileName)
  fs.mkdirSync(path.join(dir, 'runs', 'fixture'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, replyPath),
    JSON.stringify({
      modelId,
      promptName,
      response: `Saved reply for ${promptName}`,
      finishReason: 'stop',
      truncated: false,
    })
  )
  return replyPath
}

test('fake registry model with no fixtures fails and names the collect command', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-missing-'))
  fs.mkdirSync(path.join(root, 'runs'))
  fs.writeFileSync(path.join(root, 'coverage-allowlist.json'), JSON.stringify({ entries: [] }))
  const registry: Registry = {
    models_by_provider: {
      Test: [
        { id: 'test/no-fixtures', category: 'Language' },
        { id: 'test/painter', category: 'Image', supports_image_generation: true },
      ],
    },
  }
  const manifest = {
    version: 1 as const,
    imageOnlyRule: 'test',
    prompts: [],
    excludedImageModels: ['test/painter'],
    allowlist: [],
    models: {},
    totals: {
      registryModels: 2,
      textModels: 1,
      imageModels: 1,
      allowlisted: 0,
      cells: 0,
      pass: 0,
      notCovered: 0,
      fail: 0,
      incomplete: 0,
      sourceIssue: 0,
      missing: 0,
    },
  }
  const result = evaluateCoverage({ registry, manifest, harnessRoot: root })
  expect(result.ok).toBe(false)
  const text = formatGateFailure(result)
  expect(text).toContain('test/no-fixtures')
  expect(text).not.toContain('test/painter')
  expect(text).toContain(collectCommand(['test/no-fixtures']))
  expect(text).toContain('npm run harness -- --models=test/no-fixtures --max-usd=2')
})

test('a fail cell fails the gate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-fail-'))
  const registry: Registry = {
    models_by_provider: {
      Test: [{ id: 'test/bad-render', category: 'Language' }],
    },
  }
  const prompts = [
    '01-math-basics',
    '02-markdown-formatting',
    '03-code-blocks',
    '04-mixed-markdown-latex',
    '05-complex-scenarios',
    '06-edge-cases-boundaries',
  ]
  const row: CoverageManifest['models'][string] = {}
  for (const promptName of prompts) {
    row[promptName] = {
      status: promptName === '01-math-basics' ? 'fail' : 'pass',
      replyPath: writeReply(root, 'test/bad-render', promptName),
    }
  }
  const manifest = {
    version: 1 as const,
    imageOnlyRule: 'test',
    prompts,
    excludedImageModels: [],
    allowlist: [],
    models: { 'test/bad-render': row },
    totals: {
      registryModels: 1,
      textModels: 1,
      imageModels: 0,
      allowlisted: 0,
      cells: 6,
      pass: 5,
      notCovered: 0,
      fail: 1,
      incomplete: 0,
      sourceIssue: 0,
      missing: 0,
    },
  }
  const result = evaluateCoverage({ registry, manifest, harnessRoot: root })
  expect(result.ok).toBe(false)
  expect(result.badCells.map(cell => `${cell.modelId} ${cell.promptName} ${cell.status}`)).toEqual([
    'test/bad-render 01-math-basics fail',
  ])
  expect(formatGateFailure(result)).toContain('npm run harness -- --models=test/bad-render --max-usd=2')
})

test('the current repo coverage gate passes', () => {
  const manifest = buildCoverage(harnessRoot)
  const onDisk = fs.readFileSync(path.join(harnessRoot, 'coverage.json'), 'utf8')
  expect(onDisk).toBe(stableManifest(manifest))
  expect(manifest.allowlist).toEqual([])
  expect(manifest.excludedImageModels.length).toBeGreaterThan(0)
  expect(manifest.excludedImageModels.every(id => !manifest.models[id])).toBe(true)
  const registry = JSON.parse(
    fs.readFileSync(path.join(harnessRoot, '../backend/data/models_registry.json'), 'utf8')
  ) as Registry
  const result = evaluateCoverage({
    registry,
    manifest,
    harnessRoot,
    allowlist: manifest.allowlist,
  })
  expect(result.missingModels).toEqual([])
  expect(result.badCells).toEqual([])
  expect(result.ok).toBe(true)
  expect(manifest.totals.fail).toBe(0)
  expect(manifest.totals.incomplete).toBe(0)
  expect(manifest.totals.missing).toBe(0)
  expect(manifest.totals.textModels).toBe(Object.keys(manifest.models).length)
})

test('katex readiness ignores currency, fences, and delimiter mentions', () => {
  expect(contentExpectsKatex('$$x^2 + y^2 = 1$$')).toBe(true)
  expect(contentExpectsKatex('The formula $x = 5$ is inline')).toBe(true)
  expect(contentExpectsKatex('Price is $5 today')).toBe(false)
  expect(contentExpectsKatex('```python\nprice = $50\n```')).toBe(false)
  expect(
    contentExpectsKatex(
      'Display math looks like ($$...$$ or \\[...\\]) and inline looks like ($...$).'
    )
  ).toBe(false)
})
