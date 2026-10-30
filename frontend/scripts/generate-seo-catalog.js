#!/usr/bin/env node
/**
 * Build-time SEO catalog generator.
 *
 * Merges backend/data/models_registry.json (names, descriptions, capability flags)
 * with the OpenRouter spec snapshot at src/data/seo/modelDataSnapshot.json.
 * Writes src/data/generated/seoCatalog.json, which pageMetadata, prerender,
 * sitemap, and the /models pages all consume.
 *
 * When the registry is not available (frontend-only Docker context without the
 * registry build context), the snapshot's registry fields are used as a fallback.
 *
 * Usage: node scripts/generate-seo-catalog.js
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import {
  buildCompareAppHref,
  buildComparePathFromIds,
  buildModelPath,
  modelIdToSlug,
} from './lib/modelSlug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const REPO_ROOT = join(FRONTEND_ROOT, '..')

const FEATURED_PATH = join(FRONTEND_ROOT, 'src/data/seo/featuredModels.json')
const SNAPSHOT_PATH = join(FRONTEND_ROOT, 'src/data/seo/modelDataSnapshot.json')
const OUTPUT_PATH = join(FRONTEND_ROOT, 'src/data/generated/seoCatalog.json')

const REGISTRY_CANDIDATES = [
  process.env.SEO_REGISTRY_PATH,
  join(REPO_ROOT, 'backend/data/models_registry.json'),
  '/data/models_registry.json',
].filter(Boolean)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function findRegistryPath() {
  return REGISTRY_CANDIDATES.find(candidate => existsSync(candidate)) || null
}

function flattenRegistry(registry) {
  const byId = new Map()
  const byProvider = registry.models_by_provider || {}
  for (const [provider, models] of Object.entries(byProvider)) {
    for (const model of models) {
      byId.set(model.id, { ...model, provider: model.provider || provider })
    }
  }
  return byId
}

function formatTokenCount(value) {
  if (value == null || Number.isNaN(Number(value))) return null
  const n = Number(value)
  if (n >= 1_000_000) {
    const millions = n / 1_000_000
    const formatted = Number.isInteger(millions) ? String(millions) : millions.toFixed(2).replace(/\.?0+$/, '')
    return `${formatted}M tokens`
  }
  if (n >= 1_000) {
    const thousands = n / 1_000
    const formatted = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/, '')
    return `${formatted}K tokens`
  }
  return `${n} tokens`
}

function formatPricePerMillion(value) {
  if (value == null || Number.isNaN(Number(value))) return null
  const n = Number(value)
  if (n >= 1) return `$${n.toFixed(2)} / 1M tokens`
  const fixed = n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `$${fixed} / 1M tokens`
}

function formatModalities(values) {
  if (!Array.isArray(values) || values.length === 0) return null
  return values
    .filter(Boolean)
    .map(v => String(v))
    .sort()
    .join(', ')
}

function formatFlag(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return null
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function buildSpecRows(merged) {
  const rows = [
    { key: 'context', label: 'Context window', value: formatTokenCount(merged.context_length) },
    { key: 'maxOutput', label: 'Max output', value: formatTokenCount(merged.max_completion_tokens) },
    {
      key: 'inputModalities',
      label: 'Input modalities',
      value: formatModalities(merged.input_modalities),
    },
    {
      key: 'outputModalities',
      label: 'Output modalities',
      value: formatModalities(merged.output_modalities),
    },
    {
      key: 'priceIn',
      label: 'Price (input)',
      value: formatPricePerMillion(merged.price_input_usd_per_mtok),
    },
    {
      key: 'priceOut',
      label: 'Price (output)',
      value: formatPricePerMillion(merged.price_output_usd_per_mtok),
    },
    {
      key: 'knowledgeCutoff',
      label: 'Knowledge cutoff',
      value: merged.knowledge_cutoff || null,
    },
    { key: 'webSearch', label: 'Web search', value: formatFlag(merged.supports_web_search) },
    { key: 'vision', label: 'Vision', value: formatFlag(merged.supports_vision) },
    { key: 'thinking', label: 'Thinking', value: formatFlag(merged.is_thinking_model) },
  ]
  return rows.filter(row => row.value != null && String(row.value).trim() !== '')
}

function metaDescription(displayName, provider, summary) {
  const firstSentence = summary.split(/(?<=\.)\s/)[0] || summary
  const trimmed = firstSentence.length > 155 ? `${firstSentence.slice(0, 152).trim()}…` : firstSentence
  if (trimmed.toLowerCase().includes(displayName.toLowerCase())) return trimmed
  return `Compare ${displayName} by ${provider} side by side on CompareIntel. ${trimmed}`
}

function buildPageMetadata(model) {
  const path = buildModelPath(model.slug)
  const h1 = `${model.displayName} by ${model.provider}`
  return {
    path,
    title: `${model.displayName} by ${model.provider} - CompareIntel`,
    description: metaDescription(model.displayName, model.provider, model.summary),
    h1,
    priority: 0.8,
    changefreq: 'weekly',
  }
}

function relatedModels(featured, current, comparePairs) {
  const byId = new Map(featured.map(model => [model.id, model]))
  const sameProvider = featured
    .filter(model => model.id !== current.id && model.provider === current.provider)
    .map(model => model.id)
  const pairPartners = comparePairs
    .filter(pair => pair.a === current.id || pair.b === current.id)
    .map(pair => (pair.a === current.id ? pair.b : pair.a))
    .filter(id => byId.has(id))
  const orderedIds = unique([...sameProvider, ...pairPartners, ...featured.map(model => model.id)])
    .filter(id => id !== current.id)
    .slice(0, 4)
  return orderedIds.map(id => {
    const model = byId.get(id)
    return {
      id: model.id,
      slug: model.slug,
      name: model.displayName,
      provider: model.provider,
      path: buildModelPath(model.slug),
    }
  })
}

function loadRegistryModels() {
  const registryPath = findRegistryPath()
  if (!registryPath) {
    console.log('⚠️  Model registry not found; using snapshot registry fields')
    return { byId: null, path: null }
  }
  console.log(`📖 Registry: ${registryPath}`)
  return { byId: flattenRegistry(readJson(registryPath)), path: registryPath }
}

function mergeModel(featured, snapshotById, registryById) {
  const snapshot = snapshotById.get(featured.id) || {}
  const registry = registryById?.get(featured.id)
  if (registryById && !registry) {
    throw new Error(
      `Featured model ${featured.id} is missing from models_registry.json. ` +
        `Update featuredModels.json or add the model to the registry.`
    )
  }

  const supportsVision =
    registry?.supports_vision_probed ?? snapshot.supports_vision ?? registry?.supports_vision ?? null

  const name = featured.displayName || registry?.name || snapshot.name
  const provider = registry?.provider || snapshot.provider
  const slug = modelIdToSlug(featured.id)

  return {
    id: featured.id,
    slug,
    displayName: name,
    provider,
    category: registry?.category || snapshot.category || null,
    summary: featured.summary,
    descriptionRegistry: registry?.description || snapshot.description_registry || null,
    knowledge_cutoff: registry?.knowledge_cutoff ?? snapshot.knowledge_cutoff ?? null,
    supports_web_search: registry?.supports_web_search ?? snapshot.supports_web_search ?? null,
    supports_vision: supportsVision,
    supports_image_generation:
      registry?.supports_image_generation ?? snapshot.supports_image_generation ?? null,
    is_thinking_model: registry?.is_thinking_model ?? snapshot.is_thinking_model ?? null,
    context_length: snapshot.context_length ?? null,
    max_completion_tokens: snapshot.max_completion_tokens ?? null,
    input_modalities: snapshot.input_modalities ?? null,
    output_modalities: snapshot.output_modalities ?? null,
    price_input_usd_per_mtok: snapshot.price_input_usd_per_mtok ?? null,
    price_output_usd_per_mtok: snapshot.price_output_usd_per_mtok ?? null,
    openrouter_url: snapshot.openrouter_url ?? null,
    in_openrouter: snapshot.in_openrouter ?? null,
    snapshotGenerated: snapshot.openrouter_created ?? null,
    compareHref: buildCompareAppHref(featured.id),
  }
}

function generate() {
  const featuredConfig = readJson(FEATURED_PATH)
  const snapshot = readJson(SNAPSHOT_PATH)
  const skipIds = new Set(featuredConfig.skipIds || [])
  const { byId: registryById, path: registryPath } = loadRegistryModels()

  for (const skipId of skipIds) {
    if (featuredConfig.models.some(model => model.id === skipId)) {
      throw new Error(`Featured model ${skipId} is in the skip list`)
    }
  }

  const snapshotById = new Map((snapshot.models || []).map(model => [model.id, model]))

  const mergedModels = featuredConfig.models.map(featured => {
    if (skipIds.has(featured.id)) {
      throw new Error(`Refusing to generate a page for skipped model ${featured.id}`)
    }
    return mergeModel(featured, snapshotById, registryById)
  })

  const comparePairs = (snapshot.compare_pairs || [])
    .filter(pair => !skipIds.has(pair.a) && !skipIds.has(pair.b))
    .map(pair => ({
      a: pair.a,
      b: pair.b,
      path: pair.path || buildComparePathFromIds(pair.a, pair.b),
      reason: pair.reason || null,
    }))

  const models = mergedModels.map(model => {
    const page = buildPageMetadata(model)
    const specRows = buildSpecRows(model)
    return {
      id: model.id,
      slug: model.slug,
      name: model.displayName,
      provider: model.provider,
      category: model.category,
      summary: model.summary,
      path: page.path,
      compareHref: model.compareHref,
      specRows,
      page,
      related: [],
      source: {
        registry: Boolean(registryPath),
        openrouterSnapshot: snapshot.generated || null,
        openrouterUrl: model.openrouter_url,
      },
    }
  })

  for (const model of models) {
    model.related = relatedModels(mergedModels, mergedModels.find(m => m.id === model.id), comparePairs)
  }

  const indexPage = {
    path: '/models',
    title: 'AI Models - CompareIntel',
    description:
      'Browse high-interest AI models on CompareIntel, grouped by provider. Open a model page for specs, then compare it side by side with GPT-5.5, Claude, Gemini, and more.',
    h1: 'AI Models on CompareIntel',
    priority: 0.9,
    changefreq: 'weekly',
  }

  const catalog = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: {
      registry: registryPath ? 'backend/data/models_registry.json' : 'snapshot (registry unavailable at build)',
      snapshot: 'frontend/src/data/seo/modelDataSnapshot.json',
      snapshotDate: snapshot.generated || null,
    },
    skipIds: [...skipIds],
    index: indexPage,
    models,
    comparePairs,
    modelsBySlug: Object.fromEntries(models.map(model => [model.slug, model.id])),
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8')

  console.log(`✅ SEO catalog written: ${OUTPUT_PATH}`)
  console.log(`   Featured models: ${models.length}`)
  console.log(`   Compare pairs (data layer only): ${comparePairs.length}`)
  for (const model of models) {
    console.log(`   - /models/${model.slug} (${model.name})`)
  }
}

try {
  generate()
} catch (error) {
  console.error('❌ Failed to generate SEO catalog:', error.message)
  process.exit(1)
}
