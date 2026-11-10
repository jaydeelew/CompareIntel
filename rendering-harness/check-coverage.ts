#!/usr/bin/env node
/**
 * Fail the build when a text-capable registry model has no saved harness
 * replies, or any cell is fail or incomplete. Models added since the base
 * branch are re-rendered offline (`--render-only`); this process never calls
 * OpenRouter.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  PROMPTS,
  buildCoverage,
  collectCommand,
  evaluateCoverage,
  formatGateFailure,
  modelsNewVersusBase,
  stableManifest,
  type Registry,
} from './coverage-lib.js'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(harnessRoot, '..')
const coveragePath = path.join(harnessRoot, 'coverage.json')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function loadRegistryFile(): Registry {
  const registryPath = path.join(repoRoot, 'backend/data/models_registry.json')
  return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Registry
}

function registryAtRef(ref: string): Registry {
  const proc = spawnSync('git', ['show', `${ref}:backend/data/models_registry.json`], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (proc.status !== 0) {
    throw new Error(proc.stderr || `git show ${ref} failed`)
  }
  return JSON.parse(proc.stdout) as Registry
}

function renderNewModels(modelIds: string[], manifestModels: ReturnType<typeof buildCoverage>['models']): string[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-coverage-'))
  const errors: string[] = []
  try {
    for (const modelId of modelIds) {
      const row = manifestModels[modelId]
      for (const promptName of PROMPTS) {
        const replyPath = row?.[promptName]?.replyPath
        if (!replyPath) {
          errors.push(`${modelId} ${promptName} has no saved reply to render`)
          continue
        }
        const source = path.join(harnessRoot, replyPath)
        if (!fs.existsSync(source)) {
          errors.push(`${modelId} ${promptName} reply missing at ${replyPath}`)
          continue
        }
        fs.copyFileSync(source, path.join(tmp, path.basename(replyPath)))
      }
    }
    if (errors.length > 0) return errors

    const env = { ...process.env }
    delete env.OPENROUTER_API_KEY
    const proc = spawnSync(
      'npm',
      ['run', 'harness', '--', '--render-only', `--render-dir=${tmp}`],
      { cwd: harnessRoot, encoding: 'utf8', env, timeout: 10 * 60 * 1000 }
    )
    const resultsPath = path.join(tmp, 'results.json')
    if (!fs.existsSync(resultsPath)) {
      const tail = `${proc.stdout || ''}\n${proc.stderr || ''}`.trim().slice(-1200)
      return [
        `Offline render did not write results.json (exit ${proc.status}).`,
        tail,
        collectCommand(modelIds),
      ]
    }
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8')) as {
      results?: Array<{ modelId?: string; promptName?: string; validationStatus?: string }>
    }
    const bad = (parsed.results || []).filter(result => {
      const status = result.validationStatus || 'incomplete'
      return status === 'fail' || status === 'incomplete' || status === 'truncated'
    })
    if (proc.status !== 0 || bad.length > 0) {
      const named = bad.map(result => `${result.modelId} ${result.promptName}: ${result.validationStatus}`)
      return [
        'Offline render of models new versus the base branch failed an assertion:',
        ...named.map(line => `- ${line}`),
        proc.stderr?.trim().slice(-800) || '',
        collectCommand(modelIds),
      ].filter(Boolean)
    }
    return []
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const built = buildCoverage(harnessRoot)
const onDisk = fs.existsSync(coveragePath) ? fs.readFileSync(coveragePath, 'utf8') : ''
if (onDisk !== stableManifest(built)) {
  fail('coverage.json is stale. From rendering-harness run: npm run generate-coverage')
}

const gate = evaluateCoverage({
  registry: loadRegistryFile(),
  manifest: built,
  harnessRoot,
  allowlist: built.allowlist,
})
if (!gate.ok) fail(formatGateFailure(gate))

const baseRef = process.env.COVERAGE_BASE_REF || 'origin/master'
let baseRegistry: Registry
try {
  baseRegistry = registryAtRef(baseRef)
} catch (error) {
  if (process.env.CI === 'true') {
    fail(`Coverage gate could not read the base registry at ${baseRef}: ${error}`)
  }
  console.log(`Coverage gate passed (static). Base registry ${baseRef} is unavailable; new-model render skipped.`)
  process.exit(0)
}

const allow = new Set(built.allowlist.map(entry => entry.modelId))
const fresh = modelsNewVersusBase(baseRegistry, loadRegistryFile()).filter(id => !allow.has(id))
if (fresh.length === 0) {
  console.log(
    `Coverage gate passed. ${built.totals.textModels} text models, ` +
      `${built.totals.pass} pass, ${built.totals.notCovered} not-covered, ` +
      `${built.totals.imageModels} image-only excluded. No new text models versus ${baseRef}.`
  )
  process.exit(0)
}

console.log(`Rendering saved replies for text models new versus ${baseRef}: ${fresh.join(', ')}`)
const renderErrors = renderNewModels(fresh, built.models)
if (renderErrors.length > 0) fail(renderErrors.join('\n'))
console.log(`Coverage gate passed, including offline render of ${fresh.join(', ')}.`)
