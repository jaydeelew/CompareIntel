/**
 * Coverage manifest for text-capable registry models.
 *
 * Image-only rule (registry fields only):
 * A model is image-only, and excluded from the harness, when `category` is
 * exactly `"Image"`. Every other category (Language, Code, Reasoning,
 * Multimodal, Language/Reasoning, and any future non-Image value) is
 * text-capable and must have a saved reply for each of the six prompts.
 * `supports_image_generation` is recorded by admin add alongside category,
 * but the gate does not read it: `run-harness.ts` already skips
 * `category === "Image"`, and that is the field stored on every registry row.
 * `output_modalities` is not a registry field. Admin add sets category to
 * `"Image"` only when OpenRouter `architecture.output_modalities` contains
 * `"image"` (`_is_image_generation_model`).
 *
 * Saved-reply choice:
 * Unique-partial rollups under runs/ supply the curated status. For each
 * (model, prompt), a complete reply (non-empty, not finish-reason truncated)
 * beats an incomplete file even when an older rollup still says pass.
 * `runs/<batch>/reruns/<file>.json` is the complete later attempt when the
 * top-level JSON is still the truncated original. When several complete
 * rollup cells exist, the cell from the rollup directory whose name sorts
 * last wins (`2026-11-08-21-incomplete` after `2026-11-08-20c`). Replies that
 * are not named by any rollup (admin adds) take status from the newest
 * matching `results.json` entry, or `incomplete` until a render records one.
 * Directory mtimes are not used: git checkout stamps them together.
 */
import fs from 'fs'
import path from 'path'
import { isIncompleteReply } from './overall-status.js'

export const PROMPTS = [
  '01-math-basics',
  '02-markdown-formatting',
  '03-code-blocks',
  '04-mixed-markdown-latex',
  '05-complex-scenarios',
  '06-edge-cases-boundaries',
] as const

export type PromptName = (typeof PROMPTS)[number]

export const IMAGE_ONLY_RULE =
  'A registry model is image-only, and excluded from this manifest, when its category field is exactly "Image". Every other category is text-capable and needs a saved reply for each of the six rendering-harness prompts. supports_image_generation is not consulted. output_modalities is not a registry field; admin add copies an image output modality into category "Image".'

export const CONCLUSIVE_STATUSES = ['pass', 'not-covered', 'fail', 'source-issue'] as const
export type CellStatus = (typeof CONCLUSIVE_STATUSES)[number] | 'incomplete'

const ALLOWED_STATUSES = new Set<CellStatus>(['pass', 'not-covered', 'source-issue'])

const SKIP_REPLY_BASENAMES = new Set([
  'summary.json',
  'manifest.json',
  'catalog.json',
  'prompts.json',
  'coverage.json',
  'unique-coverage.json',
  'next-batch-preflight.json',
  'summary-partial.json',
  'guard-global-state.json',
  'results.json',
])

export interface RegistryModel {
  id: string
  category?: string
  name?: string
  supports_image_generation?: boolean
}

export interface Registry {
  models_by_provider?: Record<string, RegistryModel[]>
}

export interface AllowEntry {
  modelId: string
  reason: string
}

export interface PromptCell {
  status: CellStatus
  replyPath: string | null
}

export interface CoverageManifest {
  version: 1
  imageOnlyRule: string
  prompts: string[]
  excludedImageModels: string[]
  allowlist: AllowEntry[]
  models: Record<string, Record<string, PromptCell>>
  totals: {
    registryModels: number
    textModels: number
    imageModels: number
    allowlisted: number
    cells: number
    pass: number
    notCovered: number
    fail: number
    incomplete: number
    sourceIssue: number
    missing: number
  }
}

export interface GateProblem {
  modelId: string
  promptName?: string
  status?: string
  replyPath?: string | null
  detail: string
}

export interface GateResult {
  ok: boolean
  missingModels: GateProblem[]
  badCells: GateProblem[]
}

interface ReplyFile {
  absPath: string
  relPath: string
  batchKey: string
  modelId: string
  promptName: string
  complete: boolean
}

interface Candidate extends ReplyFile {
  overlayKey: string
  fromRollup: boolean
  rollupStatus: CellStatus | null
  resultsStatus: CellStatus | null
}

export function isImageOnlyModel(model: RegistryModel): boolean {
  return model.category === 'Image'
}

export function listRegistryModels(registry: Registry): RegistryModel[] {
  const out: RegistryModel[] = []
  const seen = new Set<string>()
  for (const models of Object.values(registry.models_by_provider || {})) {
    if (!Array.isArray(models)) continue
    for (const model of models) {
      if (!model || typeof model.id !== 'string' || seen.has(model.id)) continue
      seen.add(model.id)
      out.push(model)
    }
  }
  return out
}

export function textModels(registry: Registry): RegistryModel[] {
  return listRegistryModels(registry).filter(model => !isImageOnlyModel(model))
}

export function collectCommand(modelIds: string[]): string {
  const ids = [...new Set(modelIds)].filter(Boolean).sort()
  const usd = Math.max(2, ids.length * 2)
  return `npm run harness -- --models=${ids.join(',')} --max-usd=${usd}`
}

export function formatGateFailure(result: GateResult): string {
  const lines: string[] = []
  if (result.missingModels.length > 0) {
    lines.push(
      'Text-capable registry models lack saved harness replies for all six prompts:'
    )
    for (const model of result.missingModels) {
      lines.push(`- ${model.modelId}: ${model.detail}`)
    }
  }
  if (result.badCells.length > 0) {
    lines.push('Harness cells are fail or incomplete:')
    for (const cell of result.badCells) {
      lines.push(
        `- ${cell.modelId} ${cell.promptName}: ${cell.status} (${cell.replyPath || 'no reply file'})`
      )
    }
  }
  const ids = [
    ...result.missingModels.map(model => model.modelId),
    ...result.badCells.map(cell => cell.modelId),
  ]
  if (ids.length > 0) {
    lines.push('')
    lines.push(
      'Collect the saved replies from rendering-harness. Estimate the cost first with --dry-run, then:'
    )
    lines.push(collectCommand(ids))
  }
  return lines.join('\n')
}

export function loadAllowlist(harnessRoot: string): AllowEntry[] {
  const allowPath = path.join(harnessRoot, 'coverage-allowlist.json')
  if (!fs.existsSync(allowPath)) return []
  const raw = JSON.parse(fs.readFileSync(allowPath, 'utf8')) as { entries?: AllowEntry[] }
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  for (const entry of entries) {
    if (!entry || typeof entry.modelId !== 'string' || !entry.modelId.trim()) {
      throw new Error('coverage-allowlist.json entry is missing modelId')
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(
        `coverage-allowlist.json entry for ${entry.modelId} needs a non-empty reason`
      )
    }
  }
  return entries
    .map(entry => ({ modelId: entry.modelId.trim(), reason: entry.reason.trim() }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function asCellStatus(value: unknown): CellStatus | null {
  if (value === 'pass' || value === 'not-covered' || value === 'fail' || value === 'source-issue') {
    return value
  }
  if (value === 'incomplete' || value === 'truncated') return 'incomplete'
  return null
}

function replyComplete(data: {
  truncated?: boolean
  finishReason?: string | null
  nativeFinishReason?: string | null
  response?: string | null
}): boolean {
  return !isIncompleteReply({
    truncated: data.truncated,
    finishReason: data.finishReason,
    nativeFinishReason: data.nativeFinishReason,
    response: typeof data.response === 'string' ? data.response : '',
  })
}

function conventionalName(modelId: string, promptName: string): string {
  return `${modelId.replace(/\//g, '_')}_${promptName}.json`
}

interface RollupCell {
  batch?: string
  modelId?: string
  promptName?: string
  validationStatus?: string
  sourceFile?: string | null
  overlayKey: string
}

function loadRollupCells(runsDir: string): RollupCell[] {
  if (!fs.existsSync(runsDir)) return []
  const cells: RollupCell[] = []
  for (const batch of fs.readdirSync(runsDir)) {
    const batchDir = path.join(runsDir, batch)
    if (!fs.statSync(batchDir).isDirectory()) continue
    for (const name of fs.readdirSync(batchDir)) {
      if (!name.startsWith('unique-partial-') || !name.endsWith('.json')) continue
      const data = readJson(path.join(batchDir, name)) as { cells?: RollupCell[] }
      for (const cell of data.cells || []) {
        cells.push({ ...cell, overlayKey: batch })
      }
    }
  }
  return cells
}

function resolveRollupReply(
  runsDir: string,
  cell: RollupCell
): { absPath: string; relPath: string; batchKey: string } | null {
  if (!cell.batch || !cell.modelId || !cell.promptName) return null
  const fileName =
    cell.sourceFile && cell.sourceFile !== 'null'
      ? cell.sourceFile
      : conventionalName(cell.modelId, cell.promptName)
  const options = [
    path.join(runsDir, cell.batch, 'reruns', fileName),
    path.join(runsDir, cell.batch, fileName),
  ]
  const existing = options.filter(candidate => fs.existsSync(candidate))
  if (existing.length === 0) return null
  const complete = existing.find(candidate => {
    const data = readJson(candidate) as { response?: string }
    return replyComplete(data as { response?: string | null })
  })
  const chosen = complete || existing[0]
  return {
    absPath: chosen,
    relPath: path.posix.join('runs', path.relative(runsDir, chosen).split(path.sep).join('/')),
    batchKey: cell.batch,
  }
}

function indexResults(runsDir: string): Map<string, CellStatus> {
  const index = new Map<string, CellStatus>()
  if (!fs.existsSync(runsDir)) return index
  const files: string[] = []
  for (const batch of fs.readdirSync(runsDir)) {
    const batchDir = path.join(runsDir, batch)
    if (!fs.statSync(batchDir).isDirectory()) continue
    const direct = path.join(batchDir, 'results.json')
    if (fs.existsSync(direct)) files.push(direct)
    const nested = path.join(batchDir, 'reruns', 'results.json')
    if (fs.existsSync(nested)) files.push(nested)
  }
  for (const filePath of files) {
    const data = readJson(filePath) as { results?: Array<Record<string, unknown>> }
    for (const entry of data.results || []) {
      const modelId = entry.modelId
      const promptName = entry.promptName
      if (typeof modelId !== 'string' || typeof promptName !== 'string') continue
      if (!replyComplete(entry as { response?: string | null })) continue
      const status = asCellStatus(entry.validationStatus) || asCellStatus(
        (entry.validation as { status?: string } | undefined)?.status
      )
      if (!status || status === 'incomplete') continue
      const source = typeof entry.sourceFile === 'string' ? path.posix.basename(entry.sourceFile) : ''
      const key = `${modelId}::${promptName}::${source}`
      index.set(key, status)
      index.set(`${modelId}::${promptName}`, status)
    }
  }
  return index
}

function scanReplyFiles(runsDir: string): ReplyFile[] {
  if (!fs.existsSync(runsDir)) return []
  const found: ReplyFile[] = []
  for (const batch of fs.readdirSync(runsDir)) {
    const batchDir = path.join(runsDir, batch)
    if (!fs.statSync(batchDir).isDirectory()) continue
    const levels = [batchDir, path.join(batchDir, 'reruns')]
    for (const dir of levels) {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.json') || SKIP_REPLY_BASENAMES.has(name) || name.startsWith('unique-')) {
          continue
        }
        const absPath = path.join(dir, name)
        if (!fs.statSync(absPath).isFile()) continue
        let data: Record<string, unknown>
        try {
          data = readJson(absPath) as Record<string, unknown>
        } catch {
          continue
        }
        if (typeof data.modelId !== 'string' || typeof data.promptName !== 'string') continue
        if (!PROMPTS.includes(data.promptName as PromptName)) continue
        const relParts = path.relative(runsDir, absPath).split(path.sep)
        found.push({
          absPath,
          relPath: path.posix.join('runs', ...relParts),
          batchKey: batch,
          modelId: data.modelId,
          promptName: data.promptName,
          complete: replyComplete(data as { response?: string | null }),
        })
      }
    }
  }
  return found
}

function rankAgainst(next: Candidate, current: Candidate): number {
  const numeric: Array<[number, number]> = [
    [next.complete ? 1 : 0, current.complete ? 1 : 0],
    [
      next.rollupStatus && next.rollupStatus !== 'incomplete' ? 1 : 0,
      current.rollupStatus && current.rollupStatus !== 'incomplete' ? 1 : 0,
    ],
    [next.fromRollup ? 1 : 0, current.fromRollup ? 1 : 0],
  ]
  for (const [left, right] of numeric) {
    if (left !== right) return left - right
  }
  const overlay = next.overlayKey.localeCompare(current.overlayKey)
  if (overlay !== 0) return overlay
  return next.relPath.localeCompare(current.relPath)
}

function betterCandidate(next: Candidate, current: Candidate | undefined): boolean {
  if (!current) return true
  return rankAgainst(next, current) > 0
}

function statusFor(candidate: Candidate): CellStatus {
  if (!candidate.complete) return 'incomplete'
  if (candidate.rollupStatus && candidate.rollupStatus !== 'incomplete') return candidate.rollupStatus
  if (candidate.resultsStatus && candidate.resultsStatus !== 'incomplete') return candidate.resultsStatus
  return 'incomplete'
}

export function buildCoverage(harnessRoot: string): CoverageManifest {
  const registryPath = path.join(harnessRoot, '../backend/data/models_registry.json')
  const registry = readJson(registryPath) as Registry
  return buildCoverageFrom(harnessRoot, registry)
}

export function buildCoverageFrom(harnessRoot: string, registry: Registry): CoverageManifest {
  const runsDir = path.join(harnessRoot, 'runs')
  const allowlist = loadAllowlist(harnessRoot)
  const models = listRegistryModels(registry)
  const imageModels = models.filter(isImageOnlyModel).map(model => model.id).sort()
  const text = models.filter(model => !isImageOnlyModel(model)).sort((a, b) => a.id.localeCompare(b.id))

  const resultsIndex = indexResults(runsDir)
  const byKey = new Map<string, Candidate>()

  for (const cell of loadRollupCells(runsDir)) {
    if (!cell.modelId || !cell.promptName) continue
    if (!PROMPTS.includes(cell.promptName as PromptName)) continue
    const resolved = resolveRollupReply(runsDir, cell)
    if (!resolved) continue
    const data = readJson(resolved.absPath) as { response?: string | null }
    const baseName = path.posix.basename(resolved.relPath)
    const candidate: Candidate = {
      absPath: resolved.absPath,
      relPath: resolved.relPath,
      batchKey: resolved.batchKey,
      modelId: cell.modelId,
      promptName: cell.promptName,
      complete: replyComplete(data),
      overlayKey: cell.overlayKey,
      fromRollup: true,
      rollupStatus: asCellStatus(cell.validationStatus),
      resultsStatus:
        resultsIndex.get(`${cell.modelId}::${cell.promptName}::${baseName}`) ||
        resultsIndex.get(`${cell.modelId}::${cell.promptName}`) ||
        null,
    }
    const key = `${candidate.modelId}::${candidate.promptName}`
    if (betterCandidate(candidate, byKey.get(key))) byKey.set(key, candidate)
  }

  for (const file of scanReplyFiles(runsDir)) {
    const baseName = path.posix.basename(file.relPath)
    const candidate: Candidate = {
      ...file,
      overlayKey: file.batchKey,
      fromRollup: false,
      rollupStatus: null,
      resultsStatus:
        resultsIndex.get(`${file.modelId}::${file.promptName}::${baseName}`) ||
        resultsIndex.get(`${file.modelId}::${file.promptName}`) ||
        null,
    }
    const key = `${candidate.modelId}::${candidate.promptName}`
    if (betterCandidate(candidate, byKey.get(key))) byKey.set(key, candidate)
  }

  const manifestModels: CoverageManifest['models'] = {}
  const totals = {
    registryModels: models.length,
    textModels: text.length,
    imageModels: imageModels.length,
    allowlisted: allowlist.length,
    cells: 0,
    pass: 0,
    notCovered: 0,
    fail: 0,
    incomplete: 0,
    sourceIssue: 0,
    missing: 0,
  }

  for (const model of text) {
    const prompts: Record<string, PromptCell> = {}
    for (const promptName of PROMPTS) {
      const candidate = byKey.get(`${model.id}::${promptName}`)
      const cell: PromptCell = candidate
        ? { status: statusFor(candidate), replyPath: candidate.relPath }
        : { status: 'incomplete', replyPath: null }
      prompts[promptName] = cell
      totals.cells += 1
      if (!cell.replyPath) totals.missing += 1
      if (cell.status === 'pass') totals.pass += 1
      else if (cell.status === 'not-covered') totals.notCovered += 1
      else if (cell.status === 'fail') totals.fail += 1
      else if (cell.status === 'source-issue') totals.sourceIssue += 1
      else totals.incomplete += 1
    }
    manifestModels[model.id] = prompts
  }

  return {
    version: 1,
    imageOnlyRule: IMAGE_ONLY_RULE,
    prompts: [...PROMPTS],
    excludedImageModels: imageModels,
    allowlist,
    models: manifestModels,
    totals,
  }
}

function fileIsCompleteReply(harnessRoot: string, replyPath: string | null): boolean {
  if (!replyPath) return false
  const absPath = path.join(harnessRoot, replyPath)
  if (!fs.existsSync(absPath)) return false
  try {
    const data = readJson(absPath) as { response?: string | null }
    return replyComplete(data)
  } catch {
    return false
  }
}

export function evaluateCoverage(opts: {
  registry: Registry
  manifest: CoverageManifest
  harnessRoot: string
  allowlist?: AllowEntry[]
}): GateResult {
  const allow = new Set((opts.allowlist || opts.manifest.allowlist || []).map(entry => entry.modelId))
  const missingModels: GateProblem[] = []
  const badCells: GateProblem[] = []

  for (const model of textModels(opts.registry)) {
    if (allow.has(model.id)) continue
    const row = opts.manifest.models[model.id]
    if (!row) {
      missingModels.push({
        modelId: model.id,
        detail: `no coverage row; missing ${PROMPTS.join(', ')}`,
      })
      continue
    }
    const missingPrompts: string[] = []
    for (const promptName of PROMPTS) {
      const cell = row[promptName]
      if (!cell || !cell.replyPath || !fs.existsSync(path.join(opts.harnessRoot, cell.replyPath))) {
        missingPrompts.push(promptName)
        continue
      }
      const complete = fileIsCompleteReply(opts.harnessRoot, cell.replyPath)
      const status = !complete ? 'incomplete' : cell.status
      if (!ALLOWED_STATUSES.has(status)) {
        badCells.push({
          modelId: model.id,
          promptName,
          status,
          replyPath: cell.replyPath,
          detail: status,
        })
      }
    }
    if (missingPrompts.length > 0) {
      missingModels.push({
        modelId: model.id,
        detail: `missing ${missingPrompts.join(', ')}`,
      })
    }
  }

  return {
    ok: missingModels.length === 0 && badCells.length === 0,
    missingModels,
    badCells,
  }
}

export function modelsNewVersusBase(baseRegistry: Registry, headRegistry: Registry): string[] {
  const baseIds = new Set(textModels(baseRegistry).map(model => model.id))
  return textModels(headRegistry)
    .map(model => model.id)
    .filter(id => !baseIds.has(id))
    .sort()
}

export function stableManifest(manifest: CoverageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
